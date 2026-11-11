"""Client-approved Project Scope baselines and controlled change requests.

Scope is financial *context*, never an invoice. All scope agreements require
a real client reviewer. Work and delivery lifecycle remain independent.
"""
from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.permissions import CLIENT_ROLES, IsTenantUser

from .activity import record_activity
from .delivery import ensure_delivery_unlocked
from .models import (
    Project, ProjectMember, ProjectScopeChangeRequest,
    ProjectScopeProposal, ProjectScopeVersion,
)
from .permissions import can_edit_work, can_manage_project, visible_projects
from .views import _save_validated


CURRENCIES = ('USD', 'EUR', 'GBP', 'CAD', 'AUD', 'BDT')


class ScopePayloadSerializer(serializers.Serializer):
    title = serializers.CharField(min_length=5, max_length=200)
    requirements = serializers.CharField(min_length=15, max_length=20000)
    deliverables = serializers.ListField(
        child=serializers.CharField(min_length=3, max_length=500),
        min_length=1, max_length=50, allow_empty=False,
    )
    acceptance_criteria = serializers.ListField(
        child=serializers.CharField(min_length=3, max_length=500),
        min_length=1, max_length=50, allow_empty=False,
    )
    exclusions = serializers.CharField(
        max_length=10000, required=False, allow_blank=True, default='',
    )
    budget_estimate = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, allow_null=True,
        min_value=0, default=None,
    )
    budget_currency = serializers.ChoiceField(choices=CURRENCIES, default='USD')
    target_date = serializers.DateField(required=False, allow_null=True, default=None)
    cost_impact = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, allow_null=True, default=None,
    )
    change_request_id = serializers.UUIDField(required=False, allow_null=True)


class ScopeDecisionSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=['approved', 'changes_requested', 'rejected'])
    feedback = serializers.CharField(max_length=5000, allow_blank=True, required=False, default='')

    def validate(self, values):
        if values['decision'] in ('changes_requested', 'rejected') and not values['feedback'].strip():
            raise serializers.ValidationError({'feedback': 'Explain the requested changes or rejection.'})
        return values


class ChangeRequestSerializer(serializers.Serializer):
    title = serializers.CharField(min_length=5, max_length=200)
    requested_changes = serializers.CharField(min_length=15, max_length=12000)
    reason = serializers.CharField(max_length=5000, allow_blank=True, required=False, default='')


class ChangeReviewSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=['under_review', 'rejected'])
    review_note = serializers.CharField(max_length=5000, allow_blank=True, required=False, default='')

    def validate(self, values):
        if values['decision'] == 'rejected' and not values['review_note'].strip():
            raise serializers.ValidationError({'review_note': 'Explain why the request was rejected.'})
        return values


def _project(request, pk):
    return get_object_or_404(visible_projects(request), pk=pk)


def _manager(request, project):
    if not can_manage_project(request.user, project):
        raise PermissionDenied('Only a Project Manager can submit or review scope changes.')


def _client_reviewer(request, project):
    if request.user.role not in CLIENT_ROLES or not project.members.filter(
        user=request.user, role='client_reviewer',
    ).exists():
        raise PermissionDenied('A Client Reviewer must approve the agreed Project Scope.')


def _unlocked(project):
    ensure_delivery_unlocked(project)


def _scope_payload(obj):
    return {
        'id': str(obj.id),
        'title': obj.title,
        'requirements': obj.requirements,
        'deliverables': obj.deliverables,
        'acceptance_criteria': obj.acceptance_criteria,
        'exclusions': obj.exclusions,
        'budget_estimate': str(obj.budget_estimate) if obj.budget_estimate is not None else None,
        'budget_currency': obj.budget_currency,
        'target_date': obj.target_date,
        'cost_impact': str(obj.cost_impact) if obj.cost_impact is not None else None,
    }


def _proposal_payload(proposal):
    return {
        **_scope_payload(proposal),
        'status': proposal.status,
        'change_request_id': str(proposal.change_request_id) if proposal.change_request_id else None,
        'proposed_by': proposal.proposed_by.full_name if proposal.proposed_by else None,
        'proposed_at': proposal.proposed_at,
        'decided_by': proposal.decided_by.full_name if proposal.decided_by else None,
        'decided_at': proposal.decided_at,
        'client_feedback': proposal.client_feedback,
    }


def _version_payload(version):
    return {
        **_scope_payload(version),
        'number': version.number,
        'proposal_id': str(version.proposal_id),
        'change_request_id': (
            str(version.proposal.change_request_id)
            if version.proposal.change_request_id else None
        ),
        'approved_by': version.approved_by.full_name if version.approved_by else None,
        'approved_at': version.approved_at,
    }


def _change_payload(row, *, is_manager=False):
    return {
        'id': str(row.id),
        'title': row.title,
        'requested_changes': row.requested_changes,
        'reason': row.reason,
        'status': row.status,
        'requested_by': row.requested_by.full_name if row.requested_by else None,
        'reviewed_by': row.reviewed_by.full_name if row.reviewed_by else None,
        'review_note': (
            row.review_note if is_manager or row.status in ('rejected', 'approved') else ''
        ),
        'created_at': row.created_at,
        'updated_at': row.updated_at,
    }


class ProjectScopeView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request, pk):
        project = _project(request, pk)
        versions = list(project.scope_versions.select_related(
            'proposal', 'approved_by',
        ).all())
        proposals = list(project.scope_proposals.select_related(
            'change_request', 'proposed_by', 'decided_by',
        ).all()[:40])
        changes = list(project.scope_change_requests.select_related(
            'requested_by', 'reviewed_by',
        ).all()[:100])
        is_manager = can_manage_project(request.user, project)
        return Response({
            'current_version': _version_payload(versions[0]) if versions else None,
            'versions': [_version_payload(v) for v in versions],
            'pending_proposal': next(
                (_proposal_payload(p) for p in proposals if p.status == 'pending_client'), None,
            ),
            'proposals': [_proposal_payload(p) for p in proposals],
            'change_requests': [_change_payload(c, is_manager=is_manager) for c in changes],
            'can_manage': is_manager,
            'can_request_change': can_edit_work(request.user, project) or
                                  request.user.role in CLIENT_ROLES,
            'can_review': request.user.role in CLIENT_ROLES and project.members.filter(
                user=request.user, role='client_reviewer',
            ).exists(),
        })


class ProjectScopeProposalsView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def post(self, request, pk):
        project = _project(request, pk)
        _manager(request, project)
        data = ScopePayloadSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        attrs = data.validated_data.copy()
        change_id = attrs.pop('change_request_id', None)

        with transaction.atomic():
            project = Project.objects.select_for_update().get(pk=project.pk)
            _unlocked(project)
            if ProjectScopeProposal.objects.filter(project=project, status='pending_client').exists():
                raise ValidationError({'detail': 'A Scope Proposal already awaits Client Approval.'})
            if project.visibility != 'client':
                raise ValidationError({
                    'detail': 'Make the Project Client Visible before submitting Scope for approval.'
                })
            if not ProjectMember.objects.filter(
                project=project, role='client_reviewer', user__is_active=True,
                user__client_org=project.client_org,
            ).exists():
                raise ValidationError({'detail': 'Add an active Client Reviewer before sending Scope.'})

            current = project.scope_versions.first()
            change = None
            if current is not None and not change_id:
                raise ValidationError({
                    'change_request_id': 'Create and review a Scope Change Request first.'
                })
            if current is None and change_id:
                raise ValidationError({
                    'change_request_id': 'Approve the initial Project Scope first.'
                })
            if change_id:
                change = get_object_or_404(
                    ProjectScopeChangeRequest.objects.select_for_update(),
                    pk=change_id, project=project,
                )
                if change.status not in ('under_review', 'changes_requested'):
                    raise ValidationError({
                        'change_request_id': 'This Change Request must be under manager review.'
                    })
                # A change may specify an estimate, but no invoice is generated.
                if attrs.get('cost_impact') is None:
                    raise ValidationError({'cost_impact': 'Provide the estimated cost impact, even if zero.'})
            elif attrs.get('cost_impact') is not None:
                raise ValidationError({'cost_impact': 'Cost impact applies only to Scope Change Requests.'})
            proposal = _save_validated(ProjectScopeProposal(
                project=project, change_request=change, proposed_by=request.user,
                **attrs,
            ))
            if change:
                change.status = 'awaiting_client'
                change.reviewed_by = request.user
                _save_validated(change)
            record_activity(
                project, kind='scope_proposed', actor=request.user,
                summary='A Project Scope proposal awaits Client Approval',
                visibility='client' if project.visibility == 'client' else 'internal',
            )
        return Response(_proposal_payload(proposal), status=status.HTTP_201_CREATED)


class ProjectScopeDecisionView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def post(self, request, pk, proposal_id):
        project = _project(request, pk)
        _client_reviewer(request, project)
        data = ScopeDecisionSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        decision = data.validated_data['decision']
        feedback = data.validated_data['feedback'].strip()

        with transaction.atomic():
            project = Project.objects.select_for_update().get(pk=project.pk)
            _unlocked(project)
            proposal = get_object_or_404(
                ProjectScopeProposal.objects.select_for_update().filter(project=project),
                pk=proposal_id,
            )
            if proposal.status != 'pending_client':
                raise ValidationError({'detail': 'This Scope Proposal was already decided.'})
            change = None
            if proposal.change_request_id:
                change = get_object_or_404(
                    ProjectScopeChangeRequest.objects.select_for_update(),
                    pk=proposal.change_request_id, project=project, status='awaiting_client',
                )
            proposal.status = decision
            proposal.client_feedback = feedback
            proposal.decided_by = request.user
            proposal.decided_at = timezone.now()
            _save_validated(proposal)

            approved_version = None
            if decision == 'approved':
                number = (project.scope_versions.order_by('-number')
                          .values_list('number', flat=True).first() or 0) + 1
                approved_version = _save_validated(ProjectScopeVersion(
                    project=project, proposal=proposal, number=number,
                    title=proposal.title, requirements=proposal.requirements,
                    deliverables=list(proposal.deliverables),
                    acceptance_criteria=list(proposal.acceptance_criteria),
                    exclusions=proposal.exclusions,
                    budget_estimate=proposal.budget_estimate,
                    budget_currency=proposal.budget_currency,
                    target_date=proposal.target_date,
                    cost_impact=proposal.cost_impact,
                    approved_by=request.user,
                ))
            if change:
                change.status = (
                    'approved' if decision == 'approved' else
                    'changes_requested' if decision == 'changes_requested' else 'rejected'
                )
                _save_validated(change)
            event_kind = (
                'scope_approved' if decision == 'approved' else
                'scope_changes_requested' if decision == 'changes_requested'
                else 'scope_rejected'
            )
            record_activity(
                project, kind=event_kind, actor=request.user,
                summary=(
                    f'Project Scope version {approved_version.number} approved by Client'
                    if approved_version else
                    'Client requested changes to Project Scope'
                    if decision == 'changes_requested' else 'Client rejected Project Scope proposal'
                ), visibility='client' if project.visibility == 'client' else 'internal',
            )
        return Response({
            'proposal': _proposal_payload(proposal),
            'approved_version': _version_payload(approved_version) if approved_version else None,
        })


class ProjectScopeChangeRequestsView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def post(self, request, pk):
        project = _project(request, pk)
        allowed = can_edit_work(request.user, project) or request.user.role in CLIENT_ROLES
        if not allowed:
            raise PermissionDenied('Project membership is required to request Scope Changes.')
        data = ChangeRequestSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        with transaction.atomic():
            project = Project.objects.select_for_update().get(pk=project.pk)
            _unlocked(project)
            if not project.scope_versions.exists():
                raise ValidationError({
                    'detail': 'Initial Project Scope must be approved before requesting changes.'
                })
            row = _save_validated(ProjectScopeChangeRequest(
                project=project, requested_by=request.user, **data.validated_data,
            ))
            record_activity(
                project, kind='scope_change_requested', actor=request.user,
                summary='A new Scope Change Request was submitted',
                visibility='client' if project.visibility == 'client' else 'internal',
            )
        return Response(
            _change_payload(row, is_manager=can_manage_project(request.user, project)),
            status=status.HTTP_201_CREATED,
        )


class ProjectScopeChangeReviewView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def post(self, request, pk, change_id):
        project = _project(request, pk)
        _manager(request, project)
        data = ChangeReviewSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        with transaction.atomic():
            project = Project.objects.select_for_update().get(pk=project.pk)
            _unlocked(project)
            row = get_object_or_404(
                ProjectScopeChangeRequest.objects.select_for_update(),
                project=project, pk=change_id,
            )
            if row.status not in ('submitted', 'under_review', 'changes_requested'):
                raise ValidationError({'detail': 'Change Request is no longer available for review.'})
            row.status = data.validated_data['decision']
            row.review_note = data.validated_data['review_note'].strip()
            row.reviewed_by = request.user
            _save_validated(row)
            record_activity(
                project, kind='scope_change_reviewed', actor=request.user,
                summary='Scope Change Request reviewed by Project Manager',
                visibility='client' if project.visibility == 'client' else 'internal',
            )
        return Response(_change_payload(row, is_manager=True))

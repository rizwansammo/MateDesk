"""Controlled Project Delivery: submit, client decision, staff completion and archive.

Unlike normal Project Settings, delivery transitions require an authorized
client reviewer and are always audited. Every round is retained.
"""
from django.db import transaction
from django.db.models import Max
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.permissions import CLIENT_ROLES, MSP_ROLES, IsTenantUser

from .activity import record_activity
from .models import Project, ProjectDeliveryReview, ProjectMember, WorkItem, ProjectDocument
from .permissions import can_manage_project, visible_projects
from .views import _save_validated


class SubmitDeliverySerializer(serializers.Serializer):
    summary = serializers.CharField(max_length=10000, trim_whitespace=True)
    delivery_url = serializers.URLField(max_length=2000, required=False, allow_blank=True, default='')

    def validate_summary(self, value):
        if len(value.strip()) < 15:
            raise serializers.ValidationError('Describe what was delivered (minimum 15 characters).')
        return value.strip()


class DeliveryDecisionSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=['approved', 'changes_requested'])
    feedback = serializers.CharField(max_length=5000, required=False, allow_blank=True, default='')

    def validate(self, attrs):
        if attrs['decision'] == 'changes_requested' and not attrs['feedback'].strip():
            raise serializers.ValidationError({'feedback': 'Explain the requested changes.'})
        return attrs


class CompletionNoteSerializer(serializers.Serializer):
    note = serializers.CharField(max_length=1000, required=False, allow_blank=True, default='')


def latest_review(project):
    return project.delivery_reviews.select_related('submitted_by', 'reviewed_by').first()


def check_delivery_readiness(project, *, allow_empty=False):
    """Rechecked in locked transaction for submission and final completion."""
    work_items = WorkItem.objects.filter(project=project)
    total = work_items.count()
    done = work_items.filter(status='done').count()
    cancelled = work_items.filter(status='cancelled').count()
    unfinished = total - done - cancelled
    milestones = project.milestones.all()
    incomplete_milestones = milestones.exclude(status='completed').count()
    open_support = project.ticket_associations.filter(
        ticket__category='Project Support'
    ).exclude(ticket__status__in=('solved', 'closed')).count()
    missing_reviewers = not ProjectMember.objects.filter(
        project=project, role='client_reviewer',
        user__is_active=True, user__client_org=project.client_org,
    ).exists()
    blockers = []
    if not allow_empty and done == 0:
        blockers.append('At least one Work Item must be completed before delivery.')
    if unfinished:
        blockers.append(f'{unfinished} Work Items still need completion or cancellation.')
    if incomplete_milestones:
        blockers.append(f'{incomplete_milestones} Milestones are not completed.')
    if open_support:
        blockers.append(f'{open_support} Project Support Tickets remain unresolved.')
    if missing_reviewers:
        blockers.append('Add an active Client Reviewer before submitting delivery.')
    return {
        'work_items': total,
        'done': done,
        'cancelled': cancelled,
        'unfinished': unfinished,
        'milestones': milestones.count(),
        'incomplete_milestones': incomplete_milestones,
        'open_support_tickets': open_support,
        'has_client_reviewer': not missing_reviewers,
        'ready': not blockers,
        'blockers': blockers,
    }


def ensure_delivery_unlocked(project):
    if project.status in ('completed', 'archived'):
        raise ValidationError({'detail': 'Reopen the Project before modifying delivery work.'})
    latest = latest_review(project)
    if latest and latest.status in ('pending', 'approved'):
        raise ValidationError({
            'detail': 'Delivery is awaiting Client Review or completion. Request changes before editing.'
        })


def review_is_stale(project, review):
    if review is None or review.status != 'approved':
        return False
    approved_at = review.reviewed_at
    return bool(
        (project.reopened_at and approved_at <= project.reopened_at)
        or project.work_items.filter(updated_at__gt=approved_at).exists()
        or project.milestones.filter(updated_at__gt=approved_at).exists()
    )


def serialize_review(review):
    if review is None:
        return None
    return {
        'id': str(review.id),
        'round_number': review.round_number,
        'status': review.status,
        'summary': review.summary,
        'delivery_url': review.delivery_url,
        'submitted_by': review.submitted_by.full_name if review.submitted_by else None,
        'reviewed_by': review.reviewed_by.full_name if review.reviewed_by else None,
        'feedback': review.feedback,
        'submitted_at': review.submitted_at,
        'reviewed_at': review.reviewed_at,
    }


def _project_for_user(request, pk):
    return get_object_or_404(visible_projects(request), pk=pk)


def _require_manager(user, project):
    if not can_manage_project(user, project):
        raise PermissionDenied('Only the Project Manager or MSP Owner/Manager can manage delivery.')


def _require_reviewer(user, project):
    if user.role not in CLIENT_ROLES or not project.members.filter(
        user=user, role='client_reviewer'
    ).exists() or project.visibility != 'client' or not project.client_org.is_active:
        raise PermissionDenied('An active Client Reviewer must approve this delivery.')


class ProjectDeliveryView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request, pk):
        project = _project_for_user(request, pk)
        recent = list(project.delivery_reviews.select_related(
            'submitted_by', 'reviewed_by'
        ).order_by('-round_number')[:20])
        ready = check_delivery_readiness(project) if request.user.role in MSP_ROLES else None
        return Response({
            'project_id': str(project.id),
            'project_status': project.status,
            'completed_at': project.completed_at,
            'archived_at': project.archived_at,
            'latest': serialize_review(recent[0]) if recent else None,
            'history': [serialize_review(item) for item in recent],
            'has_more': project.delivery_reviews.count() > len(recent),
            'readiness': ready,
            'can_submit': can_manage_project(request.user, project),
            'review_requires_resubmission': review_is_stale(project, recent[0]) if recent else False,
            'can_review': bool(request.user.role in CLIENT_ROLES and project.visibility == 'client'
                               and project.members.filter(user=request.user, role='client_reviewer').exists()),
        })


class ProjectDeliverySubmitView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def post(self, request, pk):
        project = _project_for_user(request, pk)
        _require_manager(request.user, project)
        data = SubmitDeliverySerializer(data=request.data)
        data.is_valid(raise_exception=True)
        with transaction.atomic():
            locked = Project.objects.select_for_update().get(pk=project.pk)
            if locked.status not in ('active',):
                raise ValidationError({'detail': 'Only an Active Project can be submitted for Client Review.'})
            if locked.visibility != 'client' or not locked.client_org.is_active:
                raise ValidationError({'detail': 'Publish this Project to an active Client Organization.'})
            current = latest_review(locked)
            if current and current.status == 'pending':
                raise ValidationError({'detail': 'This Project is already awaiting Client Review.'})
            if current and current.status == 'approved' and not review_is_stale(locked, current):
                raise ValidationError({
                    'detail': 'This delivery is already approved. Complete the Project.'
                })
            readiness = check_delivery_readiness(locked)
            if not readiness['ready']:
                raise ValidationError({'blockers': readiness['blockers']})
            next_round = current.round_number + 1 if current else 1
            review = ProjectDeliveryReview(
                project=locked, round_number=next_round,
                summary=data.validated_data['summary'],
                delivery_url=data.validated_data.get('delivery_url', ''),
                submitted_by=request.user,
            )
            _save_validated(review)
            # Snapshot each draft Delivery File into this immutable review round.
            # Future revisions must be uploaded as new draft files for the next round.
            ProjectDocument.objects.filter(
                project=locked, category='delivery', delivery_review__isnull=True,
                archived_at__isnull=True,
            ).update(delivery_review=review)
            record_activity(
                locked, kind='delivery_submitted', actor=request.user,
                summary=f'Delivery round {next_round} submitted for Client Review',
                visibility='client',
            )
        return Response(serialize_review(review), status=status.HTTP_201_CREATED)


class ProjectDeliveryDecisionView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def post(self, request, pk):
        project = _project_for_user(request, pk)
        _require_reviewer(request.user, project)
        data = DeliveryDecisionSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        decision = data.validated_data['decision']
        with transaction.atomic():
            locked = Project.objects.select_for_update().get(pk=project.pk)
            if locked.status != 'active':
                raise ValidationError({'detail': 'This Project is not awaiting Client Review.'})
            review = latest_review(locked)
            if review is None or review.status != 'pending':
                raise ValidationError({'detail': 'There is no pending Delivery Review.'})
            if decision == 'approved':
                readiness = check_delivery_readiness(locked)
                if not readiness['ready']:
                    raise ValidationError({'blockers': readiness['blockers']})
            review.status = decision
            review.reviewed_by = request.user
            review.reviewed_at = timezone.now()
            review.feedback = data.validated_data.get('feedback', '').strip()
            _save_validated(review)
            record_activity(
                locked,
                kind='delivery_approved' if decision == 'approved' else 'delivery_changes_requested',
                actor=request.user,
                summary=(f'Client approved delivery round {review.round_number}' if decision == 'approved'
                         else f'Client requested changes to delivery round {review.round_number}'),
                visibility='client',
            )
        return Response(serialize_review(review))


class ProjectDeliveryCompleteView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def post(self, request, pk):
        project = _project_for_user(request, pk)
        _require_manager(request.user, project)
        data = CompletionNoteSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        with transaction.atomic():
            locked = Project.objects.select_for_update().get(pk=project.pk)
            if locked.status != 'active':
                raise ValidationError({'detail': 'Only an Active Project can be completed.'})
            review = latest_review(locked)
            if review is None or review.status != 'approved':
                raise ValidationError({'detail': 'Client Approval is required before Project Completion.'})
            if locked.reopened_at and review.reviewed_at <= locked.reopened_at:
                raise ValidationError({'detail': 'Request fresh Client Approval after reopening.'})
            readiness = check_delivery_readiness(locked)
            if not readiness['ready']:
                raise ValidationError({'blockers': readiness['blockers']})
            approved_at = review.reviewed_at
            if locked.work_items.filter(updated_at__gt=approved_at).exists() or (
                locked.milestones.filter(updated_at__gt=approved_at).exists()
            ):
                raise ValidationError({'detail': 'Delivery work changed after approval. Client reapproval is required.'})
            locked.status = 'completed'
            locked.completed_at = timezone.now()
            _save_validated(locked)
            record_activity(
                locked, kind='project_completed', actor=request.user,
                summary='Project completed after Client Approval', visibility='client',
            )
        return Response({'status': locked.status, 'completed_at': locked.completed_at})


class ProjectDeliveryArchiveView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def post(self, request, pk):
        project = _project_for_user(request, pk)
        _require_manager(request.user, project)
        with transaction.atomic():
            locked = Project.objects.select_for_update().get(pk=project.pk)
            if locked.status != 'completed':
                raise ValidationError({'detail': 'Complete the Project before archiving.'})
            review = latest_review(locked)
            if not review or review.status != 'approved':
                raise ValidationError({'detail': 'Client Approved Delivery is required before archiving.'})
            blockers = check_delivery_readiness(locked)
            if blockers['open_support_tickets']:
                raise ValidationError({'detail': 'Resolve Project Support Tickets before archiving.'})
            locked.status = 'archived'
            locked.archived_at = timezone.now()
            _save_validated(locked)
            record_activity(
                locked, kind='project_archived', actor=request.user,
                summary='Project archived', visibility='client' if locked.visibility == 'client' else 'internal',
            )
        return Response({'status': locked.status, 'archived_at': locked.archived_at})


class ProjectDeliveryReopenView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def post(self, request, pk):
        project = _project_for_user(request, pk)
        _require_manager(request.user, project)
        data = CompletionNoteSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        with transaction.atomic():
            locked = Project.objects.select_for_update().get(pk=project.pk)
            if locked.status not in ('completed', 'archived'):
                raise ValidationError({'detail': 'Only a completed or archived Project may be reopened.'})
            locked.status = 'active'
            locked.completed_at = None
            locked.archived_at = None
            locked.reopened_at = timezone.now()
            _save_validated(locked)
            record_activity(
                locked, kind='project_reopened', actor=request.user,
                summary='Project reopened for additional delivery work',
                visibility='client' if locked.visibility == 'client' else 'internal',
            )
        return Response({'status': locked.status, 'reopened_at': locked.reopened_at})

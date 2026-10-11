"""Manual Support Ticket and Project association endpoints.

Phase 4 never alters Ticket lifecycle, email ingestion or automation routing.
Each action is tenant scoped, staff only, and checked against project membership.
"""
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import serializers, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.tickets.models import Ticket
from apps.users.permissions import IsMSPUser, IsTenantUser

from .models import (
    Project, TicketProjectAssociation, TicketWorkItemLink, WorkItem,
)
from .permissions import can_edit_work, tenant_for_request, visible_projects
from .serializers import WorkItemWriteSerializer
from .views import _save_validated


class ProjectSelectionSerializer(serializers.Serializer):
    project_id = serializers.UUIDField()


class ExistingWorkItemSerializer(serializers.Serializer):
    work_item_id = serializers.UUIDField()


def _ticket_for_staff(request, ticket_ref):
    return get_object_or_404(
        Ticket.objects.filter(tenant=tenant_for_request(request)),
        ticket_ref=ticket_ref,
    )


def _editable_project(request, project_id):
    project = get_object_or_404(visible_projects(request), pk=project_id)
    if not can_edit_work(request.user, project):
        raise PermissionDenied('Project contributor permission required.')
    return project


def _check_client_org(ticket, project):
    if not ticket.client_org_id or ticket.client_org_id != project.client_org_id:
        raise ValidationError({
            'project_id': 'Ticket and project must have the same client organization.',
        })
    if ticket.client_org.name == 'Walk-In':
        raise ValidationError({
            'project_id': 'Assign the ticket to a verified client organization first.',
        })
    if ticket.merge_status == 'secondary':
        raise ValidationError({
            'ticket': 'Link the primary ticket rather than a merged secondary ticket.',
        })


def _association(request, ticket, *, editing=False):
    link = TicketProjectAssociation.objects.select_related(
        'project', 'project__client_org',
    ).filter(ticket=ticket).first()
    if not link:
        return None
    if not visible_projects(request).filter(pk=link.project_id).exists():
        raise PermissionDenied('This ticket is linked to a project you cannot access.')
    if editing and not can_edit_work(request.user, link.project):
        raise PermissionDenied('Project contributor permission required.')
    return link


def _serialize_association(request, link):
    if not link:
        return {'linked': False, 'project': None, 'work_items': [], 'can_edit': False}
    project = link.project
    work_links = (
        TicketWorkItemLink.objects.filter(ticket=link.ticket, work_item__project=project)
        .select_related('work_item', 'work_item__project')
        .order_by('created_at', 'id')
    )
    return {
        'linked': True,
        'project': {
            'id': str(project.id),
            'key': project.key,
            'name': project.name,
            'client_org_id': str(project.client_org_id),
        },
        'source': link.source,
        'can_edit': can_edit_work(request.user, project),
        'work_items': [{
            'id': str(entry.work_item_id),
            'ref': entry.work_item.ref,
            'title': entry.work_item.title,
            'kind': entry.work_item.kind,
            'status': entry.work_item.status,
        } for entry in work_links],
    }


class TicketProjectAssociationView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser, IsMSPUser]

    def get(self, request, ticket_ref):
        ticket = _ticket_for_staff(request, ticket_ref)
        link = _association(request, ticket)
        return Response(_serialize_association(request, link))

    def put(self, request, ticket_ref):
        data = ProjectSelectionSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        project = _editable_project(request, data.validated_data['project_id'])

        with transaction.atomic():
            ticket = _ticket_for_staff(request, ticket_ref)
            ticket = Ticket.objects.select_for_update().get(pk=ticket.pk)
            _check_client_org(ticket, project)
            existing = TicketProjectAssociation.objects.select_for_update().filter(ticket=ticket).first()

            if existing and existing.project_id != project.id:
                # Never silently discard links to existing Bugs or Tasks.
                if TicketWorkItemLink.objects.filter(ticket=ticket).exists():
                    raise ValidationError({
                        'project_id': 'Unlink existing work items before changing the project.',
                    })
            if existing:
                existing.project = project
                existing.linked_by = request.user
                existing.source = 'manual'
                _save_validated(existing)
                link = existing
            else:
                link = _save_validated(TicketProjectAssociation(
                    ticket=ticket, project=project,
                    linked_by=request.user, source='manual',
                ))
        return Response(_serialize_association(request, link))

    def delete(self, request, ticket_ref):
        with transaction.atomic():
            ticket = _ticket_for_staff(request, ticket_ref)
            ticket = Ticket.objects.select_for_update().get(pk=ticket.pk)
            link = _association(request, ticket, editing=True)
            if not link:
                return Response(status=status.HTTP_204_NO_CONTENT)
            if TicketWorkItemLink.objects.filter(ticket=ticket).exists():
                raise ValidationError({
                    'detail': 'Unlink the associated work items before removing the project.',
                })
            link.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class TicketWorkItemLinkView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser, IsMSPUser]

    def post(self, request, ticket_ref):
        data = ExistingWorkItemSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        with transaction.atomic():
            ticket = _ticket_for_staff(request, ticket_ref)
            ticket = Ticket.objects.select_for_update().get(pk=ticket.pk)
            link = _association(request, ticket, editing=True)
            if not link:
                raise ValidationError({'detail': 'Link the ticket to a project first.'})
            _check_client_org(ticket, link.project)
            work_item = get_object_or_404(
                WorkItem.objects.filter(project=link.project),
                pk=data.validated_data['work_item_id'],
            )
            existing = TicketWorkItemLink.objects.filter(ticket=ticket, work_item=work_item).first()
            if not existing:
                _save_validated(TicketWorkItemLink(
                    ticket=ticket, work_item=work_item, linked_by=request.user,
                ))
        current = _association(request, ticket)
        return Response(_serialize_association(request, current))


class TicketWorkItemLinkDetailView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser, IsMSPUser]

    def delete(self, request, ticket_ref, work_item_id):
        with transaction.atomic():
            ticket = _ticket_for_staff(request, ticket_ref)
            ticket = Ticket.objects.select_for_update().get(pk=ticket.pk)
            link = _association(request, ticket, editing=True)
            if not link:
                return Response(status=status.HTTP_204_NO_CONTENT)
            instance = get_object_or_404(
                TicketWorkItemLink.objects.filter(
                    ticket=ticket, work_item__project=link.project,
                ),
                work_item_id=work_item_id,
            )
            instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class TicketCreateLinkedWorkItemView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser, IsMSPUser]

    def post(self, request, ticket_ref):
        data = WorkItemWriteSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        attrs = data.validated_data.copy()
        if not attrs.get('title'):
            raise ValidationError({'title': 'Title is required.'})

        with transaction.atomic():
            ticket = _ticket_for_staff(request, ticket_ref)
            ticket = Ticket.objects.select_for_update().get(pk=ticket.pk)
            association = _association(request, ticket, editing=True)
            if not association:
                raise ValidationError({'detail': 'Link the ticket to a project first.'})
            _check_client_org(ticket, association.project)
            project = Project.objects.select_for_update().get(pk=association.project_id)
            from .delivery import ensure_delivery_unlocked
            ensure_delivery_unlocked(project)
            if attrs.get('visibility') == 'client':
                # Only managers may publish external items, consistent with Phase 2.
                from .permissions import can_manage_project
                if not can_manage_project(request.user, project):
                    raise PermissionDenied('Only project managers may publish client visible work.')

            milestone_id = attrs.pop('milestone_id', None)
            assignee_id = attrs.pop('assignee_id', None)
            milestone = None
            assignee = None
            if milestone_id is not None:
                milestone = get_object_or_404(project.milestones.all(), pk=milestone_id)
            if assignee_id is not None:
                from apps.users.models import User
                assignee = get_object_or_404(
                    User.objects.filter(
                        pk=assignee_id,
                        tenant=project.tenant,
                        is_active=True,
                        role__in=['msp_owner', 'msp_manager', 'msp_agent'],
                        project_memberships__project=project,
                        project_memberships__role__in=['manager', 'contributor'],
                    ),
                )
            work_item = _save_validated(WorkItem(
                project=project,
                number=project.next_item_number,
                milestone=milestone,
                assignee=assignee,
                created_by=request.user,
                **attrs,
            ))
            project.next_item_number += 1
            _save_validated(project)
            _save_validated(TicketWorkItemLink(
                ticket=ticket, work_item=work_item, linked_by=request.user,
            ))
        return Response({
            'id': str(work_item.id),
            'ref': work_item.ref,
            'title': work_item.title,
            'project_id': str(work_item.project_id),
        }, status=status.HTTP_201_CREATED)


class WorkItemSupportTicketsView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser, IsMSPUser]

    def get(self, request, work_item_id):
        item = get_object_or_404(
            WorkItem.objects.select_related('project'),
            pk=work_item_id,
            project__in=visible_projects(request),
        )
        links = TicketWorkItemLink.objects.filter(
            work_item=item,
            ticket__tenant=item.project.tenant,
            ticket__client_org=item.project.client_org,
            ticket__project_association__project=item.project,
        ).select_related('ticket').order_by('created_at', 'id')
        return Response([{
            'ref': entry.ticket.ticket_ref,
            'subject': entry.ticket.subject,
            'status': entry.ticket.status,
        } for entry in links])

"""Phase 8B client Project Support Tickets and accessible activity feed."""
from pathlib import Path

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import JSONParser, FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.tenants.models import Tenant
from apps.tickets.models import Ticket, Reply, SupportGroup
from apps.tickets.views import MAX_ATTACHMENT_SIZE, _save_attachments
from apps.users.permissions import CLIENT_ROLES, MSP_ROLES, IsTenantUser
from .activity import activity_read_cursor, mark_project_activity_read, visible_activities
from .models import TicketProjectAssociation, TicketWorkItemLink, WorkItem
from .permissions import tenant_for_request, visible_projects
from .views import _save_validated


class ProjectSupportInput(serializers.Serializer):
    subject = serializers.CharField(max_length=500, trim_whitespace=True)
    description = serializers.CharField(max_length=10000, trim_whitespace=True)
    priority = serializers.ChoiceField(
        choices=Ticket._meta.get_field('priority').choices,
        required=False, default='normal',
    )
    work_item_id = serializers.UUIDField(required=False, allow_null=True)

    def validate_subject(self, value):
        if not value.strip():
            raise serializers.ValidationError('Enter a ticket subject.')
        return value.strip()

    def validate_description(self, value):
        if not value.strip():
            raise serializers.ValidationError('Describe the support you need.')
        return value.strip()


def _project(request, pk):
    return get_object_or_404(visible_projects(request), pk=pk)


def _client_ticket_queryset(request, project):
    qs = Ticket.objects.filter(
        project_association__project=project,
        tenant=project.tenant,
        is_internal=False,
        project_request__isnull=True,
    ).select_related('requester', 'assignee')
    user = request.user
    if user.role in MSP_ROLES:
        return qs
    if user.role == 'client_owner' or (user.role == 'end_user' and user.is_vip):
        return qs.filter(client_org_id=user.client_org_id)
    return qs.filter(requester=user)


class ProjectSupportTicketsView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get(self, request, pk):
        project = _project(request, pk)
        try:
            page = max(1, min(100, int(request.query_params.get('page', '1'))))
        except (ValueError, TypeError):
            page = 1
        size = 25
        qs = _client_ticket_queryset(request, project).order_by('-created_at', '-id')
        total = qs.count()
        tickets = qs[(page - 1) * size:page * size]
        return Response({
            'count': total, 'page': page, 'page_size': size,
            'results': [{
                'id': str(ticket.id),
                'ref': ticket.ticket_ref,
                'subject': ticket.subject,
                'status': ticket.status,
                'priority': ticket.priority,
                'requester': ticket.requester.full_name if ticket.requester else None,
                'assignee': ticket.assignee.full_name if ticket.assignee else None,
                'created_at': ticket.created_at,
                'updated_at': ticket.updated_at,
            } for ticket in tickets],
        })

    def post(self, request, pk):
        project = _project(request, pk)
        user = request.user
        if user.role not in CLIENT_ROLES:
            raise PermissionDenied('Client project reviewers can submit Project Support Tickets.')
        if (not user.client_org_id or user.client_org_id != project.client_org_id
                or not project.client_org.is_active or project.visibility != 'client'
                or project.status == 'archived'):
            raise PermissionDenied('This project is not available for client support.')
        data = ProjectSupportInput(data=request.data)
        data.is_valid(raise_exception=True)
        attrs = data.validated_data
        files = request.FILES.getlist('images')
        allowed_images = {
            '.png': {'image/png'}, '.jpg': {'image/jpeg'},
            '.jpeg': {'image/jpeg'}, '.gif': {'image/gif'},
            '.webp': {'image/webp'},
        }
        if len(files) > 5 or any(
            file.content_type not in allowed_images.get(Path(file.name).suffix.lower(), set())
            or file.size <= 0 or file.size > MAX_ATTACHMENT_SIZE
            for file in files
        ):
            raise ValidationError({'images': 'Attach up to five supported images, maximum 10 MB each.'})
        item = None
        item_id = attrs.get('work_item_id')
        if item_id:
            item = get_object_or_404(WorkItem.objects.filter(
                project=project, visibility='client'
            ), pk=item_id)

        tenant = tenant_for_request(request)
        with transaction.atomic():
            # Lock this tenant to preserve the existing per-tenant Ticket numbering.
            Tenant.objects.select_for_update().get(pk=tenant.pk)
            seq = Ticket.next_seq(tenant)
            ref = f"T{timezone.now().strftime('%d%m%Y')}-{seq:04d}"
            ticket = Ticket.objects.create(
                tenant=tenant, ticket_ref=ref, seq=seq,
                subject=attrs['subject'], description=attrs['description'],
                category='Project Support',
                client_org=project.client_org, requester=user,
                priority=attrs.get('priority', 'normal'),
                status='open',
                group=SupportGroup.objects.filter(tenant=tenant, is_default=True).first(),
            )
            Reply.objects.create(
                ticket=ticket, author=user, type='system_event',
                body=f'Project Support Ticket created by {user.full_name}',
            )
            _save_validated(TicketProjectAssociation(
                ticket=ticket, project=project,
                source='manual', linked_by=None,
            ))
            if item is not None:
                _save_validated(TicketWorkItemLink(
                    ticket=ticket, work_item=item,
                    linked_by=None,
                ))
            if files:
                _save_attachments(tenant, files, ticket=ticket)
        return Response({
            'id': str(ticket.id),
            'ref': ticket.ticket_ref,
            'project_id': str(project.id),
            'work_item_id': str(item.id) if item else None,
        }, status=status.HTTP_201_CREATED)


def _serialize_activity(row, user):
    if row.work_item_id:
        href = f'/projects/{row.project_id}/work-items/{row.work_item_id}'
    elif row.ticket_id:
        href = f'/requests/{row.ticket.ticket_ref}'
    elif row.milestone_id:
        href = f'/projects/{row.project_id}'
    else:
        href = f'/projects/{row.project_id}'
    return {
        'id': str(row.id),
        'kind': row.kind,
        'summary': row.summary,
        'actor': row.actor.full_name if row.actor else 'System',
        'visibility': row.visibility,
        'href': href,
        'created_at': row.created_at,
        'is_mine': row.actor_id == user.id,
    }


class ProjectActivityView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request, pk):
        project = _project(request, pk)
        qs = visible_activities(request, project)
        try:
            page = max(1, min(100, int(request.query_params.get('page', '1'))))
        except (ValueError, TypeError):
            page = 1
        size = 25
        cursor = activity_read_cursor(request.user, project)
        relevant = ('client_feedback', 'support_ticket_created', 'client_ticket_reply') \
            if request.user.role in MSP_ROLES else ('staff_feedback', 'staff_ticket_reply')
        pending = qs.filter(kind__in=relevant).exclude(actor_id=request.user.id)
        if cursor is not None:
            pending = pending.filter(created_at__gt=cursor)
        unread = pending.count()
        total = qs.count()
        rows = list(qs.order_by('-created_at', '-id')[(page - 1) * size:page * size])
        return Response({
            'results': [_serialize_activity(row, request.user) for row in rows],
            'count': total, 'page': page, 'page_size': size,
            'has_more': page * size < total,
            'unread_count': unread,
            'last_seen_at': cursor,
        })


class ProjectActivityReadView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def post(self, request, pk):
        project = _project(request, pk)
        cursor = mark_project_activity_read(request, project)
        return Response({'last_seen_at': cursor, 'unread_count': 0})

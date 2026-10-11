"""Phase 8A: client project requests, safe conversion and a unified work queue.

Ticket remains the discussion and attachment system of record. Converting a
request never deletes its ticket or turns Project status into Ticket status.
"""
from datetime import date
from decimal import Decimal
from pathlib import Path

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.tenants.models import Tenant
from apps.tickets.models import Attachment, Reply, SupportGroup, Ticket
from apps.users.models import User
from apps.users.permissions import CLIENT_ROLES, MSP_ROLES, IsTenantUser
from .models import (
    Project, ProjectAgentPermission, ProjectMember, ProjectRequest,
    TicketProjectAssociation,
)
from .permissions import tenant_for_request, visible_projects
from .views import _save_validated


class RequestCreateInput(serializers.Serializer):
    name = serializers.CharField(max_length=200)
    kind = serializers.ChoiceField(choices=ProjectRequest.KINDS)
    description = serializers.CharField(max_length=5000)
    requirements = serializers.CharField(max_length=12000, required=False, allow_blank=True, default='')
    budget = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0.01'), required=False, allow_null=True)
    budget_currency = serializers.ChoiceField(choices=ProjectRequest.CURRENCIES, required=False, default='USD')
    expected_date = serializers.DateField(required=False, allow_null=True)

    def validate_description(self, value):
        if not value.strip():
            raise serializers.ValidationError('Describe the work you need.')
        return value.strip()


class RequestReviewInput(serializers.Serializer):
    status = serializers.ChoiceField(choices=[
        ('under_review', 'Under Review'), ('awaiting_details', 'Awaiting Details'),
        ('approved', 'Approved'), ('rejected', 'Rejected'),
    ])
    note = serializers.CharField(max_length=5000, required=False, allow_blank=True, default='')


class RequestConvertInput(serializers.Serializer):
    key = serializers.RegexField(r'^[A-Za-z0-9]{2,12}$', max_length=12)
    name = serializers.CharField(max_length=200, required=False, allow_blank=True)
    due_date = serializers.DateField(required=False, allow_null=True)

    def validate_key(self, value):
        return value.upper()


class AgentGrantInput(serializers.Serializer):
    can_create_projects = serializers.BooleanField()


# Existing ticket uploads are image-only. These additional safe request types
# are stored in the same protected Attachment service and file-access endpoint.
REQUEST_UPLOAD_TYPES = {
    '.png': {'image/png'}, '.jpg': {'image/jpeg'}, '.jpeg': {'image/jpeg'},
    '.webp': {'image/webp'}, '.pdf': {'application/pdf'},
    '.txt': {'text/plain'}, '.csv': {'text/csv', 'application/vnd.ms-excel'},
    '.docx': {'application/vnd.openxmlformats-officedocument.wordprocessingml.document'},
    '.xlsx': {'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'},
}
MAX_UPLOAD_SIZE = 10 * 1024 * 1024
MAX_FILES = 5


def can_create_project(user):
    if not user.is_authenticated or not user.is_active:
        return False
    if user.role in ('msp_owner', 'msp_manager'):
        return True
    return (user.role == 'msp_agent' and
            ProjectAgentPermission.objects.filter(tenant_id=user.tenant_id, user=user).exists())


def visible_project_requests(request):
    tenant = tenant_for_request(request)
    user = request.user
    qs = ProjectRequest.objects.filter(
        tenant=tenant, client_org__is_active=True
    ).select_related('ticket', 'ticket__assignee', 'client_org', 'requested_by', 'converted_project')
    if not user.is_active or user.tenant_id != tenant.id:
        return qs.none()
    if user.role in MSP_ROLES:
        return qs
    if user.role == 'client_owner' and user.client_org_id:
        return qs.filter(client_org_id=user.client_org_id)
    if user.role == 'end_user':
        return qs.filter(requested_by=user, client_org_id=user.client_org_id)
    return qs.none()


def _request_for_user(request, pk, lock=False):
    qs = visible_project_requests(request)
    if lock:
        qs = qs.select_for_update(of=('self',))
    return get_object_or_404(qs, pk=pk)


def _require_reviewer(user, row):
    if user.role in ('msp_owner', 'msp_manager'):
        return
    if user.role == 'msp_agent' and row.ticket.assignee_id == user.id:
        return
    raise PermissionDenied('Only the assigned agent or an MSP manager can review this request.')


def _serialize_request(row, request):
    project = row.converted_project
    can_open_project = bool(
        project and visible_projects(request).filter(pk=project.id).exists()
    )
    return {
        'id': str(row.id),
        'ticket_ref': row.ticket.ticket_ref,
        'name': row.name,
        'kind': row.kind,
        'description': row.ticket.description,
        'requirements': row.requirements,
        'budget': str(row.budget) if row.budget is not None else None,
        'budget_currency': row.budget_currency,
        'expected_date': row.expected_date,
        'status': row.status,
        'client_org': row.client_org.name,
        'requested_by': row.requested_by.full_name if row.requested_by else None,
        'assigned_agent': row.ticket.assignee.full_name if row.ticket.assignee else None,
        'assigned_agent_id': str(row.ticket.assignee_id) if row.ticket.assignee_id else None,
        'converted_project_id': str(project.id) if can_open_project else None,
        'created_at': row.created_at,
        'updated_at': row.updated_at,
        'can_review': request.user.role in ('msp_owner', 'msp_manager') or (
            request.user.role == 'msp_agent' and row.ticket.assignee_id == request.user.id
        ),
        'can_convert': row.status == 'approved' and can_create_project(request.user) and (
            request.user.role != 'msp_agent' or row.ticket.assignee_id == request.user.id
        ),
    }


class ProjectRequestListView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]
    parser_classes = [JSONParser, FormParser, MultiPartParser]

    def get(self, request):
        rows = visible_project_requests(request).order_by('-updated_at')[:100]
        return Response([_serialize_request(row, request) for row in rows])

    def post(self, request):
        user = request.user
        if user.role not in CLIENT_ROLES or not user.client_org_id:
            raise PermissionDenied('Client accounts can submit a Project Request.')
        org = user.client_org
        if not org or not org.is_active or org.tenant_id != user.tenant_id:
            raise PermissionDenied('An active client organization is required.')
        input_data = RequestCreateInput(data=request.data)
        input_data.is_valid(raise_exception=True)
        data = input_data.validated_data

        files = request.FILES.getlist('attachments')
        if len(files) > MAX_FILES:
            raise ValidationError({'attachments': 'You can attach up to five files.'})
        for file in files:
            ext = Path(file.name).suffix.lower()
            if (ext not in REQUEST_UPLOAD_TYPES or file.content_type not in REQUEST_UPLOAD_TYPES[ext]
                    or file.size > MAX_UPLOAD_SIZE or file.size <= 0):
                raise ValidationError({'attachments': 'Unsupported file type or file larger than 10 MB.'})

        tenant = tenant_for_request(request)
        try:
            with transaction.atomic():
                # Lock the tenant to avoid duplicate ticket references under concurrent
                # Project Request submissions. Regular support ticket semantics stay intact.
                Tenant.objects.select_for_update().get(pk=tenant.id)
                seq = Ticket.next_seq(tenant)
                ref = f"T{timezone.now().strftime('%d%m%Y')}-{seq:04d}"
                ticket = Ticket.objects.create(
                    tenant=tenant, ticket_ref=ref, seq=seq,
                    subject=f"Project Request: {data['name']}",
                    description=data['description'], category='Project Request',
                    client_org=org, requester=user,
                    group=SupportGroup.objects.filter(tenant=tenant, is_default=True).first(),
                )
                Reply.objects.create(
                    ticket=ticket, author=user, type='system_event',
                    body=f'Project request submitted by {user.full_name}',
                )
                project_request = ProjectRequest(
                    tenant=tenant, client_org=org, ticket=ticket,
                    requested_by=user, name=data['name'], kind=data['kind'],
                    requirements=data.get('requirements', ''),
                    budget=data.get('budget'), budget_currency=data.get('budget_currency', 'USD'),
                    expected_date=data.get('expected_date'),
                )
                _save_validated(project_request)
                for file in files:
                    Attachment.objects.create(
                        tenant=tenant, ticket=ticket, file=file,
                        filename=file.name[:255], size=file.size,
                    )
        except IntegrityError as exc:
            raise ValidationError({'detail': 'Unable to allocate the request reference. Try again.'}) from exc
        return Response(_serialize_request(project_request, request), status=status.HTTP_201_CREATED)


class ProjectRequestDetailView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request, pk):
        return Response(_serialize_request(_request_for_user(request, pk), request))

    def patch(self, request, pk):
        data = RequestReviewInput(data=request.data)
        data.is_valid(raise_exception=True)
        target = data.validated_data['status']
        note = data.validated_data.get('note', '').strip()
        if target == 'rejected' and not note:
            raise ValidationError({'note': 'Explain why the request was rejected.'})
        with transaction.atomic():
            row = _request_for_user(request, pk, lock=True)
            _require_reviewer(request.user, row)
            if row.status in ('converted', 'rejected'):
                raise ValidationError({'status': 'This request has been finalized.'})
            if row.status == target:
                return Response(_serialize_request(row, request))
            row.status = target
            row.reviewed_by = request.user
            _save_validated(row)
            row.ticket.status = {
                'under_review': 'in_progress',
                'awaiting_details': 'waiting_on_customer',
                'approved': 'in_progress',
                'rejected': 'closed',
            }[target]
            row.ticket.save(update_fields=['status', 'updated_at'])
            if note:
                Reply.objects.create(
                    ticket=row.ticket, author=request.user, type='public_reply', body=note,
                )
        return Response(_serialize_request(row, request))


class ProjectRequestClaimView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def post(self, request, pk):
        if request.user.role not in MSP_ROLES:
            raise PermissionDenied('MSP staff only.')
        with transaction.atomic():
            row = _request_for_user(request, pk, lock=True)
            if row.status in ('converted', 'rejected'):
                raise ValidationError({'detail': 'This request is already finalized.'})
            ticket = Ticket.objects.select_for_update().get(pk=row.ticket_id)
            if ticket.assignee_id and ticket.assignee_id != request.user.id:
                raise ValidationError({'detail': 'This request is assigned to another agent.'})
            if not ticket.assignee_id:
                ticket.assignee = request.user
                ticket.save(update_fields=['assignee', 'updated_at'])
            row.ticket = ticket
        return Response(_serialize_request(row, request))


class ProjectRequestConvertView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def post(self, request, pk):
        data = RequestConvertInput(data=request.data)
        data.is_valid(raise_exception=True)
        attrs = data.validated_data
        with transaction.atomic():
            row = _request_for_user(request, pk, lock=True)
            _require_reviewer(request.user, row)
            if not can_create_project(request.user):
                raise PermissionDenied('Project creation permission has not been granted.')
            if row.status == 'converted' and row.converted_project_id:
                return Response(_serialize_request(row, request))
            if row.status != 'approved':
                raise ValidationError({'detail': 'Approve the Project Request before conversion.'})
            if not row.client_org.is_active:
                raise ValidationError({'detail': 'The client organization is no longer active.'})
            if Project.objects.filter(tenant=row.tenant, key=attrs['key']).exists():
                raise ValidationError({'key': 'A project with this key already exists.'})
            if TicketProjectAssociation.objects.filter(ticket=row.ticket).exists():
                raise ValidationError({'detail': 'The request ticket is already linked to a project.'})
            name = attrs.get('name', '').strip() or row.name
            project = Project(
                tenant=row.tenant, client_org=row.client_org, key=attrs['key'],
                name=name,
                description=(
                    f"{row.ticket.description}\n\nRequirements:\n{row.requirements}"
                    if row.requirements else row.ticket.description
                ),
                status='planned', visibility='client',
                due_date=attrs.get('due_date', row.expected_date),
                created_by=request.user,
            )
            _save_validated(project)
            _save_validated(ProjectMember(project=project, user=request.user, role='manager'))
            if row.requested_by_id and row.requested_by.is_active:
                _save_validated(ProjectMember(project=project, user=row.requested_by, role='client_reviewer'))
            _save_validated(TicketProjectAssociation(
                ticket=row.ticket, project=project, source='manual', linked_by=request.user,
            ))
            row.converted_project = project
            row.status = 'converted'
            row.reviewed_by = request.user
            _save_validated(row)
            row.ticket.status = 'solved'
            row.ticket.save(update_fields=['status', 'updated_at'])
            Reply.objects.create(
                ticket=row.ticket, author=request.user, type='system_event',
                body=f'Project created: {project.key} · {project.name}. The original request remains available.',
            )
        return Response(_serialize_request(row, request), status=status.HTTP_201_CREATED)


class ProjectCapabilitiesView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request):
        return Response({
            'can_create_projects': can_create_project(request.user),
            'can_manage_agent_permissions': request.user.role in ('msp_owner', 'msp_manager'),
        })


class ProjectAgentPermissionsView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def _manager(self, request):
        if request.user.role not in ('msp_owner', 'msp_manager'):
            raise PermissionDenied('MSP Owner or Manager permission required.')

    def get(self, request):
        self._manager(request)
        agents = User.objects.filter(
            tenant=tenant_for_request(request), role='msp_agent', is_active=True
        ).order_by('first_name', 'email')
        granted = set(ProjectAgentPermission.objects.filter(
            tenant=tenant_for_request(request)
        ).values_list('user_id', flat=True))
        return Response([{
            'id': str(agent.id), 'name': agent.full_name, 'email': agent.email,
            'can_create_projects': agent.id in granted,
        } for agent in agents])

    def put(self, request, user_id):
        self._manager(request)
        data = AgentGrantInput(data=request.data)
        data.is_valid(raise_exception=True)
        agent = get_object_or_404(User.objects.filter(
            tenant=tenant_for_request(request), role='msp_agent', is_active=True
        ), pk=user_id)
        if data.validated_data['can_create_projects']:
            ProjectAgentPermission.objects.get_or_create(
                user=agent,
                defaults={'tenant': tenant_for_request(request), 'granted_by': request.user},
            )
        else:
            ProjectAgentPermission.objects.filter(
                user=agent, tenant=tenant_for_request(request)
            ).delete()
        return Response({'id': str(agent.id), 'can_create_projects': data.validated_data['can_create_projects']})


def _visible_tickets(request):
    tenant = tenant_for_request(request)
    user = request.user
    qs = Ticket.objects.filter(tenant=tenant).select_related(
        'client_org', 'assignee', 'requester'
    )
    if user.role in MSP_ROLES:
        return qs
    qs = qs.filter(is_internal=False)
    if user.role == 'client_owner' or (user.role == 'end_user' and user.is_vip):
        return qs.filter(client_org_id=user.client_org_id) if user.client_org_id else qs.none()
    if user.role == 'end_user':
        return qs.filter(requester=user)
    return qs.none()


class UnifiedRequestsView(APIView):
    """The same Requests inbox lists general tickets, project requests and projects.

    Converted requests have exactly one current row: the Project. Historical
    tickets and discussions remain accessible via the Tickets view.
    """
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request):
        try:
            page = max(1, min(100, int(request.query_params.get('page', '1'))))
        except ValueError:
            page = 1
        size = 25
        limit = page * size
        query = request.query_params.get('q', '').strip()[:100]
        kind = request.query_params.get('kind', 'all')
        if kind not in ('all', 'tickets', 'project_requests', 'projects'):
            kind = 'all'

        rows = []
        total = 0
        if kind in ('all', 'tickets'):
            tickets = _visible_tickets(request).filter(project_request__isnull=True)
            if query:
                tickets = tickets.filter(
                    Q(subject__icontains=query) | Q(ticket_ref__icontains=query) |
                    Q(client_org__name__icontains=query)
                )
            total += tickets.count()
            for item in tickets.order_by('-updated_at')[:limit]:
                rows.append({
                    'id': str(item.id), 'kind': 'ticket',
                    'ref': item.ticket_ref, 'title': item.subject, 'status': item.status,
                    'client_org': item.client_org.name if item.client_org else '',
                    'assigned_to': item.assignee.full_name if item.assignee else None,
                    'assigned_to_me': item.assignee_id == request.user.id,
                    'priority': item.priority,
                    'href': f'/requests/{item.ticket_ref}',
                    'created_at': item.created_at, 'updated_at': item.updated_at,
                })
        if kind in ('all', 'project_requests'):
            pending = visible_project_requests(request).exclude(status='converted')
            if query:
                pending = pending.filter(
                    Q(name__icontains=query) | Q(ticket__ticket_ref__icontains=query) |
                    Q(client_org__name__icontains=query)
                )
            total += pending.count()
            for item in pending.order_by('-updated_at')[:limit]:
                rows.append({
                    'id': str(item.id), 'kind': 'project_request',
                    'ref': item.ticket.ticket_ref, 'title': item.name,
                    'status': item.status, 'client_org': item.client_org.name,
                    'assigned_to': item.ticket.assignee.full_name if item.ticket.assignee else None,
                    'assigned_to_me': item.ticket.assignee_id == request.user.id,
                    'priority': item.ticket.priority,
                    'href': f'/requests/project/{item.id}',
                    'created_at': item.created_at, 'updated_at': item.updated_at,
                })
        if kind in ('all', 'projects'):
            projects = visible_projects(request)
            if query:
                projects = projects.filter(
                    Q(name__icontains=query) | Q(key__icontains=query) |
                    Q(client_org__name__icontains=query)
                )
            total += projects.count()
            for item in projects.prefetch_related('members__user').order_by('-updated_at')[:limit]:
                managers = [member.user for member in item.members.all() if member.role == 'manager']
                primary = managers[0] if managers else item.created_by
                rows.append({
                    'id': str(item.id), 'kind': 'project', 'ref': item.key,
                    'title': item.name, 'status': item.status, 'client_org': item.client_org.name,
                    'assigned_to': primary.full_name if primary else None,
                    'assigned_to_me': any(member.user_id == request.user.id for member in item.members.all()),
                    'priority': None, 'href': f'/projects/{item.id}',
                    'created_at': item.created_at, 'updated_at': item.updated_at,
                })
        rows.sort(key=lambda row: row['updated_at'], reverse=True)
        start = (page - 1) * size
        return Response({
            'count': total,
            'page': page,
            'page_size': size,
            'results': rows[start:start + size],
        })

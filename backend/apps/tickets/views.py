import logging
from datetime import timedelta

from django.db import transaction
from django.db.models import Q, Count, Subquery, OuterRef
from apps.email_ingestion.models import ProcessedEmail
from django.db.models.functions import TruncDate
from django.shortcuts import get_object_or_404
from django.utils import timezone

from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.permissions import (
    IsTenantUser, MSP_ROLES,
    ROLE_END_USER, ROLE_CLIENT_OWNER,
)
from apps.tenants.models import ClientOrganization
from apps.users.models import User

from .models import Ticket, Reply, Notification, Attachment, TimeLog, SupportGroup
from .serializers import (
    TicketListSerializer, TicketDetailSerializer,
    TicketCreateSerializer, TicketUpdateSerializer,
    ReplyCreateSerializer, ReplySerializer,
    NotificationSerializer, TimeLogSerializer,
    SupportGroupSerializer,
)

ALLOWED_IMAGE_TYPES = {'image/jpeg', 'image/png', 'image/gif', 'image/webp'}
MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024  # 10 MB

logger = logging.getLogger(__name__)


def _save_attachments(tenant, files, *, reply=None, ticket=None):
    for f in files:
        if f.content_type not in ALLOWED_IMAGE_TYPES:
            continue
        if f.size > MAX_ATTACHMENT_SIZE:
            continue
        Attachment.objects.create(
            tenant=tenant, reply=reply, ticket=ticket,
            file=f, filename=f.name, size=f.size,
        )


def _resolve_tenant(request):
    """Return the tenant from the subdomain (production) or from the JWT user (dev/localhost)."""
    return getattr(request, 'tenant', None) or getattr(request.user, 'tenant', None)


class TicketViewSet(viewsets.GenericViewSet):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get_queryset(self):
        tenant = _resolve_tenant(self.request)
        if tenant is None:
            return Ticket.objects.none()

        qs = Ticket.objects.filter(tenant=tenant).select_related(
            'client_org', 'requester', 'assignee', 'group'
        )

        # ── Role-based data scoping ────────────────────────────────────────────
        user = self.request.user
        if user.role == ROLE_CLIENT_OWNER or (user.role == ROLE_END_USER and getattr(user, 'is_vip', False)):
            if user.client_org_id:
                qs = qs.filter(client_org_id=user.client_org_id)
            else:
                return Ticket.objects.none()
        elif user.role == ROLE_END_USER:
            qs = qs.filter(requester=user)
        # MSP roles: no additional restriction

        params = self.request.query_params

        status_val = params.get('status', '')
        if status_val and status_val != 'unassigned':
            qs = qs.filter(status=status_val)

        if params.get('assignee') == 'none' or status_val == 'unassigned':
            qs = qs.filter(assignee__isnull=True)

        priority_val = params.get('priority', '')
        if priority_val:
            qs = qs.filter(priority=priority_val)

        requester_id = params.get('requester_id', '')
        if requester_id:
            qs = qs.filter(requester__id=requester_id)

        assignee_id = params.get('assignee_id', '')
        if assignee_id:
            qs = qs.filter(assignee__id=assignee_id)

        org_id = params.get('org_id', '')
        if org_id:
            qs = qs.filter(client_org_id=org_id)

        group_id = params.get('group_id', '')
        if group_id:
            qs = qs.filter(group_id=group_id)

        search = params.get('search', '').strip()
        if search:
            qs = qs.filter(
                Q(subject__icontains=search)
                | Q(ticket_ref__icontains=search)
                | Q(requester_name__icontains=search)
                | Q(requester__first_name__icontains=search)
                | Q(requester__last_name__icontains=search)
            )

        return qs

    def list(self, request):
        qs = self.get_queryset().annotate(
            last_reply_author_role=Subquery(
                Reply.objects.filter(
                    ticket=OuterRef('pk'),
                    type__in=['public_reply', 'internal_note'],
                ).order_by('-created_at').values('author__role')[:1]
            ),
            source_from_email=Subquery(
                ProcessedEmail.objects.filter(
                    ticket=OuterRef('pk'),
                ).order_by('processed_at').values('from_email')[:1]
            ),
        )
        page = self.paginate_queryset(qs)
        if page is not None:
            return self.get_paginated_response(TicketListSerializer(page, many=True).data)
        return Response(TicketListSerializer(qs, many=True).data)

    def retrieve(self, request, pk=None):
        ticket = get_object_or_404(self.get_queryset(), ticket_ref=pk)
        return Response(TicketDetailSerializer(ticket, context={'request': request}).data)

    def create(self, request):
        serializer = TicketCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        tenant = _resolve_tenant(request)
        if tenant is None:
            return Response({'detail': 'No tenant context.'}, status=400)

        user = request.user
        is_client = user.role not in MSP_ROLES
        is_internal = bool(data.get('is_internal', False)) and not is_client

        with transaction.atomic():
            seq = Ticket.next_seq(tenant)
            ref = f"T{timezone.now().strftime('%d%m%Y')}-{seq:04d}"

            if is_client:
                client_org = user.client_org
                assignee = None
                requester_name = ''
                status = 'open'
                level = ''
                due_by = None
                requester = user
            elif is_internal:
                client_org = None
                requester = user
                requester_name = ''
                assignee = None
                if data.get('assignee_id'):
                    assignee = User.objects.filter(
                        id=data['assignee_id'], tenant=tenant, is_active=True
                    ).first()
                status = data.get('status', 'open')
                level = data.get('level', '')
                due_by = data.get('due_by')
            else:
                client_org = None
                if data.get('client_org_id'):
                    client_org = ClientOrganization.objects.filter(
                        id=data['client_org_id'], tenant=tenant
                    ).first()

                assignee = None
                if data.get('assignee_id'):
                    assignee = User.objects.filter(
                        id=data['assignee_id'], tenant=tenant, is_active=True
                    ).first()

                requester_name = data.get('requester_name', '')
                status = data.get('status', 'open')
                level = data.get('level', '')
                due_by = data.get('due_by')
                requester = None

            default_group = SupportGroup.objects.filter(tenant=tenant, is_default=True).first()

            ticket = Ticket.objects.create(
                tenant=tenant,
                ticket_ref=ref,
                seq=seq,
                subject=data['subject'],
                description=data.get('description', ''),
                status=status,
                priority=data.get('priority', 'normal'),
                level=level,
                category=data.get('category', ''),
                tags=data.get('tags', []),
                is_internal=is_internal,
                client_org=client_org,
                requester_name=requester_name,
                requester=requester,
                assignee=assignee,
                due_by=due_by,
                group=default_group,
            )

            Reply.objects.create(
                ticket=ticket,
                author=request.user,
                type='system_event',
                body=f'Ticket created by {request.user.full_name}',
            )

            images = request.FILES.getlist('images')
            if images:
                _save_attachments(tenant, images, ticket=ticket)

        return Response(TicketDetailSerializer(ticket, context={'request': request}).data, status=201)

    def partial_update(self, request, pk=None):
        ticket = get_object_or_404(self.get_queryset(), ticket_ref=pk)

        # Client users cannot edit ticket metadata — replies only
        if request.user.role not in MSP_ROLES:
            return Response({'detail': 'Permission denied: MSP staff only.'}, status=403)

        serializer = TicketUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        old_status = ticket.status

        if 'assignee_id' in data:
            if data['assignee_id'] is None:
                ticket.assignee = None
            else:
                ticket.assignee = User.objects.filter(
                    id=data['assignee_id'], tenant=ticket.tenant, is_active=True
                ).first()

        if 'requester_id' in data:
            if data['requester_id'] is None:
                ticket.requester = None
            else:
                requester = User.objects.filter(
                    id=data['requester_id'], tenant=ticket.tenant, is_active=True
                ).first()
                if requester:
                    ticket.requester = requester

        if 'client_org_id' in data:
            if data['client_org_id'] is None:
                ticket.client_org = None
            else:
                from apps.tenants.models import ClientOrganization
                org = ClientOrganization.objects.filter(
                    id=data['client_org_id'], tenant=ticket.tenant, is_active=True
                ).first()
                if org:
                    ticket.client_org = org

        if 'group_id' in data:
            if data['group_id'] is None:
                ticket.group = None
            else:
                grp = SupportGroup.objects.filter(id=data['group_id'], tenant=ticket.tenant).first()
                if grp:
                    ticket.group = grp
                    # Clear assignee if they are not a member of the new group
                    # (only when the group has agents assigned to it)
                    if ticket.assignee_id and grp.agents.exists():
                        if not grp.agents.filter(id=ticket.assignee_id).exists():
                            ticket.assignee = None

        for field in ('status', 'priority', 'level', 'due_by', 'subject', 'description', 'category'):
            if field in data:
                setattr(ticket, field, data[field])

        # resolved_at tracks when the ticket stopped being open work.
        #
        # 'closed' counts as resolved, not as reopening. Previously only 'solved'
        # was handled, so closing a ticket fell into the else branch and NULLed
        # resolved_at — and since the normal path is solve-then-close, that wiped
        # the timestamp immediately after it was correctly set. Every closed
        # ticket ended up with resolved_at=None, which made compute_sla_status
        # re-measure it against `now` forever (so a ticket resolved on time
        # eventually flipped to breached), and excluded it from the
        # resolution-time analytics that filter resolved_at__isnull=False.
        RESOLVED_STATUSES = ('solved', 'closed')
        new_status = data.get('status')
        if new_status in RESOLVED_STATUSES:
            # Preserve the original resolution time across solved -> closed.
            if ticket.resolved_at is None or old_status not in RESOLVED_STATUSES:
                ticket.resolved_at = timezone.now()
        elif new_status:
            # Genuinely reopened — clear it.
            ticket.resolved_at = None

        ticket.save()

        if new_status and new_status != old_status:
            _STATUS_LABELS = {
                'open': 'Open', 'pending': 'Pending',
                'in_progress': 'In Progress', 'solved': 'Resolved', 'closed': 'Closed',
            }
            Reply.objects.create(
                ticket=ticket,
                author=request.user,
                type='system_event',
                body=f'Status changed to {_STATUS_LABELS.get(new_status, new_status)} by {request.user.full_name}',
            )

        ticket.refresh_from_db()
        return Response(TicketDetailSerializer(ticket, context={'request': request}).data)

    @action(detail=True, methods=['post'], url_path='secondary-agents')
    def add_secondary_agent(self, request, pk=None):
        if request.user.role not in MSP_ROLES:
            return Response({'detail': 'Permission denied.'}, status=403)
        ticket = get_object_or_404(self.get_queryset(), ticket_ref=pk)
        agent_id = request.data.get('agent_id')
        if not agent_id:
            return Response({'detail': 'agent_id required.'}, status=400)
        agent = User.objects.filter(id=agent_id, tenant=ticket.tenant, is_active=True, role__in=MSP_ROLES).first()
        if not agent:
            return Response({'detail': 'Agent not found.'}, status=404)
        ticket.secondary_agents.add(agent)
        ticket.refresh_from_db()
        return Response(TicketDetailSerializer(ticket, context={'request': request}).data)

    @action(detail=True, methods=['delete'], url_path=r'secondary-agents/(?P<agent_id>[^/.]+)')
    def remove_secondary_agent(self, request, pk=None, agent_id=None):
        if request.user.role not in MSP_ROLES:
            return Response({'detail': 'Permission denied.'}, status=403)
        ticket = get_object_or_404(self.get_queryset(), ticket_ref=pk)
        ticket.secondary_agents.through.objects.filter(ticket=ticket, user_id=agent_id).delete()
        ticket.refresh_from_db()
        return Response(TicketDetailSerializer(ticket, context={'request': request}).data)

    # ── Time Logs ─────────────────────────────────────────────────────────────

    @action(detail=True, methods=['get'], url_path='timelogs')
    def list_timelogs(self, request, pk=None):
        ticket = get_object_or_404(self.get_queryset(), ticket_ref=pk)
        logs = ticket.timelogs.select_related('agent').all()
        return Response(TimeLogSerializer(logs, many=True).data)

    @action(detail=True, methods=['post'], url_path='timelogs/add')
    def add_timelog(self, request, pk=None):
        if request.user.role not in MSP_ROLES:
            return Response({'detail': 'MSP staff only.'}, status=403)
        ticket = get_object_or_404(self.get_queryset(), ticket_ref=pk)
        tenant = _resolve_tenant(request)

        minutes = request.data.get('minutes')
        date    = request.data.get('date')
        desc    = request.data.get('description', '')

        if not minutes or not str(minutes).isdigit() or int(minutes) < 1:
            return Response({'detail': 'minutes must be a positive integer.'}, status=400)
        if not date:
            return Response({'detail': 'date is required.'}, status=400)

        log = TimeLog.objects.create(
            tenant=tenant,
            ticket=ticket,
            agent=request.user,
            minutes=int(minutes),
            date=date,
            description=desc,
        )
        return Response(TimeLogSerializer(log).data, status=201)

    @action(detail=True, methods=['delete'], url_path=r'timelogs/(?P<log_id>[^/.]+)/delete')
    def delete_timelog(self, request, pk=None, log_id=None):
        if request.user.role not in MSP_ROLES:
            return Response({'detail': 'MSP staff only.'}, status=403)
        ticket = get_object_or_404(self.get_queryset(), ticket_ref=pk)
        log = get_object_or_404(TimeLog, id=log_id, ticket=ticket)
        log.delete()
        return Response(status=204)

    # ── Merge / Absorb ────────────────────────────────────────────────────────

    @action(detail=True, methods=['post'], url_path='merge')
    def merge_into(self, request, pk=None):
        """Mark current ticket as secondary — close it into the target (primary)."""
        if request.user.role not in MSP_ROLES:
            return Response({'detail': 'MSP staff only.'}, status=403)

        ticket = get_object_or_404(self.get_queryset(), ticket_ref=pk)
        target_ref = (request.data.get('target_ref') or '').strip()
        if not target_ref:
            return Response({'detail': 'target_ref is required.'}, status=400)
        if target_ref == ticket.ticket_ref:
            return Response({'detail': 'Cannot merge a ticket into itself.'}, status=400)

        target = Ticket.objects.filter(tenant=ticket.tenant, ticket_ref=target_ref).first()
        if not target:
            return Response({'detail': 'Target ticket not found.'}, status=404)

        if ticket.merge_status == 'secondary':
            return Response({'detail': 'This ticket is already absorbed by another ticket.'}, status=400)
        if target.merge_status == 'secondary':
            return Response({'detail': 'Target ticket is itself a secondary — cannot merge into it.'}, status=400)

        with transaction.atomic():
            ticket.merge_status = 'secondary'
            ticket.merged_into  = target
            ticket.status       = 'closed'
            ticket.save(update_fields=['merge_status', 'merged_into', 'status'])

            if target.merge_status != 'primary':
                target.merge_status = 'primary'
                target.save(update_fields=['merge_status'])

            Reply.objects.create(
                ticket=ticket,
                author=request.user,
                type='system_event',
                body=f'Ticket merged into {target.ticket_ref} by {request.user.full_name}',
            )
            Reply.objects.create(
                ticket=target,
                author=request.user,
                type='system_event',
                body=f'Ticket {ticket.ticket_ref} was merged into this ticket by {request.user.full_name}',
            )

        ticket.refresh_from_db()
        return Response(TicketDetailSerializer(ticket, context={'request': request}).data)

    @action(detail=True, methods=['post'], url_path='absorb')
    def absorb(self, request, pk=None):
        """Mark current ticket as primary — pull the source (secondary) into it."""
        if request.user.role not in MSP_ROLES:
            return Response({'detail': 'MSP staff only.'}, status=403)

        ticket = get_object_or_404(self.get_queryset(), ticket_ref=pk)
        source_ref = (request.data.get('source_ref') or '').strip()
        if not source_ref:
            return Response({'detail': 'source_ref is required.'}, status=400)
        if source_ref == ticket.ticket_ref:
            return Response({'detail': 'Cannot absorb a ticket into itself.'}, status=400)

        source = Ticket.objects.filter(tenant=ticket.tenant, ticket_ref=source_ref).first()
        if not source:
            return Response({'detail': 'Source ticket not found.'}, status=404)

        if source.merge_status == 'secondary':
            return Response({'detail': 'That ticket is already absorbed by another ticket.'}, status=400)
        if ticket.merge_status == 'secondary':
            return Response({'detail': 'This ticket is already a secondary — cannot absorb into it.'}, status=400)

        with transaction.atomic():
            source.merge_status = 'secondary'
            source.merged_into  = ticket
            source.status       = 'closed'
            source.save(update_fields=['merge_status', 'merged_into', 'status'])

            if ticket.merge_status != 'primary':
                ticket.merge_status = 'primary'
                ticket.save(update_fields=['merge_status'])

            Reply.objects.create(
                ticket=source,
                author=request.user,
                type='system_event',
                body=f'Ticket absorbed into {ticket.ticket_ref} by {request.user.full_name}',
            )
            Reply.objects.create(
                ticket=ticket,
                author=request.user,
                type='system_event',
                body=f'Ticket {source.ticket_ref} was absorbed into this ticket by {request.user.full_name}',
            )

        ticket.refresh_from_db()
        return Response(TicketDetailSerializer(ticket, context={'request': request}).data)

    # ── Customer History ──────────────────────────────────────────────────────

    @action(detail=True, methods=['get'], url_path='customer-history')
    def customer_history(self, request, pk=None):
        ticket = get_object_or_404(self.get_queryset(), ticket_ref=pk)

        if not ticket.requester_id:
            return Response({'total': 0, 'open_pending': 0, 'tickets': []})

        qs = (
            Ticket.objects
            .filter(tenant=ticket.tenant, requester_id=ticket.requester_id)
            .exclude(id=ticket.id)
            .order_by('-created_at')
        )

        results = [
            {
                'ref':        t.ticket_ref,
                'subject':    t.subject,
                'status':     t.status,
                'created_at': t.created_at.isoformat(),
            }
            for t in qs
        ]
        open_pending = sum(1 for t in results if t['status'] in ('open', 'pending', 'in_progress'))
        return Response({'total': len(results), 'open_pending': open_pending, 'tickets': results})

    @action(detail=True, methods=['post'], url_path='replies')
    def add_reply(self, request, pk=None):
        ticket = get_object_or_404(self.get_queryset(), ticket_ref=pk)
        serializer = ReplyCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        reply_type = serializer.validated_data['type']

        # Client users cannot create internal notes
        if reply_type == 'internal_note' and request.user.role not in MSP_ROLES:
            return Response(
                {'detail': 'Client users cannot create internal notes.'},
                status=403,
            )

        # Parse email recipients before creating the reply so they're stored on it
        _to_emails = _cc_emails = _bcc_emails = []
        _include_history = False
        if reply_type == 'public_reply':
            import json as _json

            def _parse_emails(val):
                if isinstance(val, list):
                    return [e.strip() for e in val if isinstance(e, str) and e.strip()]
                if isinstance(val, str):
                    try:
                        parsed = _json.loads(val)
                        if isinstance(parsed, list):
                            return [e.strip() for e in parsed if isinstance(e, str) and e.strip()]
                    except Exception:
                        pass
                return []

            _to_emails  = _parse_emails(request.data.get('to_emails',  []))
            _cc_emails  = _parse_emails(request.data.get('cc_emails',  []))
            _bcc_emails = _parse_emails(request.data.get('bcc_emails', []))
            inc_raw = request.data.get('include_history', False)
            _include_history = (inc_raw == 'true' or inc_raw is True)

        reply = Reply.objects.create(
            ticket=ticket,
            author=request.user,
            type=reply_type,
            body=serializer.validated_data['body'],
            to_emails=_to_emails,
            cc_emails=_cc_emails,
        )
        Ticket.objects.filter(pk=ticket.pk).update(updated_at=timezone.now())

        images = request.FILES.getlist('images')
        if images:
            tenant = _resolve_tenant(request)
            _save_attachments(tenant, images, reply=reply)

        if reply_type == 'public_reply':
            try:
                from apps.email_ingestion.services import send_reply_email
                send_reply_email(
                    reply,
                    to_emails=_to_emails or None,
                    cc_emails=_cc_emails,
                    bcc_emails=_bcc_emails,
                    include_history=_include_history,
                )
            except Exception:
                # Don't block the reply response, but record the failure.
                logger.exception('send_reply_email failed for reply %s', reply.id)

        return Response(ReplySerializer(reply, context={'request': request}).data, status=201)


# ── Utility list views ────────────────────────────────────────────────────────

class ClientOrgListView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request):
        tenant = _resolve_tenant(request)
        if tenant is None:
            return Response({'detail': 'No tenant context.'}, status=400)

        if request.user.role in MSP_ROLES:
            orgs = (
                ClientOrganization.objects
                .filter(tenant=tenant, is_active=True)
                .values('id', 'name')
                .order_by('name')
            )
            return Response([{'id': str(o['id']), 'name': o['name']} for o in orgs])

        # Client users: only their own organisation
        org = getattr(request.user, 'client_org', None)
        if not org or not org.is_active or str(org.tenant_id) != str(tenant.id):
            return Response([])
        return Response([{'id': str(org.id), 'name': org.name}])


class AgentListView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request):
        tenant = _resolve_tenant(request)
        if tenant is None:
            return Response([])
        if request.user.role not in MSP_ROLES:
            return Response({'detail': 'MSP staff only.'}, status=403)
        agents = (
            User.objects
            .filter(tenant=tenant, is_active=True, role__in=MSP_ROLES)
            .order_by('first_name', 'last_name')
        )
        group_id = request.query_params.get('group_id', '')
        if group_id:
            group = SupportGroup.objects.filter(id=group_id, tenant=tenant).first()
            if group and group.agents.exists():
                agents = agents.filter(support_groups=group)
        return Response([
            {'id': str(a.id), 'full_name': a.full_name, 'role': a.role}
            for a in agents
        ])


class AttachmentFileView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request, pk):
        from django.http import FileResponse, Http404
        import mimetypes
        tenant = _resolve_tenant(request)
        if tenant is None:
            raise Http404
        attachment = get_object_or_404(Attachment, pk=pk, tenant=tenant)
        try:
            fh = attachment.file.open('rb')
        except Exception:
            raise Http404
        content_type, _ = mimetypes.guess_type(attachment.filename or str(attachment.file.name))
        response = FileResponse(fh, content_type=content_type or 'application/octet-stream')
        response['Cache-Control'] = 'private, max-age=86400'
        return response


class StatsView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request):
        tenant = _resolve_tenant(request)
        if tenant is None:
            return Response({'detail': 'No tenant context.'}, status=400)

        now   = timezone.now()
        today = now.date()
        qs    = Ticket.objects.filter(tenant=tenant)

        user = request.user
        if user.role == ROLE_CLIENT_OWNER or (user.role == ROLE_END_USER and getattr(user, 'is_vip', False)):
            if user.client_org_id:
                qs = qs.filter(client_org_id=user.client_org_id)
            else:
                qs = qs.none()
        elif user.role == ROLE_END_USER:
            qs = qs.filter(requester=user)

        active = qs.filter(status__in=['open', 'pending', 'in_progress'])

        open_count    = qs.filter(status='open').count()
        pending_count = qs.filter(status='pending').count()
        in_prog_count = qs.filter(status='in_progress').count()

        return Response({
            'open':           open_count,
            'pending':        pending_count,
            'in_progress':    in_prog_count,
            'solved_today':   qs.filter(status='solved', resolved_at__date=today).count(),
            'total_open':     open_count + pending_count + in_prog_count,
            'unassigned':     qs.filter(
                                  status__in=['open', 'in_progress'],
                                  assignee__isnull=True
                              ).count(),
            'overdue':        qs.filter(
                                  due_by__lt=now,
                                  status__in=['open', 'pending', 'in_progress']
                              ).count(),
            'due_today':      qs.filter(
                                  due_by__date=today,
                                  status__in=['open', 'pending', 'in_progress']
                              ).count(),
            'waiting_client': pending_count,
            'closed':         qs.filter(status='closed').count(),
            'total':          qs.count(),
            'priority_breakdown': {
                'low':      active.filter(priority='low').count(),
                'normal':   active.filter(priority='normal').count(),
                'high':     active.filter(priority='high').count(),
                'critical': active.filter(priority='critical').count(),
            },
        })


class AgentStatsView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request):
        tenant = _resolve_tenant(request)
        if tenant is None:
            return Response([])
        if request.user.role not in MSP_ROLES:
            return Response([])
        now    = timezone.now()
        agents = User.objects.filter(tenant=tenant, is_active=True, role__in=MSP_ROLES)
        result = []
        for agent in agents:
            qs = Ticket.objects.filter(tenant=tenant, assignee=agent)
            result.append({
                'id':             str(agent.id),
                'full_name':      agent.full_name,
                'role':           agent.role,
                'open':           qs.filter(status__in=['open', 'in_progress']).count(),
                'waiting_client': qs.filter(status='pending').count(),
                'overdue':        qs.filter(
                                      due_by__lt=now,
                                      status__in=['open', 'pending', 'in_progress']
                                  ).count(),
            })
        return Response(result)


class RecentActivityView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request):
        tenant = _resolve_tenant(request)
        if tenant is None:
            return Response([])
        replies = (
            Reply.objects
            .filter(ticket__tenant=tenant)
            .select_related('ticket', 'author')
            .order_by('-created_at')
        )

        user = request.user
        if user.role == ROLE_CLIENT_OWNER or (user.role == ROLE_END_USER and getattr(user, 'is_vip', False)):
            if user.client_org_id:
                replies = replies.filter(ticket__client_org_id=user.client_org_id)
            else:
                return Response([])
        elif user.role == ROLE_END_USER:
            replies = replies.filter(ticket__requester=user)

        replies = replies[:20]
        return Response([
            {
                'id':         str(r.id),
                'ticket_ref': r.ticket.ticket_ref,
                'subject':    r.ticket.subject,
                'type':       r.type,
                'body':       r.body[:200],
                'author':     r.author.full_name if r.author else 'System',
                'created_at': r.created_at.isoformat(),
            }
            for r in replies
        ])


class VolumeByDayView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request):
        tenant = _resolve_tenant(request)
        if tenant is None:
            return Response([])
        now   = timezone.now()
        start = now - timedelta(days=29)

        created_map = {
            r['day']: r['count']
            for r in (
                Ticket.objects
                .filter(tenant=tenant, created_at__gte=start)
                .annotate(day=TruncDate('created_at'))
                .values('day')
                .annotate(count=Count('id'))
            )
        }
        resolved_map = {
            r['day']: r['count']
            for r in (
                Ticket.objects
                .filter(tenant=tenant, resolved_at__isnull=False, resolved_at__gte=start)
                .annotate(day=TruncDate('resolved_at'))
                .values('day')
                .annotate(count=Count('id'))
            )
        }

        result = []
        for i in range(30):
            d = (start + timedelta(days=i)).date()
            result.append({
                'date':      d.strftime('%b %d'),
                'inbound':   created_map.get(d, 0),
                'completed': resolved_map.get(d, 0),
            })
        return Response(result)


# ── Notification views ────────────────────────────────────────────────────────

class NotificationListView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request):
        tenant = _resolve_tenant(request)
        if tenant is None:
            return Response({'results': [], 'unread_count': 0})
        qs = (
            Notification.objects
            .filter(tenant=tenant, recipient=request.user)
            .select_related('actor', 'ticket')
            .order_by('-created_at')[:50]
        )
        unread = Notification.objects.filter(
            tenant=tenant, recipient=request.user, is_read=False
        ).count()
        return Response({
            'results':      NotificationSerializer(qs, many=True).data,
            'unread_count': unread,
        })


class NotificationMarkReadView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def post(self, request, pk):
        tenant = _resolve_tenant(request)
        updated = Notification.objects.filter(
            pk=pk, tenant=tenant, recipient=request.user
        ).update(is_read=True)
        if not updated:
            return Response({'detail': 'Not found.'}, status=404)
        return Response({'ok': True})


class NotificationMarkAllReadView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def post(self, request):
        tenant = _resolve_tenant(request)
        if tenant is None:
            return Response({'ok': True})
        Notification.objects.filter(
            tenant=tenant, recipient=request.user, is_read=False
        ).update(is_read=True)
        return Response({'ok': True})


# ── Support Groups ────────────────────────────────────────────────────────────

class SupportGroupViewSet(viewsets.GenericViewSet):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get_queryset(self):
        tenant = _resolve_tenant(self.request)
        if tenant is None:
            return SupportGroup.objects.none()
        return SupportGroup.objects.filter(tenant=tenant).annotate(
            ticket_count=Count('tickets')
        )

    def list(self, request):
        return Response(SupportGroupSerializer(self.get_queryset(), many=True).data)

    def create(self, request):
        if request.user.role not in MSP_ROLES:
            return Response({'detail': 'Permission denied.'}, status=403)
        tenant = _resolve_tenant(request)
        name = (request.data.get('name') or '').strip()
        if not name:
            return Response({'detail': 'name is required.'}, status=400)
        description = (request.data.get('description') or '').strip()
        if SupportGroup.objects.filter(tenant=tenant, name=name).exists():
            return Response({'detail': 'A group with this name already exists.'}, status=400)
        group = SupportGroup.objects.create(tenant=tenant, name=name, description=description)
        return Response(SupportGroupSerializer(group).data, status=201)

    def partial_update(self, request, pk=None):
        if request.user.role not in MSP_ROLES:
            return Response({'detail': 'Permission denied.'}, status=403)
        group = get_object_or_404(self.get_queryset(), pk=pk)
        name = (request.data.get('name') or '').strip()
        description = request.data.get('description', group.description)
        if name and name != group.name:
            if SupportGroup.objects.filter(tenant=group.tenant, name=name).exclude(pk=group.pk).exists():
                return Response({'detail': 'A group with this name already exists.'}, status=400)
            group.name = name
        group.description = description
        group.save()
        return Response(SupportGroupSerializer(group).data)

    def destroy(self, request, pk=None):
        if request.user.role not in MSP_ROLES:
            return Response({'detail': 'Permission denied.'}, status=403)
        group = get_object_or_404(self.get_queryset(), pk=pk)
        group.delete()  # Ticket.group SET_NULL on delete
        return Response(status=204)

    @action(detail=True, methods=['post'], url_path='agents')
    def add_agent(self, request, pk=None):
        if request.user.role not in MSP_ROLES:
            return Response({'detail': 'Permission denied.'}, status=403)
        group = get_object_or_404(self.get_queryset(), pk=pk)
        agent_id = request.data.get('agent_id')
        if not agent_id:
            return Response({'detail': 'agent_id required.'}, status=400)
        agent = User.objects.filter(id=agent_id, tenant=group.tenant, is_active=True, role__in=MSP_ROLES).first()
        if not agent:
            return Response({'detail': 'Agent not found.'}, status=404)
        group.agents.add(agent)
        return Response(SupportGroupSerializer(group).data)

    @action(detail=True, methods=['delete'], url_path='agents/(?P<agent_id>[^/.]+)')
    def remove_agent(self, request, pk=None, agent_id=None):
        if request.user.role not in MSP_ROLES:
            return Response({'detail': 'Permission denied.'}, status=403)
        group = get_object_or_404(self.get_queryset(), pk=pk)
        agent = User.objects.filter(id=agent_id, tenant=group.tenant).first()
        if agent:
            group.agents.remove(agent)
        return Response(SupportGroupSerializer(group).data)

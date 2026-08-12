from django.conf import settings
from django.contrib.auth import get_user_model
from django.db.models import Q
from django.utils.dateparse import parse_datetime

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.permissions import IsTenantUser, MSP_ROLES, ROLE_END_USER, ROLE_CLIENT_OWNER
from apps.tenants.models import ClientOrganization
from .models import DirectMessage, SupportSession, SupportMessage
from .serializers import DMMessageSerializer, SupportSessionSerializer, SupportMessageSerializer

User = get_user_model()

DM_PAGE_SIZE      = 50
SESSION_PAGE_SIZE = 30


def _resolve_tenant(request):
    return getattr(request, 'tenant', None) or getattr(request.user, 'tenant', None)


def _get_online_set(tenant_id: str) -> set:
    try:
        import redis as _redis
        url = getattr(settings, 'CHANNEL_REDIS_URL', 'redis://127.0.0.1:6379/2')
        r = _redis.from_url(url, decode_responses=True)
        return r.smembers(f'chat:presence:{tenant_id}')
    except Exception:
        return set()


def _user_dict(user, online_set=None):
    d = {
        'id':        str(user.id),
        'full_name': user.full_name,
        'email':     user.email,
        'role':      user.role,
    }
    if online_set is not None:
        d['online'] = str(user.id) in online_set
    return d


# ── DM views ──────────────────────────────────────────────────────────────────

class DMInboxView(APIView):
    """GET /api/chat/dm/inbox/ — list of DM conversations."""
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request):
        tenant = _resolve_tenant(request)
        me     = request.user

        sent_to     = DirectMessage.objects.filter(tenant=tenant, sender=me).values_list('recipient_id', flat=True).distinct()
        received_from = DirectMessage.objects.filter(tenant=tenant, recipient=me).values_list('sender_id', flat=True).distinct()
        partner_ids = set(list(sent_to) + list(received_from))

        if not partner_ids:
            return Response([])

        online_set = _get_online_set(str(tenant.id))
        partners   = User.objects.filter(id__in=partner_ids).only('id', 'first_name', 'last_name', 'email', 'role')

        result = []
        for partner in partners:
            convo_qs = DirectMessage.objects.filter(tenant=tenant).filter(
                Q(sender=me, recipient=partner) | Q(sender=partner, recipient=me)
            )
            last_msg    = convo_qs.order_by('-created_at').first()
            unread      = convo_qs.filter(sender=partner, is_read=False).count()

            result.append({
                'partner':      _user_dict(partner, online_set),
                'last_message': DMMessageSerializer(last_msg).data if last_msg else None,
                'unread_count': unread,
            })

        result.sort(
            key=lambda x: x['last_message']['created_at'] if x['last_message'] else '',
            reverse=True,
        )
        return Response(result)


class DMMessagesView(APIView):
    """GET /api/chat/dm/messages/<user_id>/?before=<iso_timestamp> — paginated thread."""
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request, user_id):
        tenant = _resolve_tenant(request)
        me     = request.user

        qs = DirectMessage.objects.filter(
            tenant=tenant,
        ).filter(
            Q(sender=me, recipient_id=user_id) | Q(sender_id=user_id, recipient=me)
        ).order_by('-created_at')

        before = request.query_params.get('before')
        if before:
            ts = parse_datetime(before)
            if ts:
                qs = qs.filter(created_at__lt=ts)

        msgs = list(reversed(qs[:DM_PAGE_SIZE]))
        return Response(DMMessageSerializer(msgs, many=True).data)


class DMUnreadCountView(APIView):
    """GET /api/chat/dm/unread/ — total unread DM count for the current user."""
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request):
        tenant = _resolve_tenant(request)
        count  = DirectMessage.objects.filter(
            tenant=tenant, recipient=request.user, is_read=False
        ).count()
        return Response({'unread': count})


class DMMarkReadView(APIView):
    """POST /api/chat/dm/read/<user_id>/ — mark all messages from user as read."""
    permission_classes = [IsAuthenticated, IsTenantUser]

    def post(self, request, user_id):
        tenant  = _resolve_tenant(request)
        updated = DirectMessage.objects.filter(
            tenant=tenant, sender_id=user_id, recipient=request.user, is_read=False
        ).update(is_read=True)
        return Response({'marked_read': updated})


# ── Support views ─────────────────────────────────────────────────────────────

class SupportQueueView(APIView):
    """GET /api/chat/support/queue/ — agents only: waiting + active sessions."""
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request):
        if request.user.role not in MSP_ROLES:
            return Response({'detail': 'Agents only.'}, status=403)
        tenant   = _resolve_tenant(request)
        sessions = (
            SupportSession.objects
            .filter(tenant=tenant, status__in=['waiting', 'active'])
            .select_related('user', 'agent')
            .order_by('created_at')
        )
        return Response(SupportSessionSerializer(sessions, many=True).data)


class SupportHistoryView(APIView):
    """GET /api/chat/support/history/ — agents only: ended sessions, newest first."""
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request):
        if request.user.role not in MSP_ROLES:
            return Response({'detail': 'Agents only.'}, status=403)
        tenant = _resolve_tenant(request)
        offset = int(request.query_params.get('offset', 0))
        qs = (
            SupportSession.objects
            .filter(tenant=tenant, status='ended')
            .select_related('user', 'agent')
            .order_by('-ended_at')
        )
        total    = qs.count()
        sessions = qs[offset:offset + SESSION_PAGE_SIZE]
        return Response({
            'total':    total,
            'sessions': SupportSessionSerializer(sessions, many=True).data,
        })


class SupportSessionMessagesView(APIView):
    """GET /api/chat/support/sessions/<session_id>/messages/ — messages in a session."""
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request, session_id):
        tenant = _resolve_tenant(request)
        me     = request.user

        try:
            session = SupportSession.objects.get(id=session_id, tenant=tenant)
        except SupportSession.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=404)

        # End users may only read their own sessions
        if me.role not in MSP_ROLES and session.user_id != me.id:
            return Response({'detail': 'Forbidden.'}, status=403)

        # Ended sessions: end users see nothing
        if session.status == 'ended' and me.role not in MSP_ROLES:
            return Response({'detail': 'Session history is agent-only.'}, status=403)

        msgs = SupportMessage.objects.filter(session=session).order_by('created_at')
        return Response(SupportMessageSerializer(msgs, many=True).data)


class MyActiveSessionView(APIView):
    """GET /api/chat/support/my-session/ — end user's current open session (if any)."""
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request):
        if request.user.role in MSP_ROLES:
            return Response({'detail': 'End users only.'}, status=403)
        tenant  = _resolve_tenant(request)
        session = (
            SupportSession.objects
            .filter(tenant=tenant, user=request.user, status__in=['waiting', 'active'])
            .select_related('user', 'agent')
            .order_by('-created_at')
            .first()
        )
        if session is None:
            return Response(None)
        return Response(SupportSessionSerializer(session).data)


# ── Users / Agents lists ──────────────────────────────────────────────────────

class ChatAgentsListView(APIView):
    """GET /api/chat/agents/ — MSP staff: all agents in the tenant with online status."""
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request):
        if request.user.role not in MSP_ROLES:
            return Response({'detail': 'Agents only.'}, status=403)
        tenant     = _resolve_tenant(request)
        online_set = _get_online_set(str(tenant.id))
        agents = (
            User.objects
            .filter(tenant=tenant, role__in=MSP_ROLES, is_active=True)
            .exclude(id=request.user.id)
            .order_by('first_name', 'last_name')
            .only('id', 'first_name', 'last_name', 'email', 'role', 'job_title')
        )
        data = []
        for a in agents:
            d = _user_dict(a, online_set)
            d['job_title'] = a.job_title
            data.append(d)
        return Response(data)


class ChatUsersListView(APIView):
    """GET /api/chat/users/ — end users: all users in their client org with online status."""
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request):
        me     = request.user
        tenant = _resolve_tenant(request)

        if me.role in MSP_ROLES:
            # MSP staff use /chat/agents/ instead; return all non-MSP users in tenant for support context
            qs = (
                User.objects
                .filter(tenant=tenant, is_active=True)
                .exclude(role__in=MSP_ROLES)
                .exclude(id=me.id)
                .order_by('first_name', 'last_name')
                .only('id', 'first_name', 'last_name', 'email', 'role')
            )
        elif me.client_org_id:
            # End user: only users in the same org
            qs = (
                User.objects
                .filter(tenant=tenant, client_org_id=me.client_org_id, is_active=True)
                .exclude(id=me.id)
                .order_by('first_name', 'last_name')
                .only('id', 'first_name', 'last_name', 'email', 'role')
            )
        else:
            return Response([])

        online_set = _get_online_set(str(tenant.id))
        return Response([_user_dict(u, online_set) for u in qs])


class ChatOrgUsersView(APIView):
    """GET /api/chat/org-users/ — MSP staff: all client orgs with their users + online status."""
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request):
        if request.user.role not in MSP_ROLES:
            return Response({'detail': 'Agents only.'}, status=403)

        tenant     = _resolve_tenant(request)
        online_set = _get_online_set(str(tenant.id))

        orgs = ClientOrganization.objects.filter(tenant=tenant, is_active=True).order_by('name')

        result = []
        for org in orgs:
            users_qs = (
                User.objects
                .filter(tenant=tenant, client_org=org, is_active=True)
                .order_by('first_name', 'last_name')
                .only('id', 'first_name', 'last_name', 'email', 'role')
            )
            user_list = [_user_dict(u, online_set) for u in users_qs]
            result.append({
                'id':         str(org.id),
                'name':       org.name,
                'user_count': len(user_list),
                'users':      user_list,
            })

        return Response(result)

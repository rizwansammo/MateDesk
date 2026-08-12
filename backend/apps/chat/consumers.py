from urllib.parse import parse_qs

from asgiref.sync import sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.conf import settings
from django.contrib.auth import get_user_model

from rest_framework_simplejwt.tokens import AccessToken
from rest_framework_simplejwt.exceptions import TokenError

MSP_ROLES = {'msp_owner', 'msp_manager', 'msp_agent'}

# ── Redis presence helpers ────────────────────────────────────────────────────

_redis_client = None


def _get_redis():
    global _redis_client
    if _redis_client is None:
        import redis as _redis
        url = getattr(settings, 'CHANNEL_REDIS_URL', 'redis://127.0.0.1:6379/2')
        _redis_client = _redis.from_url(url, decode_responses=True)
    return _redis_client


@sync_to_async
def _presence_connect(user_id: str, tenant_id: str) -> bool:
    """Increment connection counter. Returns True if this is the first connection (just came online)."""
    r = _get_redis()
    count = r.incr(f'chat:conn:{user_id}')
    if count == 1:
        r.sadd(f'chat:presence:{tenant_id}', user_id)
        return True
    return False


@sync_to_async
def _presence_disconnect(user_id: str, tenant_id: str) -> bool:
    """Decrement connection counter. Returns True if last connection closed (just went offline)."""
    r = _get_redis()
    count = r.decr(f'chat:conn:{user_id}')
    if count <= 0:
        r.delete(f'chat:conn:{user_id}')
        r.srem(f'chat:presence:{tenant_id}', user_id)
        return True
    return False


@sync_to_async
def _get_online_users(tenant_id: str) -> list:
    r = _get_redis()
    return list(r.smembers(f'chat:presence:{tenant_id}'))


# ── JWT auth ──────────────────────────────────────────────────────────────────

@sync_to_async
def _authenticate_ws_user(token: str):
    if not token:
        return None
    try:
        payload = AccessToken(token)
    except TokenError:
        return None
    user_id = payload.get('user_id')
    if not user_id:
        return None
    User = get_user_model()
    try:
        return User.objects.select_related('tenant').get(id=user_id, is_active=True)
    except User.DoesNotExist:
        return None


# ── DB helpers ────────────────────────────────────────────────────────────────

@sync_to_async
def _is_user_in_tenant(user_id, tenant_id) -> bool:
    """True only if user_id is an active user in tenant_id. Cross-tenant routing
    must be blocked by an explicit check — unguessable IDs are not an isolation
    boundary."""
    User = get_user_model()
    try:
        return User.objects.filter(id=user_id, tenant_id=tenant_id, is_active=True).exists()
    except Exception:
        return False


@sync_to_async
def _save_dm(*, tenant_id, sender_id, recipient_id, body):
    from .models import DirectMessage
    try:
        return DirectMessage.objects.create(
            tenant_id=tenant_id,
            sender_id=sender_id,
            recipient_id=recipient_id,
            body=body,
        )
    except Exception:
        return None


@sync_to_async
def _mark_dms_read(*, tenant_id, recipient_id, sender_id) -> int:
    from .models import DirectMessage
    return DirectMessage.objects.filter(
        tenant_id=tenant_id,
        recipient_id=recipient_id,
        sender_id=sender_id,
        is_read=False,
    ).update(is_read=True)


@sync_to_async
def _create_support_session(*, tenant_id, user_id, initiated_by, body):
    from django.db import transaction
    from .models import SupportSession, SupportMessage
    try:
        with transaction.atomic():
            session_number = SupportSession.generate_session_number_for_tenant(tenant_id)
            session = SupportSession.objects.create(
                tenant_id=tenant_id,
                session_number=session_number,
                user_id=user_id,
                initiated_by=initiated_by,
                status='waiting',
            )
            first_msg = SupportMessage.objects.create(
                session=session,
                sender_id=user_id,
                sender_type='user',
                body=body,
            )
        return session, first_msg
    except Exception:
        return None, None


@sync_to_async
def _agent_accept_session(*, session_id, agent_id, tenant_id):
    from django.db import transaction
    from .models import SupportSession
    try:
        with transaction.atomic():
            session = (
                SupportSession.objects
                .filter(id=session_id, tenant_id=tenant_id, status='waiting')
                .select_for_update()
                .first()
            )
            if session is None:
                return None
            session.agent_id = agent_id
            session.status = 'active'
            session.save(update_fields=['agent_id', 'status'])
        return session
    except Exception:
        return None


@sync_to_async
def _create_agent_initiated_session(*, tenant_id, agent_id, user_id):
    from django.db import transaction
    from .models import SupportSession
    try:
        with transaction.atomic():
            session_number = SupportSession.generate_session_number_for_tenant(tenant_id)
            session = SupportSession.objects.create(
                tenant_id=tenant_id,
                session_number=session_number,
                user_id=user_id,
                agent_id=agent_id,
                initiated_by='agent',
                status='waiting',
            )
        return session
    except Exception:
        return None


@sync_to_async
def _user_accept_initiation(*, session_id, user_id, tenant_id) -> bool:
    from .models import SupportSession
    updated = SupportSession.objects.filter(
        id=session_id,
        tenant_id=tenant_id,
        user_id=user_id,
        status='waiting',
        initiated_by='agent',
    ).update(status='active')
    return updated > 0


@sync_to_async
def _get_resumable_sessions(user_id: str, tenant_id: str, is_agent: bool) -> list:
    """Return [{id, status}] for sessions this user is a party to.
    Includes waiting/active (to rejoin) AND sessions ended in last 24 h (to push session_ended
    in case the client missed the broadcast while disconnected)."""
    from django.db.models import Q
    from django.utils import timezone
    from datetime import timedelta
    from .models import SupportSession
    cutoff = timezone.now() - timedelta(hours=24)
    if is_agent:
        qs = SupportSession.objects.filter(
            tenant_id=tenant_id, agent_id=user_id,
        ).filter(
            Q(status__in=['waiting', 'active']) |
            Q(status='ended', ended_at__gte=cutoff)
        )
    else:
        qs = SupportSession.objects.filter(
            tenant_id=tenant_id, user_id=user_id,
        ).filter(
            Q(status__in=['waiting', 'active']) |
            Q(status='ended', ended_at__gte=cutoff)
        )
    return list(qs.values('id', 'status'))


@sync_to_async
def _save_support_message(*, session_id, sender_id, sender_type, body):
    from .models import SupportMessage, SupportSession
    try:
        session = SupportSession.objects.get(id=session_id, status='active')
        return SupportMessage.objects.create(
            session=session,
            sender_id=sender_id,
            sender_type=sender_type,
            body=body,
        )
    except Exception:
        return None


@sync_to_async
def _force_end_session(*, session_id, tenant_id):
    """End a session unconditionally regardless of current status. Returns user_id or None."""
    from django.utils import timezone
    from .models import SupportSession
    try:
        session = SupportSession.objects.filter(id=session_id, tenant_id=tenant_id).first()
        if session is None:
            return None
        if session.status != 'ended':
            session.status = 'ended'
            session.ended_at = timezone.now()
            session.save(update_fields=['status', 'ended_at'])
        return str(session.user_id) if session.user_id else None
    except Exception:
        return None


@sync_to_async
def _end_session(*, session_id, tenant_id) -> bool:
    from django.utils import timezone
    from .models import SupportSession
    updated = SupportSession.objects.filter(
        id=session_id,
        tenant_id=tenant_id,
        status='active',
    ).update(status='ended', ended_at=timezone.now())
    return updated > 0


# ── ChatConsumer — DMs + presence ─────────────────────────────────────────────

class ChatConsumer(AsyncJsonWebsocketConsumer):

    async def connect(self):
        raw_query = self.scope.get('query_string', b'').decode()
        token = parse_qs(raw_query).get('token', [''])[0]
        self.user = await _authenticate_ws_user(token)
        if self.user is None:
            await self.close(code=4401)
            return

        self.user_id = str(self.user.id)
        self.tenant_id = str(self.user.tenant_id)
        self.dm_group = f'dm_{self.tenant_id}_{self.user_id}'
        self.presence_group = f'presence_{self.tenant_id}'

        await self.channel_layer.group_add(self.dm_group, self.channel_name)
        await self.channel_layer.group_add(self.presence_group, self.channel_name)
        await self.accept()

        # Mark online; broadcast only on first connection
        just_came_online = await _presence_connect(self.user_id, self.tenant_id)
        if just_came_online:
            await self.channel_layer.group_send(self.presence_group, {
                'type': 'chat.presence',
                'user_id': self.user_id,
                'online': True,
            })

        # Send current online users to this new connection
        online_users = await _get_online_users(self.tenant_id)
        await self.send_json({'type': 'presence_snapshot', 'online_users': online_users})

    async def disconnect(self, close_code):
        dm_group = getattr(self, 'dm_group', None)
        presence_group = getattr(self, 'presence_group', None)
        user_id = getattr(self, 'user_id', None)
        tenant_id = getattr(self, 'tenant_id', None)

        if dm_group:
            await self.channel_layer.group_discard(dm_group, self.channel_name)
        if presence_group:
            await self.channel_layer.group_discard(presence_group, self.channel_name)

        if user_id and tenant_id:
            just_went_offline = await _presence_disconnect(user_id, tenant_id)
            if just_went_offline and presence_group:
                await self.channel_layer.group_send(presence_group, {
                    'type': 'chat.presence',
                    'user_id': user_id,
                    'online': False,
                })

    async def receive_json(self, content):
        t = content.get('type')
        if t == 'dm':
            await self._handle_dm(content)
        elif t == 'dm_read':
            await self._handle_dm_read(content)
        elif t == 'ping':
            await self.send_json({'type': 'pong'})

    async def _handle_dm(self, content):
        recipient_id = content.get('recipient_id')
        body = (content.get('body') or '').strip()
        if not recipient_id or not body:
            return
        # Reject DMs to anyone outside the sender's tenant.
        if not await _is_user_in_tenant(recipient_id, self.tenant_id):
            return
        msg = await _save_dm(
            tenant_id=self.tenant_id,
            sender_id=self.user_id,
            recipient_id=recipient_id,
            body=body,
        )
        if msg is None:
            return
        payload = {
            'type': 'chat.dm',
            'message': {
                'id': str(msg.id),
                'sender_id': self.user_id,
                'recipient_id': recipient_id,
                'body': msg.body,
                'is_read': False,
                'created_at': msg.created_at.isoformat(),
            },
        }
        await self.channel_layer.group_send(f'dm_{self.tenant_id}_{recipient_id}', payload)
        await self.channel_layer.group_send(self.dm_group, payload)

    async def _handle_dm_read(self, content):
        sender_id = content.get('sender_id')
        if not sender_id:
            return
        count = await _mark_dms_read(
            tenant_id=self.tenant_id,
            recipient_id=self.user_id,
            sender_id=sender_id,
        )
        if count:
            await self.channel_layer.group_send(f'dm_{self.tenant_id}_{sender_id}', {
                'type': 'chat.dm_read',
                'reader_id': self.user_id,
            })

    # Channel layer → client
    async def chat_dm(self, event):
        await self.send_json(event)

    async def chat_presence(self, event):
        await self.send_json(event)

    async def chat_dm_read(self, event):
        await self.send_json(event)


# ── SupportConsumer — live support sessions ───────────────────────────────────

class SupportConsumer(AsyncJsonWebsocketConsumer):

    async def connect(self):
        raw_query = self.scope.get('query_string', b'').decode()
        token = parse_qs(raw_query).get('token', [''])[0]
        self.user = await _authenticate_ws_user(token)
        if self.user is None:
            await self.close(code=4401)
            return

        self.user_id = str(self.user.id)
        self.tenant_id = str(self.user.tenant_id)
        self.is_agent = self.user.role in MSP_ROLES
        self.notif_group = f'user_notif_{self.tenant_id}_{self.user_id}'
        self.session_groups: set = set()

        await self.channel_layer.group_add(self.notif_group, self.channel_name)
        if self.is_agent:
            self.queue_group = f'support_queue_{self.tenant_id}'
            await self.channel_layer.group_add(self.queue_group, self.channel_name)

        await self.accept()

        # Presence — shared reference counting with ChatConsumer
        just_came_online = await _presence_connect(self.user_id, self.tenant_id)
        if just_came_online:
            presence_group = f'presence_{self.tenant_id}'
            await self.channel_layer.group_send(presence_group, {
                'type': 'chat.presence',
                'user_id': self.user_id,
                'online': True,
            })

        # Re-join active/waiting sessions and push session_ended for any that ended
        # while this client was disconnected (fixes "ghost active" windows on frontend).
        resumable = await _get_resumable_sessions(self.user_id, self.tenant_id, self.is_agent)
        for sess in resumable:
            sid = str(sess['id'])
            if sess['status'] == 'ended':
                await self.send_json({'type': 'support.session_ended', 'session_id': sid})
            else:
                grp = f'support_{self.tenant_id}_{sid}'
                self.session_groups.add(grp)
                await self.channel_layer.group_add(grp, self.channel_name)
                if not self.is_agent and sess['status'] == 'active':
                    await self.send_json({'type': 'support.session_active', 'session_id': sid})

    async def disconnect(self, close_code):
        for group in list(getattr(self, 'session_groups', [])):
            await self.channel_layer.group_discard(group, self.channel_name)

        notif_group = getattr(self, 'notif_group', None)
        if notif_group:
            await self.channel_layer.group_discard(notif_group, self.channel_name)

        if getattr(self, 'is_agent', False):
            queue_group = getattr(self, 'queue_group', None)
            if queue_group:
                await self.channel_layer.group_discard(queue_group, self.channel_name)

        user_id = getattr(self, 'user_id', None)
        tenant_id = getattr(self, 'tenant_id', None)
        if user_id and tenant_id:
            just_went_offline = await _presence_disconnect(user_id, tenant_id)
            if just_went_offline:
                await self.channel_layer.group_send(f'presence_{tenant_id}', {
                    'type': 'chat.presence',
                    'user_id': user_id,
                    'online': False,
                })

    async def receive_json(self, content):
        handlers = {
            'start_support':     self._start_support,
            'accept_support':    self._accept_support,
            'dismiss_support':   self._dismiss_support,
            'initiate_support':  self._initiate_support,
            'accept_initiation': self._accept_initiation,
            'message':           self._handle_message,
            'end_support':       self._end_support,
            'decline_end':       self._decline_end,
            'confirm_end':       self._confirm_end,
            'force_end':         self._force_end,
            'ping':              self._ping,
        }
        handler = handlers.get(content.get('type'))
        if handler:
            await handler(content)

    async def _ping(self, _):
        await self.send_json({'type': 'pong'})

    # ── User initiates support ────────────────────────────────────────────────

    async def _start_support(self, content):
        if self.is_agent:
            return
        body = (content.get('body') or '').strip()
        if not body:
            return
        session, first_msg = await _create_support_session(
            tenant_id=self.tenant_id,
            user_id=self.user_id,
            initiated_by='user',
            body=body,
        )
        if session is None:
            return
        session_id = str(session.id)
        session_group = f'support_{self.tenant_id}_{session_id}'
        self.session_groups.add(session_group)
        await self.channel_layer.group_add(session_group, self.channel_name)

        user_name = f'{self.user.first_name} {self.user.last_name}'.strip() or self.user.email
        await self.channel_layer.group_send(f'support_queue_{self.tenant_id}', {
            'type': 'support.queue_entry',
            'session': {
                'id': session_id,
                'session_number': session.session_number,
                'user_id': self.user_id,
                'user_name': user_name,
                'body': body,
                'status': 'waiting',
            },
        })
        await self.send_json({
            'type': 'support_started',
            'session_id': session_id,
            'session_number': session.session_number,
            'first_message': {
                'id': str(first_msg.id),
                'body': first_msg.body,
                'created_at': first_msg.created_at.isoformat(),
            },
        })

    # ── Agent accepts user-initiated session ──────────────────────────────────

    async def _accept_support(self, content):
        if not self.is_agent:
            return
        session_id = content.get('session_id')
        if not session_id:
            return
        session = await _agent_accept_session(
            session_id=session_id,
            agent_id=self.user_id,
            tenant_id=self.tenant_id,
        )
        if session is None:
            return
        session_group = f'support_{self.tenant_id}_{session_id}'
        self.session_groups.add(session_group)
        await self.channel_layer.group_add(session_group, self.channel_name)

        # Clear queue popup for all agents
        await self.channel_layer.group_send(f'support_queue_{self.tenant_id}', {
            'type': 'support.accepted',
            'session_id': session_id,
            'agent_id': self.user_id,
        })
        # Notify user their session is now active.
        # Send to both the session group AND the user's dedicated notif group so
        # reconnected clients (whose channel is not yet in the session group) also
        # receive the transition.
        active_payload = {'type': 'support.session_active', 'session_id': session_id}
        await self.channel_layer.group_send(session_group, active_payload)
        await self.channel_layer.group_send(f'user_notif_{self.tenant_id}_{session.user_id}', active_payload)

    # ── Agent dismisses (client-side hide only) ───────────────────────────────

    async def _dismiss_support(self, content):
        await self.send_json({'type': 'dismissed', 'session_id': content.get('session_id')})

    # ── Agent initiates support from user profile ─────────────────────────────

    async def _initiate_support(self, content):
        if not self.is_agent:
            return
        target_user_id = content.get('user_id')
        if not target_user_id:
            return
        # Only initiate support with a user inside the agent's tenant.
        if not await _is_user_in_tenant(target_user_id, self.tenant_id):
            return
        session = await _create_agent_initiated_session(
            tenant_id=self.tenant_id,
            agent_id=self.user_id,
            user_id=target_user_id,
        )
        if session is None:
            return
        session_id = str(session.id)
        session_group = f'support_{self.tenant_id}_{session_id}'
        self.session_groups.add(session_group)
        await self.channel_layer.group_add(session_group, self.channel_name)

        await self.channel_layer.group_send(f'user_notif_{self.tenant_id}_{target_user_id}', {
            'type': 'support.agent_initiation',
            'session_id': session_id,
            'session_number': session.session_number,
        })
        await self.send_json({
            'type': 'initiation_sent',
            'session_id': session_id,
            'session_number': session.session_number,
            'user_id': target_user_id,
        })

    # ── User accepts agent-initiated session ──────────────────────────────────

    async def _accept_initiation(self, content):
        if self.is_agent:
            return
        session_id = content.get('session_id')
        if not session_id:
            return
        ok = await _user_accept_initiation(
            session_id=session_id,
            user_id=self.user_id,
            tenant_id=self.tenant_id,
        )
        if not ok:
            return
        session_group = f'support_{self.tenant_id}_{session_id}'
        self.session_groups.add(session_group)
        await self.channel_layer.group_add(session_group, self.channel_name)
        await self.channel_layer.group_send(session_group, {
            'type': 'support.session_active',
            'session_id': session_id,
        })

    # ── Message within an active session ─────────────────────────────────────

    async def _handle_message(self, content):
        session_id = content.get('session_id')
        body = (content.get('body') or '').strip()
        if not session_id or not body:
            return
        session_group = f'support_{self.tenant_id}_{session_id}'
        if session_group not in self.session_groups:
            return
        sender_type = 'agent' if self.is_agent else 'user'
        msg = await _save_support_message(
            session_id=session_id,
            sender_id=self.user_id,
            sender_type=sender_type,
            body=body,
        )
        if msg is None:
            return
        await self.channel_layer.group_send(session_group, {
            'type': 'support.message',
            'session_id': session_id,
            'message': {
                'id': str(msg.id),
                'sender_id': self.user_id,
                'sender_type': sender_type,
                'body': msg.body,
                'created_at': msg.created_at.isoformat(),
            },
        })

    # ── Agent requests end (prompts user) ────────────────────────────────────

    async def _end_support(self, content):
        if not self.is_agent:
            return
        session_id = content.get('session_id')
        if not session_id:
            return
        session_group = f'support_{self.tenant_id}_{session_id}'
        if session_group not in self.session_groups:
            return
        await self.channel_layer.group_send(session_group, {
            'type': 'support.end_request',
            'session_id': session_id,
        })

    # ── User declines end request ────────────────────────────────────────────

    async def _decline_end(self, content):
        if self.is_agent:
            return
        session_id = content.get('session_id')
        if not session_id:
            return
        session_group = f'support_{self.tenant_id}_{session_id}'
        if session_group not in self.session_groups:
            return
        await self.channel_layer.group_send(session_group, {
            'type': 'support.end_declined',
            'session_id': session_id,
        })

    # ── User confirms end ─────────────────────────────────────────────────────

    async def _confirm_end(self, content):
        if self.is_agent:
            return
        session_id = content.get('session_id')
        if not session_id:
            return
        session_group = f'support_{self.tenant_id}_{session_id}'
        if session_group not in self.session_groups:
            return
        ok = await _end_session(session_id=session_id, tenant_id=self.tenant_id)
        if not ok:
            return
        await self.channel_layer.group_send(session_group, {
            'type': 'support.session_ended',
            'session_id': session_id,
        })
        self.session_groups.discard(session_group)
        await self.channel_layer.group_discard(session_group, self.channel_name)

    # ── Agent force-ends a stuck session ─────────────────────────────────────

    async def _force_end(self, content):
        if not self.is_agent:
            return
        session_id = content.get('session_id')
        if not session_id:
            return
        user_id = await _force_end_session(session_id=session_id, tenant_id=self.tenant_id)
        ended_payload = {'type': 'support.session_ended', 'session_id': session_id}
        session_group = f'support_{self.tenant_id}_{session_id}'
        # Notify everyone still in the session group
        await self.channel_layer.group_send(session_group, ended_payload)
        # Notify the user via their personal notif group (bypasses session group subscription)
        if user_id:
            await self.channel_layer.group_send(f'user_notif_{self.tenant_id}_{user_id}', ended_payload)
        self.session_groups.discard(session_group)
        await self.channel_layer.group_discard(session_group, self.channel_name)

    # ── Channel layer → client ────────────────────────────────────────────────

    async def support_queue_entry(self, event):
        await self.send_json(event)

    async def support_accepted(self, event):
        await self.send_json(event)

    async def support_session_active(self, event):
        await self.send_json(event)

    async def support_message(self, event):
        await self.send_json(event)

    async def support_end_request(self, event):
        await self.send_json(event)

    async def support_session_ended(self, event):
        await self.send_json(event)

    async def support_agent_initiation(self, event):
        await self.send_json(event)

    async def support_end_declined(self, event):
        await self.send_json(event)

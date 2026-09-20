from django.shortcuts import get_object_or_404
from django.utils import timezone

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.permissions import IsTenantUser, IsMSPUser, MSP_ROLES
from . import matemail
from .models import (
    AUTH_METHOD_BASIC,
    AUTH_METHOD_MATEMAIL,
    TenantEmailSettings,
    KnownSender,
)
from .serializers import EmailSettingsSerializer, KnownSenderSerializer
from .services import test_imap_connection, test_smtp_connection


def _resolve_tenant(request):
    return getattr(request, 'tenant', None) or getattr(request.user, 'tenant', None)


def _saved_settings(tenant):
    try:
        return tenant.email_settings
    except TenantEmailSettings.DoesNotExist:
        return None


def _port(value, fallback):
    """Coerce a submitted port, falling back on anything unusable — a blank
    field used to reach int('') and surface as a 500."""
    try:
        port = int(value)
    except (TypeError, ValueError):
        return fallback
    return port if 1 <= port <= 65535 else fallback


# ── Email settings ────────────────────────────────────────────────────────────

class EmailSettingsView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser, IsMSPUser]

    def _get_settings(self, tenant):
        obj, _ = TenantEmailSettings.objects.get_or_create(tenant=tenant)
        return obj

    def get(self, request):
        tenant = _resolve_tenant(request)
        if not tenant:
            return Response({'detail': 'No tenant context.'}, status=400)
        settings = self._get_settings(tenant)
        return Response(EmailSettingsSerializer(settings).data)

    def patch(self, request):
        tenant = _resolve_tenant(request)
        if not tenant:
            return Response({'detail': 'No tenant context.'}, status=400)
        settings = self._get_settings(tenant)

        data = request.data.copy()
        if not data.get('imap_password'):
            data.pop('imap_password', None)
        if not data.get('smtp_password'):
            data.pop('smtp_password', None)
        if not data.get('oauth_client_secret'):
            data.pop('oauth_client_secret', None)

        serializer = EmailSettingsSerializer(settings, data=data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        settings.refresh_from_db()
        return Response(EmailSettingsSerializer(settings).data)


class TestImapView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser, IsMSPUser]

    def post(self, request):
        tenant = _resolve_tenant(request)
        if not tenant:
            return Response({'detail': 'No tenant context.'}, status=400)

        saved = _saved_settings(tenant)

        # Unsaved on purpose — never persisted. It exists so the connection
        # helper can call get_imap_password() exactly as it does for a real row.
        probe = TenantEmailSettings(
            imap_host     = request.data.get('imap_host',     getattr(saved, 'imap_host', '')),
            imap_port     = _port(request.data.get('imap_port'), getattr(saved, 'imap_port', 993)),
            imap_username = request.data.get('imap_username', getattr(saved, 'imap_username', '')),
            imap_use_ssl  = request.data.get('imap_use_ssl',  getattr(saved, 'imap_use_ssl', True)),
        )
        # A typed password arrives in plaintext, the fallback comes encrypted
        # from the DB; decrypt_email_credential() passes plaintext through, so
        # get_imap_password() resolves both correctly.
        typed = request.data.get('imap_password', '')
        probe.imap_password = typed or getattr(saved, 'imap_password', '')

        if not probe.imap_host:
            return Response({'success': False, 'message': 'Enter an IMAP host first.'})

        success, message = test_imap_connection(probe)
        return Response({'success': success, 'message': message})


class TestSmtpView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser, IsMSPUser]

    def post(self, request):
        tenant = _resolve_tenant(request)
        if not tenant:
            return Response({'detail': 'No tenant context.'}, status=400)

        saved = _saved_settings(tenant)

        probe = TenantEmailSettings(
            smtp_host     = request.data.get('smtp_host',     getattr(saved, 'smtp_host', '')),
            smtp_port     = _port(request.data.get('smtp_port'), getattr(saved, 'smtp_port', 587)),
            smtp_username = request.data.get('smtp_username', getattr(saved, 'smtp_username', '')),
            smtp_use_tls  = request.data.get('smtp_use_tls',  getattr(saved, 'smtp_use_tls', True)),
        )
        typed = request.data.get('smtp_password', '')
        probe.smtp_password = typed or getattr(saved, 'smtp_password', '')

        if not probe.smtp_host:
            return Response({'success': False, 'message': 'Enter an SMTP host first.'})

        success, message = test_smtp_connection(probe)
        return Response({'success': success, 'message': message})


class MateMailConnectStartView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser, IsMSPUser]

    def post(self, request):
        tenant = _resolve_tenant(request)
        if not tenant:
            return Response({'detail': 'No tenant context.'}, status=400)
        tenant_id = str(request.data.get('tenant_id') or '').strip()
        secret = str(request.data.get('integration_secret') or '')
        if not tenant_id or not secret:
            return Response(
                {'detail': 'Tenant ID and Integration Secret are required.'},
                status=400,
            )
        try:
            return Response(matemail.start_connection(tenant_id, secret))
        except matemail.MateMailError as exc:
            return Response({'detail': str(exc)}, status=502)


class MateMailConnectCompleteView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser, IsMSPUser]

    REQUIRED_SCOPES = {'mailbox.read', 'mail.read', 'mail.modify', 'mail.send'}

    def post(self, request):
        tenant = _resolve_tenant(request)
        if not tenant:
            return Response({'detail': 'No tenant context.'}, status=400)

        tenant_id = str(request.data.get('tenant_id') or '').strip()
        poll_token = str(request.data.get('poll_token') or '')
        if not tenant_id or not poll_token:
            return Response(
                {'detail': 'Tenant ID and poll token are required.'},
                status=400,
            )

        try:
            result = matemail.connection_status(tenant_id, poll_token)
        except matemail.MateMailError as exc:
            return Response({'detail': str(exc)}, status=502)

        if result.get('status') != 'approved':
            return Response(result)

        access_token = result.get('access_token')
        if not access_token:
            return Response(
                {'detail': 'MateMail already issued this token. Start again.'},
                status=409,
            )

        granted = {
            item.get('key')
            for item in result.get('permissions', [])
            if isinstance(item, dict)
        }
        missing = sorted(self.REQUIRED_SCOPES - granted)
        if missing:
            from django.conf import settings as django_settings
            product_name = getattr(django_settings, 'PRODUCT_NAME', 'MateDesk')
            return Response(
                {
                    'detail': (
                        'This MateMail connected app does not have the Helpdesk '
                        f'permissions required by {product_name}.'
                    ),
                    'missing_scopes': missing,
                },
                status=400,
            )

        settings, _ = TenantEmailSettings.objects.get_or_create(tenant=tenant)

        # Revoke an older MateMail token before replacing it. Failure to reach
        # MateMail must not leave the tenant unable to finish a new connection.
        old_token = settings.get_matemail_access_token()
        if old_token and settings.matemail_tenant_id:
            try:
                matemail.disconnect(
                    token=old_token,
                    tenant_id=settings.matemail_tenant_id,
                )
            except matemail.MateMailError:
                pass

        settings.auth_method = AUTH_METHOD_MATEMAIL
        settings.matemail_tenant_id = tenant_id
        settings.matemail_mailbox_id = str(result.get('mailbox_id') or '')
        settings.matemail_mailbox_email = str(result.get('mailbox_email') or '')
        settings.matemail_mailbox_name = str(result.get('mailbox_name') or '')
        settings.matemail_permissions = result.get('permissions', [])
        settings.matemail_access_token = access_token
        settings.matemail_connected_at = timezone.now()
        settings.imap_folder = settings.imap_folder or 'INBOX'
        settings.imap_enabled = True
        settings.smtp_enabled = True
        settings.smtp_from_email = settings.matemail_mailbox_email
        settings.smtp_from_name = (
            settings.matemail_mailbox_name or settings.smtp_from_name or 'Support'
        )
        settings.last_error = ''
        settings.save()

        return Response(EmailSettingsSerializer(settings).data)


class MateMailDisconnectView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser, IsMSPUser]

    def post(self, request):
        tenant = _resolve_tenant(request)
        if not tenant:
            return Response({'detail': 'No tenant context.'}, status=400)
        settings, _ = TenantEmailSettings.objects.get_or_create(tenant=tenant)
        token = settings.get_matemail_access_token()
        if token and settings.matemail_tenant_id:
            try:
                matemail.disconnect(
                    token=token,
                    tenant_id=settings.matemail_tenant_id,
                )
            except matemail.MateMailError:
                pass

        settings.auth_method = AUTH_METHOD_BASIC
        settings.matemail_tenant_id = ''
        settings.matemail_mailbox_id = ''
        settings.matemail_mailbox_email = ''
        settings.matemail_mailbox_name = ''
        settings.matemail_permissions = []
        settings.matemail_access_token = ''
        settings.matemail_connected_at = None
        settings.imap_enabled = False
        settings.smtp_enabled = False
        settings.save()
        return Response(EmailSettingsSerializer(settings).data)


# ── Known senders ─────────────────────────────────────────────────────────────

class KnownSenderListView(APIView):
    """GET  /api/senders/          — list all known senders for this tenant
       GET  /api/senders/?org_id=… — filter by client org"""
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request):
        tenant = _resolve_tenant(request)
        if not tenant:
            return Response({'detail': 'No tenant context.'}, status=400)
        qs = (
            KnownSender.objects
            .filter(tenant=tenant)
            .select_related('client_org')
            .order_by('email')
        )
        org_id = request.query_params.get('org_id', '')
        if org_id:
            qs = qs.filter(client_org_id=org_id)
        return Response(KnownSenderSerializer(qs, many=True).data)


class AssignSenderView(APIView):
    """POST /api/senders/assign/

    Body:
      ticket_ref        — derive email from this ticket's source email, OR
      email             — explicit email address
      client_org_id     — destination org (required)
      move_walkin_tickets — bool, default false
      name              — optional display name (used when email provided directly)
    """
    permission_classes = [IsAuthenticated, IsTenantUser]

    def post(self, request):
        tenant = _resolve_tenant(request)
        if not tenant:
            return Response({'detail': 'No tenant context.'}, status=400)
        if request.user.role not in MSP_ROLES:
            return Response({'detail': 'MSP staff only.'}, status=403)

        org_id = request.data.get('client_org_id', '')
        if not org_id:
            return Response({'detail': 'client_org_id is required.'}, status=400)

        from apps.tenants.models import ClientOrganization
        try:
            target_org = ClientOrganization.objects.get(
                id=org_id, tenant=tenant, is_active=True
            )
        except ClientOrganization.DoesNotExist:
            return Response({'detail': 'Organization not found.'}, status=404)

        # Resolve email address
        email_addr  = ''
        sender_name = ''
        ticket_ref  = (request.data.get('ticket_ref') or '').strip()

        if ticket_ref:
            from apps.tickets.models import Ticket
            try:
                ticket = Ticket.objects.get(ticket_ref=ticket_ref, tenant=tenant)
            except Ticket.DoesNotExist:
                return Response({'detail': 'Ticket not found.'}, status=404)
            src = ticket.source_emails.order_by('processed_at').first()
            if not src:
                return Response(
                    {'detail': 'This ticket has no email source — it was created manually.'},
                    status=400,
                )
            email_addr  = src.from_email
            sender_name = src.from_name or ''
        else:
            email_addr  = (request.data.get('email') or '').strip().lower()
            sender_name = (request.data.get('name') or '').strip()

        if not email_addr:
            return Response({'detail': 'Provide either ticket_ref or email.'}, status=400)

        # Upsert KnownSender
        KnownSender.objects.update_or_create(
            tenant=tenant,
            email=email_addr,
            defaults={'client_org': target_org, 'name': sender_name},
        )

        # Optionally move Walk-In tickets from this email
        tickets_moved = 0
        if request.data.get('move_walkin_tickets'):
            from apps.tickets.models import Ticket
            from apps.tenants.models import ClientOrganization as CO
            try:
                walkin = CO.objects.get(tenant=tenant, name='Walk-In')
                tickets_moved = Ticket.objects.filter(
                    tenant=tenant,
                    client_org=walkin,
                    source_emails__from_email=email_addr,
                ).update(client_org=target_org)
            except CO.DoesNotExist:
                pass

        return Response({
            'email':         email_addr,
            'org_name':      target_org.name,
            'tickets_moved': tickets_moved,
        })


class KnownSenderDeleteView(APIView):
    """DELETE /api/senders/<pk>/"""
    permission_classes = [IsAuthenticated, IsTenantUser]

    def delete(self, request, pk):
        tenant = _resolve_tenant(request)
        if not tenant:
            return Response(status=404)
        if request.user.role not in MSP_ROLES:
            return Response({'detail': 'MSP staff only.'}, status=403)
        ks = get_object_or_404(KnownSender, pk=pk, tenant=tenant)
        ks.delete()
        return Response(status=204)

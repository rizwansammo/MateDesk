import hashlib
import json

from django.apps import apps
from django.core.management.base import BaseCommand, CommandError
from django.db import connection

from apps.email_ingestion.models import ProcessedEmail, TenantEmailSettings
from apps.tenants.models import ClientOrganization, Tenant
from apps.tickets.models import Attachment, Notification, Reply, Ticket
from apps.users.models import User


def _norm(value):
    return (value or '').strip().lower()


def _hash(value):
    return hashlib.sha256(_norm(value).encode('utf-8')).hexdigest()


def _org_match_value(org):
    domain = _norm(org.domain)
    if domain:
        return f'domain:{domain}'
    return f'name:{_norm(org.name)}'


def _user_key(user):
    return _hash(user.email)


class Command(BaseCommand):
    help = 'Emit a PII-minimized tenant migration manifest for collision-safe dry runs.'

    def add_arguments(self, parser):
        parser.add_argument('--tenant', required=True)
        parser.add_argument('--pretty', action='store_true')

    def handle(self, *args, **options):
        slug = options['tenant'].strip().lower()
        try:
            tenant = Tenant.objects.get(slug=slug)
        except Tenant.DoesNotExist as exc:
            raise CommandError(f'Tenant {slug!r} was not found.') from exc

        orgs = list(ClientOrganization.objects.filter(tenant=tenant).order_by('created_at'))
        users = list(User.objects.filter(tenant=tenant).order_by('date_joined'))
        tickets = list(Ticket.objects.filter(tenant=tenant).order_by('created_at'))
        replies = list(Reply.objects.filter(ticket__tenant=tenant).select_related('ticket', 'author').order_by('created_at'))
        notifications = list(
            Notification.objects.filter(tenant=tenant)
            .select_related('recipient', 'actor', 'ticket')
            .order_by('created_at')
        )
        attachments = list(
            Attachment.objects.filter(tenant=tenant)
            .select_related('ticket', 'reply', 'reply__ticket')
            .order_by('created_at')
        )
        processed = list(
            ProcessedEmail.objects.filter(tenant=tenant)
            .select_related('ticket', 'reply')
            .order_by('processed_at')
        )

        org_match = {o.id: _hash(_org_match_value(o)) for o in orgs}
        user_match = {u.id: _user_key(u) for u in users}

        direct_counts = {}
        for model in sorted(apps.get_models(), key=lambda m: m._meta.label):
            if any(field.name == 'tenant' for field in model._meta.fields):
                try:
                    count = model.objects.filter(tenant=tenant).count()
                except Exception:
                    continue
                if count:
                    direct_counts[model._meta.label] = count

        with connection.cursor() as cursor:
            cursor.execute('SELECT app, name FROM django_migrations ORDER BY app, name')
            migration_rows = cursor.fetchall()
        schema_fingerprint = hashlib.sha256(
            json.dumps(migration_rows, separators=(',', ':')).encode('utf-8')
        ).hexdigest()

        email_settings = TenantEmailSettings.objects.filter(tenant=tenant).first()

        payload = {
            'format': 'matedesk-tenant-migration-manifest-v1',
            'tenant': {
                'id': str(tenant.id),
                'slug': tenant.slug,
            },
            'schema': {
                'migration_count': len(migration_rows),
                'fingerprint': schema_fingerprint,
            },
            'counts': {
                'direct_tenant_models': direct_counts,
                'users': len(users),
                'organizations': len(orgs),
                'tickets': len(tickets),
                'replies': len(replies),
                'notifications': len(notifications),
                'attachments': len(attachments),
                'processed_emails': len(processed),
            },
            'organizations': [
                {
                    'id': str(o.id),
                    'match_h': org_match[o.id],
                    'name_h': _hash(o.name),
                    'domain_h': _hash(o.domain) if _norm(o.domain) else '',
                    'has_domain': bool(_norm(o.domain)),
                    'is_active': o.is_active,
                }
                for o in orgs
            ],
            'users': [
                {
                    'id': str(u.id),
                    'email_h': user_match[u.id],
                    'role': u.role,
                    'org_match_h': org_match.get(u.client_org_id, ''),
                    'is_active': u.is_active,
                    'totp_enabled': u.totp_enabled,
                    'email_2fa_enabled': u.email_2fa_enabled,
                }
                for u in users
            ],
            'tickets': [
                {
                    'id': str(t.id),
                    'ref': t.ticket_ref,
                    'subject_h': _hash(t.subject),
                    'org_match_h': org_match.get(t.client_org_id, ''),
                    'requester_h': user_match.get(t.requester_id, ''),
                    'assignee_h': user_match.get(t.assignee_id, ''),
                    'created_at': t.created_at.isoformat(),
                    'reply_count': sum(1 for r in replies if r.ticket_id == t.id),
                }
                for t in tickets
            ],
            'replies': [
                {
                    'id': str(r.id),
                    'ticket_ref': r.ticket.ticket_ref,
                    'author_h': user_match.get(r.author_id, ''),
                    'type': r.type,
                    'body_h': _hash(r.body),
                    'created_at': r.created_at.isoformat(),
                }
                for r in replies
            ],
            'notifications': [
                {
                    'id': str(n.id),
                    'recipient_h': user_match.get(n.recipient_id, ''),
                    'actor_h': user_match.get(n.actor_id, ''),
                    'ticket_ref': n.ticket.ticket_ref if n.ticket_id else '',
                    'type': n.notif_type,
                    'created_at': n.created_at.isoformat(),
                }
                for n in notifications
            ],
            'attachments': [
                {
                    'id': str(a.id),
                    'ticket_ref': (
                        a.ticket.ticket_ref if a.ticket_id
                        else a.reply.ticket.ticket_ref if a.reply_id else ''
                    ),
                    'path_h': _hash(a.file.name if a.file else ''),
                    'size': a.size,
                    'storage_exists': bool(a.file and a.file.storage.exists(a.file.name)),
                }
                for a in attachments
            ],
            'processed_emails': [
                {
                    'message_h': _hash(e.message_id),
                    'ticket_ref': e.ticket.ticket_ref if e.ticket_id else '',
                    'reply_id': str(e.reply_id or ''),
                    'processed_at': e.processed_at.isoformat(),
                }
                for e in processed
            ],
            'email_settings': {
                'exists': email_settings is not None,
                'auth_method': email_settings.auth_method if email_settings else '',
                'imap_enabled': bool(email_settings and email_settings.imap_enabled),
                'smtp_enabled': bool(email_settings and email_settings.smtp_enabled),
                'matemail_connected': bool(email_settings and email_settings.matemail_connected_at),
                'mailbox_h': _hash(
                    email_settings.matemail_mailbox_email
                    or email_settings.imap_username
                    or email_settings.smtp_from_email
                ) if email_settings else '',
                'emails_processed': email_settings.emails_processed if email_settings else 0,
            },
        }

        self.stdout.write(json.dumps(
            payload,
            sort_keys=True,
            indent=2 if options['pretty'] else None,
            separators=None if options['pretty'] else (',', ':'),
        ))

import json

from django.core.management.base import BaseCommand, CommandError

from apps.email_ingestion.models import KnownSender, ProcessedEmail
from apps.tenants.models import ClientOrganization, Tenant
from apps.tickets.models import (
    Attachment,
    Notification,
    Reply,
    SupportGroup,
    Ticket,
    TimeLog,
)
from apps.users.models import User


def _dt(value):
    return value.isoformat() if value else None


class Command(BaseCommand):
    help = 'Export one tenant as a deterministic JSON transfer payload. Does not include email credential secrets.'

    def add_arguments(self, parser):
        parser.add_argument('--tenant', required=True)

    def handle(self, *args, **options):
        slug = options['tenant'].strip().lower()
        try:
            tenant = Tenant.objects.get(slug=slug)
        except Tenant.DoesNotExist as exc:
            raise CommandError(f'Tenant {slug!r} was not found.') from exc

        orgs = list(ClientOrganization.objects.filter(tenant=tenant).order_by('created_at', 'id'))
        users = list(User.objects.filter(tenant=tenant).order_by('date_joined', 'id'))
        groups = list(SupportGroup.objects.filter(tenant=tenant).order_by('created_at', 'id'))
        tickets = list(Ticket.objects.filter(tenant=tenant).order_by('created_at', 'id'))
        replies = list(Reply.objects.filter(ticket__tenant=tenant).order_by('created_at', 'id'))
        notifications = list(Notification.objects.filter(tenant=tenant).order_by('created_at', 'id'))
        timelogs = list(TimeLog.objects.filter(tenant=tenant).order_by('created_at', 'id'))
        attachments = list(Attachment.objects.filter(tenant=tenant).order_by('created_at', 'id'))
        known_senders = list(KnownSender.objects.filter(tenant=tenant).order_by('created_at', 'id'))
        processed = list(ProcessedEmail.objects.filter(tenant=tenant).order_by('processed_at', 'id'))

        payload = {
            'format': 'matedesk-tenant-transfer-v1',
            'tenant': {
                'source_id': str(tenant.id),
                'slug': tenant.slug,
                'name': tenant.name,
                'primary_color': tenant.primary_color,
                'timezone': tenant.timezone,
                'support_email': tenant.support_email,
                'phone': tenant.phone,
                'address': tenant.address,
                'website': tenant.website,
                'branding': tenant.branding or {},
            },
            'organizations': [
                {
                    'id': str(o.id),
                    'name': o.name,
                    'domain': o.domain,
                    'contact_name': o.contact_name,
                    'contact_email': o.contact_email,
                    'phone': o.phone,
                    'address': o.address,
                    'timezone': o.timezone,
                    'business_hours': o.business_hours,
                    'is_active': o.is_active,
                    'created_at': _dt(o.created_at),
                }
                for o in orgs
            ],
            'users': [
                {
                    'id': str(u.id),
                    'email': u.email,
                    'password': u.password,
                    'last_login': _dt(u.last_login),
                    'first_name': u.first_name,
                    'last_name': u.last_name,
                    'role': u.role,
                    'client_org_id': str(u.client_org_id or ''),
                    'is_active': u.is_active,
                    'date_joined': _dt(u.date_joined),
                    'job_title': u.job_title,
                    'department': u.department,
                    'phone': u.phone,
                    'employee_id': u.employee_id,
                    'reports_to': u.reports_to,
                    'business_impact': u.business_impact,
                    'deleted_org_name': u.deleted_org_name,
                    'is_vip': u.is_vip,
                    'totp_enabled': u.totp_enabled,
                    'email_2fa_enabled': u.email_2fa_enabled,
                    'totp_secret': u.totp_secret,
                }
                for u in users
            ],
            'support_groups': [
                {
                    'id': str(g.id),
                    'name': g.name,
                    'description': g.description,
                    'is_default': g.is_default,
                    'agent_ids': [str(pk) for pk in g.agents.values_list('id', flat=True)],
                    'created_at': _dt(g.created_at),
                }
                for g in groups
            ],
            'tickets': [
                {
                    'id': str(t.id),
                    'ticket_ref': t.ticket_ref,
                    'seq': t.seq,
                    'subject': t.subject,
                    'description': t.description,
                    'description_html': t.description_html,
                    'status': t.status,
                    'priority': t.priority,
                    'level': t.level,
                    'category': t.category,
                    'tags': t.tags,
                    'client_org_id': str(t.client_org_id or ''),
                    'requester_id': str(t.requester_id or ''),
                    'requester_name': t.requester_name,
                    'assignee_id': str(t.assignee_id or ''),
                    'group_id': str(t.group_id or ''),
                    'secondary_agent_ids': [str(pk) for pk in t.secondary_agents.values_list('id', flat=True)],
                    'merge_status': t.merge_status,
                    'merged_into_id': str(t.merged_into_id or ''),
                    'is_internal': t.is_internal,
                    'due_by': _dt(t.due_by),
                    'resolved_at': _dt(t.resolved_at),
                    'first_response_at': _dt(t.first_response_at),
                    'sla_status': t.sla_status,
                    'sla_breach_notified': t.sla_breach_notified,
                    'created_at': _dt(t.created_at),
                    'updated_at': _dt(t.updated_at),
                }
                for t in tickets
            ],
            'replies': [
                {
                    'id': str(r.id),
                    'ticket_id': str(r.ticket_id),
                    'author_id': str(r.author_id or ''),
                    'type': r.type,
                    'body': r.body,
                    'body_html': r.body_html,
                    'to_emails': r.to_emails,
                    'cc_emails': r.cc_emails,
                    'created_at': _dt(r.created_at),
                }
                for r in replies
            ],
            'notifications': [
                {
                    'id': str(n.id),
                    'recipient_id': str(n.recipient_id),
                    'actor_id': str(n.actor_id or ''),
                    'notif_type': n.notif_type,
                    'ticket_id': str(n.ticket_id or ''),
                    'message': n.message,
                    'is_read': n.is_read,
                    'created_at': _dt(n.created_at),
                }
                for n in notifications
            ],
            'timelogs': [
                {
                    'id': str(x.id),
                    'ticket_id': str(x.ticket_id),
                    'agent_id': str(x.agent_id or ''),
                    'minutes': x.minutes,
                    'date': x.date.isoformat(),
                    'description': x.description,
                    'created_at': _dt(x.created_at),
                }
                for x in timelogs
            ],
            'attachments': [
                {
                    'id': str(a.id),
                    'reply_id': str(a.reply_id or ''),
                    'ticket_id': str(a.ticket_id or ''),
                    'file': a.file.name if a.file else '',
                    'filename': a.filename,
                    'size': a.size,
                    'created_at': _dt(a.created_at),
                }
                for a in attachments
            ],
            'known_senders': [
                {
                    'client_org_id': str(k.client_org_id),
                    'email': k.email,
                    'name': k.name,
                    'created_at': _dt(k.created_at),
                }
                for k in known_senders
            ],
            'processed_emails': [
                {
                    'message_id': e.message_id,
                    'ticket_id': str(e.ticket_id or ''),
                    'reply_id': str(e.reply_id or ''),
                    'from_email': e.from_email,
                    'from_name': e.from_name,
                    'subject': e.subject,
                    'cc_emails': e.cc_emails,
                    'reply_to_email': e.reply_to_email,
                    'reply_to_raw': e.reply_to_raw,
                    'processed_at': _dt(e.processed_at),
                }
                for e in processed
            ],
        }
        self.stdout.write(json.dumps(payload, separators=(',', ':'), sort_keys=True))

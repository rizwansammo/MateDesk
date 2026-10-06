import hashlib
import json
import os
import uuid
from urllib.parse import unquote, urlparse

from django.core.management.base import BaseCommand, CommandError
from django.db import connections, transaction

from apps.email_ingestion.models import KnownSender, ProcessedEmail, TenantEmailSettings
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


def _source_db_config(url):
    parsed = urlparse(url)
    if parsed.scheme not in {'postgres', 'postgresql'}:
        raise CommandError('SOURCE_DATABASE_URL must be PostgreSQL.')
    if not parsed.hostname or not parsed.path or len(parsed.path) <= 1:
        raise CommandError('SOURCE_DATABASE_URL is incomplete.')
    return {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': parsed.path.lstrip('/'),
        'USER': unquote(parsed.username or ''),
        'PASSWORD': unquote(parsed.password or ''),
        'HOST': parsed.hostname,
        'PORT': str(parsed.port or 5432),
        # Defense in depth: source connection cannot write even if code regresses.
        'OPTIONS': {'options': '-c default_transaction_read_only=on'},
        'TIME_ZONE': None,
        'CONN_MAX_AGE': 0,
        'CONN_HEALTH_CHECKS': False,
        'AUTOCOMMIT': True,
        'ATOMIC_REQUESTS': False,
    }


def _norm(value):
    return (value or '').strip().lower()


def _schema_fingerprint(alias):
    with connections[alias].cursor() as cursor:
        cursor.execute('SELECT app, name FROM django_migrations ORDER BY app, name')
        rows = cursor.fetchall()
    return hashlib.sha256(
        json.dumps(rows, separators=(',', ':')).encode('utf-8')
    ).hexdigest(), len(rows)


def _as_uuid(value):
    return uuid.UUID(str(value))


def _m2m_pairs(through_model, alias, left_model, right_model, left_ids):
    left_field = next(
        f for f in through_model._meta.fields
        if getattr(f, 'related_model', None) is left_model
    )
    right_field = next(
        f for f in through_model._meta.fields
        if getattr(f, 'related_model', None) is right_model
    )
    return list(
        through_model.objects.using(alias)
        .filter(**{f'{left_field.name}_id__in': left_ids})
        .values_list(f'{left_field.name}_id', f'{right_field.name}_id')
    )


class Command(BaseCommand):
    help = (
        'Merge one source MateDesk tenant into an existing destination tenant. '
        'Source DB is forced read-only. Dry-run unless --apply is supplied.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--tenant', required=True)
        parser.add_argument('--apply', action='store_true')
        parser.add_argument(
            '--source-database-url-env',
            default='SOURCE_DATABASE_URL',
            help='Environment variable containing the source PostgreSQL URL.',
        )

    def handle(self, *args, **options):
        slug = options['tenant'].strip().lower()
        env_name = options['source_database_url_env']
        source_url = os.environ.get(env_name, '')
        if not source_url:
            raise CommandError(f'{env_name} is required.')

        connections.databases['source'] = _source_db_config(source_url)

        target_fp, target_migrations = _schema_fingerprint('default')
        source_fp, source_migrations = _schema_fingerprint('source')
        if target_fp != source_fp:
            raise CommandError(
                'Source/target schema fingerprints differ '
                f'({source_migrations} vs {target_migrations} migrations).'
            )

        try:
            target_tenant = Tenant.objects.get(slug=slug)
        except Tenant.DoesNotExist as exc:
            raise CommandError(f'Target tenant {slug!r} does not exist.') from exc

        try:
            source_tenant = Tenant.objects.using('source').get(slug=slug)
        except Tenant.DoesNotExist as exc:
            raise CommandError(f'Source tenant {slug!r} does not exist.') from exc

        if source_tenant.pk == target_tenant.pk:
            raise CommandError('Source and target tenant UUIDs are unexpectedly identical.')

        source_orgs = list(
            ClientOrganization.objects.using('source')
            .filter(tenant_id=source_tenant.pk)
            .values()
        )
        source_users = list(
            User.objects.using('source')
            .filter(tenant_id=source_tenant.pk)
            .values()
        )
        source_groups = list(
            SupportGroup.objects.using('source')
            .filter(tenant_id=source_tenant.pk)
            .values()
        )
        source_tickets = list(
            Ticket.objects.using('source')
            .filter(tenant_id=source_tenant.pk)
            .values()
        )
        source_ticket_ids = [row['id'] for row in source_tickets]
        source_replies = list(
            Reply.objects.using('source')
            .filter(ticket_id__in=source_ticket_ids)
            .values()
        )
        source_notifications = list(
            Notification.objects.using('source')
            .filter(tenant_id=source_tenant.pk)
            .values()
        )
        source_timelogs = list(
            TimeLog.objects.using('source')
            .filter(tenant_id=source_tenant.pk)
            .values()
        )
        source_attachments = list(
            Attachment.objects.using('source')
            .filter(tenant_id=source_tenant.pk)
            .values()
        )
        source_known = list(
            KnownSender.objects.using('source')
            .filter(tenant_id=source_tenant.pk)
            .values()
        )
        source_processed = list(
            ProcessedEmail.objects.using('source')
            .filter(tenant_id=source_tenant.pk)
            .values()
        )

        group_agent_pairs = _m2m_pairs(
            SupportGroup.agents.through,
            'source',
            SupportGroup,
            User,
            [row['id'] for row in source_groups],
        )
        ticket_secondary_pairs = _m2m_pairs(
            Ticket.secondary_agents.through,
            'source',
            Ticket,
            User,
            source_ticket_ids,
        )

        stats = {
            'organizations_matched': 0,
            'organizations_created': 0,
            'users_matched': 0,
            'users_created': 0,
            'support_groups_matched': 0,
            'support_groups_created': 0,
            'tickets_created': 0,
            'replies_created': 0,
            'notifications_created': 0,
            'timelogs_created': 0,
            'attachments_created': 0,
            'known_senders_created': 0,
            'known_senders_updated': 0,
            'processed_emails_created': 0,
            'processed_emails_skipped': 0,
        }

        with transaction.atomic():
            # Current standalone identity/contact state wins; platform billing,
            # limits and subscription fields remain destination-owned.
            target_tenant.name = source_tenant.name
            target_tenant.primary_color = source_tenant.primary_color
            target_tenant.timezone = source_tenant.timezone
            target_tenant.support_email = source_tenant.support_email
            target_tenant.phone = source_tenant.phone
            target_tenant.address = source_tenant.address
            target_tenant.website = source_tenant.website
            if source_tenant.branding:
                target_tenant.branding = source_tenant.branding
            target_tenant.save(update_fields=[
                'name', 'primary_color', 'timezone', 'support_email',
                'phone', 'address', 'website', 'branding',
            ])

            org_map = {}
            for row in source_orgs:
                domain = _norm(row.get('domain'))
                name = (row.get('name') or '').strip()
                qs = (
                    ClientOrganization.objects.filter(
                        tenant=target_tenant,
                        domain__iexact=domain,
                    )
                    if domain else
                    ClientOrganization.objects.filter(
                        tenant=target_tenant,
                        name__iexact=name,
                    )
                )
                if qs.count() > 1:
                    raise CommandError(f'Ambiguous organization match for source {row["id"]}.')
                obj = qs.first()
                created = obj is None

                if created:
                    if ClientOrganization.objects.filter(pk=row['id']).exists():
                        raise CommandError(f'Organization UUID collision: {row["id"]}.')
                    obj = ClientOrganization(id=row['id'], tenant=target_tenant)

                if (
                    ClientOrganization.objects
                    .filter(tenant=target_tenant, name__iexact=name)
                    .exclude(pk=obj.pk)
                    .exists()
                ):
                    raise CommandError(f'Organization name collision for source {row["id"]}.')

                for field in (
                    'name', 'domain', 'contact_name', 'contact_email', 'phone',
                    'address', 'timezone', 'business_hours', 'is_active',
                ):
                    setattr(obj, field, row[field])
                obj.tenant = target_tenant
                obj.save()

                if created:
                    ClientOrganization.objects.filter(pk=obj.pk).update(
                        created_at=row['created_at']
                    )
                org_map[str(row['id'])] = obj
                stats['organizations_created' if created else 'organizations_matched'] += 1

            user_map = {}
            for row in source_users:
                email = (row.get('email') or '').strip()
                qs = User.objects.filter(tenant=target_tenant, email__iexact=email)
                if qs.count() > 1:
                    raise CommandError(f'Ambiguous user match for source {row["id"]}.')
                obj = qs.first()
                created = obj is None

                if created:
                    if User.objects.filter(pk=row['id']).exists():
                        raise CommandError(f'User UUID collision: {row["id"]}.')
                    obj = User(id=row['id'], tenant=target_tenant)

                source_org_id = str(row.get('client_org_id') or '')
                obj.tenant = target_tenant
                obj.email = email
                # This is already a one-way Django password hash; it is never
                # printed or persisted outside the server-internal DB merge.
                obj.password = row['password']
                obj.last_login = row['last_login']
                obj.first_name = row['first_name']
                obj.last_name = row['last_name']
                obj.role = row['role']
                obj.client_org = org_map.get(source_org_id)
                obj.is_active = row['is_active']
                obj.is_staff = False
                obj.is_superuser = False
                for field in (
                    'job_title', 'department', 'phone', 'employee_id',
                    'reports_to', 'business_impact', 'deleted_org_name',
                    'is_vip', 'totp_enabled', 'email_2fa_enabled', 'totp_secret',
                ):
                    setattr(obj, field, row[field])
                obj.save()

                joined = row['date_joined']
                if not created and obj.date_joined:
                    joined = min(obj.date_joined, joined)
                User.objects.filter(pk=obj.pk).update(date_joined=joined)

                user_map[str(row['id'])] = obj
                stats['users_created' if created else 'users_matched'] += 1

            group_map = {}
            for row in source_groups:
                qs = SupportGroup.objects.filter(
                    tenant=target_tenant,
                    name__iexact=row['name'],
                )
                if qs.count() > 1:
                    raise CommandError(f'Ambiguous support group match for {row["id"]}.')
                obj = qs.first()
                created = obj is None
                if created:
                    if SupportGroup.objects.filter(pk=row['id']).exists():
                        raise CommandError(f'Support group UUID collision: {row["id"]}.')
                    obj = SupportGroup(id=row['id'], tenant=target_tenant)
                obj.name = row['name']
                obj.description = row['description']
                obj.is_default = row['is_default']
                obj.save()
                if created:
                    SupportGroup.objects.filter(pk=obj.pk).update(
                        created_at=row['created_at']
                    )
                group_map[str(row['id'])] = obj
                stats['support_groups_created' if created else 'support_groups_matched'] += 1

            group_agents = {}
            for group_id, user_id in group_agent_pairs:
                group_agents.setdefault(str(group_id), []).append(str(user_id))
            for group_id, user_ids in group_agents.items():
                group_map[group_id].agents.set([user_map[user_id] for user_id in user_ids])

            source_refs = [row['ticket_ref'] for row in source_tickets]
            if len(source_refs) != len(set(source_refs)):
                raise CommandError('Source contains duplicate ticket references.')
            existing_refs = set(
                Ticket.objects.filter(
                    tenant=target_tenant,
                    ticket_ref__in=source_refs,
                ).values_list('ticket_ref', flat=True)
            )
            if existing_refs:
                raise CommandError(
                    f'Ticket reference collision(s): {len(existing_refs)}.'
                )

            ticket_map = {}
            for row in source_tickets:
                if Ticket.objects.filter(pk=row['id']).exists():
                    raise CommandError(f'Ticket UUID collision: {row["id"]}.')
                obj = Ticket(
                    id=row['id'],
                    tenant=target_tenant,
                    ticket_ref=row['ticket_ref'],
                    seq=row['seq'],
                    subject=row['subject'],
                    description=row['description'],
                    description_html=row['description_html'],
                    status=row['status'],
                    priority=row['priority'],
                    level=row['level'],
                    category=row['category'],
                    tags=row['tags'],
                    client_org=org_map.get(str(row.get('client_org_id') or '')),
                    requester=user_map.get(str(row.get('requester_id') or '')),
                    requester_name=row['requester_name'],
                    assignee=user_map.get(str(row.get('assignee_id') or '')),
                    group=group_map.get(str(row.get('group_id') or '')),
                    merge_status=row['merge_status'],
                    merged_into=None,
                    is_internal=row['is_internal'],
                    due_by=row['due_by'],
                    resolved_at=row['resolved_at'],
                    first_response_at=row['first_response_at'],
                    sla_status=row['sla_status'],
                    sla_breach_notified=row['sla_breach_notified'],
                )
                obj.save()
                Ticket.objects.filter(pk=obj.pk).update(
                    created_at=row['created_at'],
                    updated_at=row['updated_at'],
                )
                ticket_map[str(row['id'])] = obj
                stats['tickets_created'] += 1

            secondary = {}
            for ticket_id, user_id in ticket_secondary_pairs:
                secondary.setdefault(str(ticket_id), []).append(str(user_id))
            for row in source_tickets:
                obj = ticket_map[str(row['id'])]
                merged_id = str(row.get('merged_into_id') or '')
                if merged_id:
                    if merged_id not in ticket_map:
                        raise CommandError(
                            f'Ticket {row["id"]} references a non-source merged ticket.'
                        )
                    Ticket.objects.filter(pk=obj.pk).update(
                        merged_into=ticket_map[merged_id]
                    )
                obj.secondary_agents.set(
                    [user_map[user_id] for user_id in secondary.get(str(row['id']), [])]
                )

            reply_map = {}
            for row in source_replies:
                if Reply.objects.filter(pk=row['id']).exists():
                    raise CommandError(f'Reply UUID collision: {row["id"]}.')
                ticket = ticket_map.get(str(row['ticket_id']))
                if ticket is None:
                    raise CommandError(f'Reply {row["id"]} references missing ticket.')
                obj = Reply.objects.create(
                    id=row['id'],
                    ticket=ticket,
                    author=user_map.get(str(row.get('author_id') or '')),
                    type=row['type'],
                    body=row['body'],
                    body_html=row['body_html'],
                    to_emails=row['to_emails'],
                    cc_emails=row['cc_emails'],
                )
                Reply.objects.filter(pk=obj.pk).update(created_at=row['created_at'])
                reply_map[str(row['id'])] = obj
                stats['replies_created'] += 1

            for row in source_notifications:
                if Notification.objects.filter(pk=row['id']).exists():
                    raise CommandError(f'Notification UUID collision: {row["id"]}.')
                recipient = user_map.get(str(row['recipient_id']))
                if recipient is None:
                    raise CommandError(
                        f'Notification {row["id"]} references missing recipient.'
                    )
                obj = Notification.objects.create(
                    id=row['id'],
                    tenant=target_tenant,
                    recipient=recipient,
                    actor=user_map.get(str(row.get('actor_id') or '')),
                    notif_type=row['notif_type'],
                    ticket=ticket_map.get(str(row.get('ticket_id') or '')),
                    message=row['message'],
                    is_read=row['is_read'],
                )
                Notification.objects.filter(pk=obj.pk).update(
                    created_at=row['created_at']
                )
                stats['notifications_created'] += 1

            for row in source_timelogs:
                if TimeLog.objects.filter(pk=row['id']).exists():
                    raise CommandError(f'TimeLog UUID collision: {row["id"]}.')
                ticket = ticket_map.get(str(row['ticket_id']))
                if ticket is None:
                    raise CommandError(f'TimeLog {row["id"]} references missing ticket.')
                obj = TimeLog.objects.create(
                    id=row['id'],
                    tenant=target_tenant,
                    ticket=ticket,
                    agent=user_map.get(str(row.get('agent_id') or '')),
                    minutes=row['minutes'],
                    date=row['date'],
                    description=row['description'],
                )
                TimeLog.objects.filter(pk=obj.pk).update(created_at=row['created_at'])
                stats['timelogs_created'] += 1

            for row in source_attachments:
                if Attachment.objects.filter(pk=row['id']).exists():
                    raise CommandError(f'Attachment UUID collision: {row["id"]}.')
                ticket = ticket_map.get(str(row.get('ticket_id') or ''))
                reply = reply_map.get(str(row.get('reply_id') or ''))
                if ticket is None and reply is None:
                    raise CommandError(
                        f'Attachment {row["id"]} references no imported ticket/reply.'
                    )
                obj = Attachment.objects.create(
                    id=row['id'],
                    tenant=target_tenant,
                    ticket=ticket,
                    reply=reply,
                    file=row['file'],
                    filename=row['filename'],
                    size=row['size'],
                )
                Attachment.objects.filter(pk=obj.pk).update(
                    created_at=row['created_at']
                )
                stats['attachments_created'] += 1

            for row in source_known:
                org = org_map.get(str(row['client_org_id']))
                if org is None:
                    raise CommandError('KnownSender references missing organization.')
                obj = (
                    KnownSender.objects
                    .filter(tenant=target_tenant, email__iexact=row['email'])
                    .first()
                )
                if obj is None:
                    obj = KnownSender.objects.create(
                        tenant=target_tenant,
                        client_org=org,
                        email=row['email'],
                        name=row['name'],
                    )
                    KnownSender.objects.filter(pk=obj.pk).update(
                        created_at=row['created_at']
                    )
                    stats['known_senders_created'] += 1
                else:
                    obj.client_org = org
                    obj.email = row['email']
                    obj.name = row['name']
                    obj.save(update_fields=['client_org', 'email', 'name'])
                    stats['known_senders_updated'] += 1

            for row in source_processed:
                if ProcessedEmail.objects.filter(
                    tenant=target_tenant,
                    message_id=row['message_id'],
                ).exists():
                    stats['processed_emails_skipped'] += 1
                    continue
                obj = ProcessedEmail.objects.create(
                    tenant=target_tenant,
                    message_id=row['message_id'],
                    ticket=ticket_map.get(str(row.get('ticket_id') or '')),
                    reply=reply_map.get(str(row.get('reply_id') or '')),
                    from_email=row['from_email'],
                    from_name=row['from_name'],
                    subject=row['subject'],
                    cc_emails=row['cc_emails'],
                    reply_to_email=row['reply_to_email'],
                    reply_to_raw=row['reply_to_raw'],
                )
                ProcessedEmail.objects.filter(pk=obj.pk).update(
                    processed_at=row['processed_at']
                )
                stats['processed_emails_created'] += 1

            # Old destination email polling must not race the standalone source.
            TenantEmailSettings.objects.filter(tenant=target_tenant).update(
                imap_enabled=False,
                smtp_enabled=False,
            )

            if not options['apply']:
                transaction.set_rollback(True)

        self.stdout.write(json.dumps({
            'mode': 'applied' if options['apply'] else 'dry-run',
            'tenant': slug,
            'schema_fingerprint': target_fp,
            'stats': stats,
            'email_settings': 'destination-disabled; reconnect/current-source handoff required',
        }, sort_keys=True))

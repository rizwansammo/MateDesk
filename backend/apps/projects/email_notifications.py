"""Secure work item email notifications and inbound reply routing."""
import logging
import re
import uuid
from email.message import EmailMessage
from email.utils import formataddr

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.email_ingestion import matemail
from apps.email_ingestion.models import AUTH_METHOD_MATEMAIL, ProcessedEmail
from apps.users.permissions import CLIENT_ROLES
from .models import ProjectEmailNotification, ProjectEmailReply, ProjectMember, WorkItemComment

logger = logging.getLogger(__name__)
ID_PATTERN = re.compile(r'<[^<>\r\n]{1,996}>')
OWN_PREFIX = '<mdproj.'


def _ids(header):
    return ID_PATTERN.findall(str(header or '')[:10000])


def _project_url(notification):
    domain = str(getattr(settings, 'APP_DOMAIN', '') or 'matedesk.pro').strip().lower()
    if not re.fullmatch(r'[a-z0-9.-]+', domain):
        domain = 'matedesk.pro'
    host = domain
    if getattr(settings, 'DEPLOYMENT_MODE', 'multi_tenant') == 'multi_tenant':
        host = f'{notification.tenant.slug}.{domain}'
    return f'https://{host}/projects/{notification.work_item.project_id}/work-items/{notification.work_item_id}'


def send_project_notification(notification):
    """Attempt exactly once; store actual MateMail Message-ID after send."""
    if notification.status != 'pending':
        return notification.status == 'sent'
    try:
        mail_settings = notification.tenant.email_settings
    except Exception:
        mail_settings = None
    if not mail_settings:
        ProjectEmailNotification.objects.filter(pk=notification.pk, status='pending').update(
            status='failed', last_error='Outbound mailbox is not configured.')
        return False

    connected = mail_settings.auth_method == AUTH_METHOD_MATEMAIL
    if connected:
        from_addr = mail_settings.matemail_mailbox_email
        ready = (mail_settings.smtp_enabled and mail_settings.matemail_tenant_id
                 and mail_settings.get_matemail_access_token() and from_addr)
    else:
        from_addr = mail_settings.smtp_from_email
        ready = mail_settings.smtp_enabled and mail_settings.smtp_host and from_addr
    if not ready:
        ProjectEmailNotification.objects.filter(pk=notification.pk, status='pending').update(
            status='failed', last_error='Outbound mailbox is not ready.')
        return False

    recipient = notification.recipient.email.strip()
    if any('\n' in value or '\r' in value for value in [recipient, from_addr]):
        ProjectEmailNotification.objects.filter(pk=notification.pk, status='pending').update(
            status='failed', last_error='Invalid outbound address.')
        return False
    item = notification.work_item
    note = notification.note.strip()
    body = (
        f'Project: {item.project.name}\n'
        f'Work Item: {item.ref}\n'
        f'Title: {item.title}\n'
        f'Status: {item.status.replace("_", " ").title()}\n\n'
        + (f'Update:\n{note}\n\n' if note else '')
        + f'Open work item: {_project_url(notification)}\n\n'
        'Reply to add feedback to this Work Item. Email replies are comments, not formal approval.\n'
    )
    subject = notification.subject.replace('\r', ' ').replace('\n', ' ')
    try:
        if connected:
            result = matemail.send_message(
                token=mail_settings.get_matemail_access_token(),
                tenant_id=mail_settings.matemail_tenant_id,
                payload={
                    'from_address': from_addr, 'to': [recipient], 'cc': [], 'bcc': [],
                    'subject': subject, 'text': body, 'html': '',
                    'in_reply_to': '', 'references': [], 'attachments': [],
                    'idempotency_key': f'matedesk-project-{notification.id}',
                },
            )
            message_id = str(result.get('message_id') or '').strip()
            if not result.get('sent') or not ID_PATTERN.fullmatch(message_id):
                raise ValueError('MateMail did not confirm the sent Message ID.')
        else:
            from apps.email_ingestion.services import _smtp_connect
            host = from_addr.rsplit('@', 1)[-1].lower()
            if not re.fullmatch(r'[a-z0-9.-]+', host):
                raise ValueError('Invalid outbound mailbox domain.')
            message_id = f'<mdproj.{uuid.uuid4().hex}@{host}>'
            msg = EmailMessage()
            msg['Subject'] = subject
            msg['From'] = formataddr((mail_settings.smtp_from_name or 'Project Updates', from_addr))
            msg['To'] = recipient
            msg['Reply-To'] = from_addr
            msg['Message-ID'] = message_id
            msg['Auto-Submitted'] = 'auto-generated'
            msg.set_content(body)
            smtp = _smtp_connect(mail_settings)
            try:
                smtp.sendmail(from_addr, [recipient], msg.as_string())
            finally:
                smtp.quit()
        ProjectEmailNotification.objects.filter(pk=notification.pk, status='pending').update(
            status='sent', sent_at=timezone.now(), message_id=message_id, last_error='')
        return True
    except Exception:
        logger.exception('Project notification delivery failed: %s', notification.id)
        ProjectEmailNotification.objects.filter(pk=notification.pk, status='pending').update(
            status='failed', last_error='Email delivery was not confirmed.')
        return False


def _reply_body(msg):
    from apps.email_ingestion.services import _get_body
    lines = []
    for line in (_get_body(msg) or '').splitlines():
        stripped = line.strip()
        if (stripped.startswith('>') or stripped == '-----Original Message-----'
                or stripped == '-- '
                or re.match(r'^On .{4,200} wrote:$', stripped, re.I)
                or re.match(r'^From:\s+.{3,}', stripped, re.I)):
            break
        lines.append(line)
    return '\n'.join(lines).strip()[:10000]


def route_project_email_reply(tenant, msg, *, message_id, from_address, from_name, subject):
    """Consume matched project threads before the original ticket parser.

    Match RFC reply headers only. Never route by subject or trust Reply-To as
    the sender identity. Every reply is bound to a sent notification and its
    exact authorized client reviewer. Invalid replies never become tickets.
    """
    ids = list(dict.fromkeys(_ids(msg.get('In-Reply-To')) + _ids(msg.get('References'))))
    if not ids:
        return False
    matches = list(ProjectEmailNotification.objects.filter(
        tenant=tenant, status='sent', message_id__in=ids,
    ).select_related('recipient', 'work_item', 'work_item__project').order_by('id'))
    if not matches:
        # Explicit SMTP notification marker from a different tenant or a
        # removed notification. Never let it fall through to ticket creation.
        return any(mid.lower().startswith(OWN_PREFIX) for mid in ids)

    # Multiple thread roots can indicate deliberate header manipulation.
    notification = matches[0] if len({m.id for m in matches}) == 1 else None
    sender = None
    from_address = (from_address or '').strip().casefold()
    if notification:
        recipient = notification.recipient
        item = notification.work_item
        project = item.project
        auto = (msg.get('Auto-Submitted') or '').strip().lower()
        precedence = (msg.get('Precedence') or '').strip().lower()
        if (from_address == recipient.email.casefold()
                and recipient.is_active
                and recipient.role in CLIENT_ROLES
                and recipient.tenant_id == tenant.id
                and recipient.client_org_id == project.client_org_id
                and project.client_org.is_active
                and project.visibility == 'client'
                and project.status != 'archived'
                and item.visibility == 'client'
                and (not auto or auto == 'no')
                and precedence not in {'bulk', 'junk', 'list'}
                and ProjectMember.objects.filter(
                    project=project, user=recipient, role='client_reviewer',
                ).exists()):
            sender = recipient

    with transaction.atomic():
        if ProcessedEmail.objects.filter(tenant=tenant, message_id=message_id).exists():
            return True
        if sender:
            body = _reply_body(msg)
            if body:
                comment = WorkItemComment.objects.create(
                    work_item=notification.work_item, author=sender,
                    visibility='client', body=body,
                )
                ProjectEmailReply.objects.create(
                    tenant=tenant, notification=notification, comment=comment,
                    message_id=message_id, from_email=from_address,
                )
        ProcessedEmail.objects.create(
            tenant=tenant, message_id=message_id,
            from_email=from_address or 'unknown@invalid.local',
            from_name=from_name, subject=subject[:998],
        )
    if not sender:
        logger.warning('Rejected unauthorized Project Reply, tenant=%s', tenant.pk)
    return True

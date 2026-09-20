from datetime import timedelta
from django.conf import settings
from django.utils import timezone


def _get_total_pause_minutes(ticket) -> float:
    """Sum of all completed + in-progress pause intervals for a ticket."""
    from .models import SLAPauseLog
    now = timezone.now()
    total = 0.0
    for p in SLAPauseLog.objects.filter(ticket=ticket):
        end = p.resumed_at or now
        total += (end - p.paused_at).total_seconds() / 60
    return total


def get_matching_policy(ticket):
    """Return the lowest priority_order active SLAPolicy that matches this ticket."""
    if getattr(ticket, 'is_internal', False):
        return None
    from .models import SLAPolicy
    policies = SLAPolicy.objects.filter(
        tenant=ticket.tenant, is_active=True
    ).prefetch_related('targets').order_by('priority_order')

    for policy in policies:
        if policy.scope_type == 'all_orgs':
            return policy
        if policy.scope_type == 'specific_org':
            if ticket.client_org_id and str(ticket.client_org_id) == str(policy.scope_org_id):
                return policy
        # after_hours: Phase B — skip until Business Hours is implemented
    return None


def compute_sla_status(ticket) -> str:
    """Compute the SLA status string for a ticket based on elapsed time vs targets."""
    policy = get_matching_policy(ticket)
    if not policy:
        return 'not_applied'

    try:
        target = policy.targets.get(priority=ticket.priority)
    except Exception:
        return 'not_applied'

    now         = timezone.now()
    pause_delta = timedelta(minutes=_get_total_pause_minutes(ticket))

    # Due timestamps shift forward by total pause duration
    first_response_due = ticket.created_at + timedelta(minutes=target.first_response_minutes) + pause_delta
    resolution_due     = ticket.created_at + timedelta(minutes=target.resolution_minutes)     + pause_delta

    if ticket.status in ('solved', 'closed'):
        if ticket.first_response_at is None or ticket.first_response_at > first_response_due:
            return 'breached'
        # A finished ticket's verdict must be stable. Falling back to `now` when
        # resolved_at is missing made the answer depend on when it was asked —
        # the same ticket read later flipped from completed to breached. The
        # upstream cause (closing a ticket NULLed resolved_at) is fixed in
        # tickets/views.py; this guard means a future path that forgets the
        # timestamp degrades to "cannot prove a breach" rather than inventing one.
        if ticket.resolved_at is not None and ticket.resolved_at > resolution_due:
            return 'breached'
        return 'completed'

    # Active ticket — first response breach.
    #
    # A missed first response is permanent: once the target passes, the SLA was
    # missed and the record says so for the rest of the ticket's life. Previously
    # only the `is None` case was checked, so an agent replying late made this
    # check fall through — the ticket reverted from breached to on_track and
    # sla_breach_notified was cleared, which undercounted breaches and allowed a
    # second notification later. It also disagreed with the solved/closed branch
    # above, which has always treated a late first response as a breach.
    if ticket.first_response_at is None:
        if now > first_response_due:
            return 'breached'
    elif ticket.first_response_at > first_response_due:
        return 'breached'

    # Resolution breach
    if now > resolution_due:
        return 'breached'

    # Due soon warning
    due_soon_at = resolution_due - timedelta(minutes=target.due_soon_minutes)
    if now >= due_soon_at:
        return 'due_soon'

    return 'on_track'


def refresh_ticket_sla(ticket) -> None:
    """Recompute sla_status and persist via UPDATE (no post_save loop)."""
    new_status  = compute_sla_status(ticket)
    prev_status = ticket.sla_status

    if prev_status == new_status:
        return

    from apps.tickets.models import Ticket
    update_fields: dict = {'sla_status': new_status}

    if new_status == 'breached' and not ticket.sla_breach_notified:
        update_fields['sla_breach_notified'] = True
        Ticket.objects.filter(pk=ticket.pk).update(**update_fields)
        ticket.sla_status           = new_status
        ticket.sla_breach_notified  = True
        # Fire outside the UPDATE call to avoid slowing down the save path on failure
        try:
            send_breach_emails(ticket)
        except Exception:
            pass
        return

    # Reset notified flag if ticket recovers (e.g. re-opens after close without breach)
    if prev_status == 'breached' and new_status != 'breached':
        update_fields['sla_breach_notified'] = False
        ticket.sla_breach_notified = False

    Ticket.objects.filter(pk=ticket.pk).update(**update_fields)
    ticket.sla_status = new_status


def send_breach_emails(ticket) -> None:
    """Send breach notification emails to addresses configured on the matching SLA policy."""
    policy = get_matching_policy(ticket)
    if not policy or not policy.breach_emails:
        return

    subject = f'[SLA BREACH] {ticket.ticket_ref}: {ticket.subject}'
    body = (
        f'SLA breach detected for ticket {ticket.ticket_ref}.\n\n'
        f'Subject:      {ticket.subject}\n'
        f'Organization: {ticket.client_org.name if ticket.client_org else "—"}\n'
        f'Priority:     {ticket.get_priority_display()}\n'
        f'Status:       {ticket.get_status_display()}\n'
        f'Created:      {ticket.created_at.strftime("%Y-%m-%d %H:%M UTC")}\n\n'
        f'Please review and take immediate action.'
    )

    for addr in policy.breach_emails:
        _smtp_send(ticket.tenant, to_addr=addr, subject=subject, body=body)


def send_vip_email(ticket) -> None:
    """Send VIP alert email when a VIP user creates a ticket."""
    product_name = getattr(settings, 'PRODUCT_NAME', 'MateDesk')
    try:
        vip_rule = ticket.tenant.vip_rule
    except Exception:
        return

    if not vip_rule.is_active or not vip_rule.notification_emails:
        return

    requester_name = ticket.requester.full_name if ticket.requester else ticket.requester_name or 'Unknown'
    org_name       = ticket.client_org.name if ticket.client_org else '—'

    subject = f'[VIP TICKET] New ticket from {requester_name} — {ticket.ticket_ref}'
    body = (
        f'Hi Team,\n\n'
        f'A new ticket has arrived from {requester_name} from {org_name}. '
        f'Please respond as early as possible and ensure uninterrupted service.\n\n'
        f'Description:\n'
        f'VIP user - {requester_name} - Raised a Support Ticket in {product_name}\n\n'
        f'Ticket ID:       {ticket.ticket_ref}\n'
        f'Requester name:  {requester_name}\n'
        f'Subject:         {ticket.subject}\n'
        f'Organization:    {org_name}\n\n'
        f'Regards,\n'
        f'{product_name}'
    )

    for addr in vip_rule.notification_emails:
        _smtp_send(ticket.tenant, to_addr=addr, subject=subject, body=body)


def _smtp_send(tenant, to_addr: str, subject: str, body: str) -> None:
    """Send a plain-text email via the tenant's configured SMTP settings."""
    import smtplib
    from email.mime.text import MIMEText

    try:
        smtp_cfg = tenant.email_settings
    except Exception:
        return

    if not getattr(smtp_cfg, 'smtp_enabled', False) or not getattr(smtp_cfg, 'smtp_host', ''):
        return

    from_addr = smtp_cfg.smtp_from_email or smtp_cfg.smtp_username
    from_name = getattr(smtp_cfg, 'smtp_from_name', None) or getattr(settings, 'PRODUCT_NAME', 'MateDesk')

    msg             = MIMEText(body, 'plain', 'utf-8')
    msg['Subject']  = subject
    msg['From']     = f'{from_name} <{from_addr}>'
    msg['To']       = to_addr

    try:
        if getattr(smtp_cfg, 'smtp_use_tls', True):
            server = smtplib.SMTP(smtp_cfg.smtp_host, smtp_cfg.smtp_port, timeout=15)
            server.starttls()
        else:
            server = smtplib.SMTP_SSL(smtp_cfg.smtp_host, smtp_cfg.smtp_port, timeout=15)
        server.login(smtp_cfg.smtp_username, smtp_cfg.smtp_password)
        server.sendmail(from_addr, [to_addr], msg.as_string())
        server.quit()
    except Exception:
        pass

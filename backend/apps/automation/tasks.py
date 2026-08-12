from celery import shared_task
from django.utils import timezone


@shared_task(name='apps.automation.tasks.run_overdue_ticket_rules')
def run_overdue_ticket_rules():
    """Fire ticket_overdue trigger for each overdue ticket that hasn't been fired yet."""
    from apps.tickets.models import Ticket
    from .models import AutomationRule, AutomationLog
    from .engine import run_automation_rules

    tenant_ids = (
        AutomationRule.objects
        .filter(is_active=True, trigger='ticket_overdue')
        .values_list('tenant_id', flat=True)
        .distinct()
    )

    for tenant_id in tenant_ids:
        overdue_tickets = (
            Ticket.objects
            .filter(
                tenant_id=tenant_id,
                due_by__lt=timezone.now(),
                status__in=['open', 'pending', 'in_progress', 'waiting_on_customer'],
            )
            .select_related('client_org', 'group', 'assignee', 'requester')
        )
        already_fired = set(
            AutomationLog.objects
            .filter(tenant_id=tenant_id, trigger='ticket_overdue')
            .values_list('ticket_ref', flat=True)
        )
        for ticket in overdue_tickets:
            if ticket.ticket_ref not in already_fired:
                run_automation_rules(ticket, 'ticket_overdue')


@shared_task(name='apps.automation.tasks.run_stale_ticket_rules')
def run_stale_ticket_rules():
    """Fire ticket_stale for tickets not updated in 24h, at most once per 24h window."""
    from apps.tickets.models import Ticket
    from .models import AutomationRule, AutomationLog
    from .engine import run_automation_rules
    from datetime import timedelta

    stale_threshold = timezone.now() - timedelta(hours=24)
    window_start    = timezone.now() - timedelta(hours=24)

    tenant_ids = (
        AutomationRule.objects
        .filter(is_active=True, trigger='ticket_stale')
        .values_list('tenant_id', flat=True)
        .distinct()
    )

    for tenant_id in tenant_ids:
        stale_tickets = (
            Ticket.objects
            .filter(
                tenant_id=tenant_id,
                updated_at__lt=stale_threshold,
                status__in=['open', 'pending', 'in_progress', 'waiting_on_customer'],
            )
            .select_related('client_org', 'group', 'assignee', 'requester')
        )
        recently_fired = set(
            AutomationLog.objects
            .filter(
                tenant_id=tenant_id,
                trigger='ticket_stale',
                fired_at__gte=window_start,
            )
            .values_list('ticket_ref', flat=True)
        )
        for ticket in stale_tickets:
            if ticket.ticket_ref not in recently_fired:
                run_automation_rules(ticket, 'ticket_stale')

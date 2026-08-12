from django.db.models.signals import pre_save, post_save
from django.dispatch import receiver
from apps.tickets.models import Ticket, Reply


@receiver(pre_save, sender=Ticket, dispatch_uid='automation_ticket_pre_save')
def automation_ticket_pre_save(sender, instance, **kwargs):
    if not instance.pk:
        return
    try:
        old = Ticket.objects.get(pk=instance.pk)
        instance._auto_old_status      = old.status
        instance._auto_old_priority    = old.priority
        instance._auto_old_assignee_id = old.assignee_id
        instance._auto_old_sla_status  = old.sla_status
    except Ticket.DoesNotExist:
        instance._auto_old_status      = None
        instance._auto_old_priority    = None
        instance._auto_old_assignee_id = None
        instance._auto_old_sla_status  = None


@receiver(post_save, sender=Ticket, dispatch_uid='automation_ticket_post_save')
def automation_ticket_post_save(sender, instance, created, **kwargs):
    try:
        from .engine import run_automation_rules

        if created:
            run_automation_rules(instance, 'ticket_created')
            return

        run_automation_rules(instance, 'ticket_updated')

        old_status      = getattr(instance, '_auto_old_status',      None)
        old_priority    = getattr(instance, '_auto_old_priority',    None)
        old_assignee_id = getattr(instance, '_auto_old_assignee_id', None)
        old_sla_status  = getattr(instance, '_auto_old_sla_status',  None)

        if instance.status in ('solved', 'closed') and old_status not in ('solved', 'closed'):
            if instance.status == 'closed':
                run_automation_rules(instance, 'ticket_closed')
            else:
                run_automation_rules(instance, 'ticket_solved')

        if instance.assignee_id != old_assignee_id:
            if instance.assignee_id and not old_assignee_id:
                run_automation_rules(instance, 'ticket_assigned')
            elif not instance.assignee_id and old_assignee_id:
                run_automation_rules(instance, 'ticket_unassigned')

        _priority_order = ['low', 'normal', 'high', 'critical']
        try:
            old_pri_idx = _priority_order.index(old_priority or 'low')
            new_pri_idx = _priority_order.index(instance.priority or 'low')
            if new_pri_idx > old_pri_idx:
                run_automation_rules(instance, 'priority_escalated')
        except ValueError:
            pass

        if instance.sla_status == 'breached' and old_sla_status != 'breached':
            run_automation_rules(instance, 'sla_breached')

    except Exception:
        pass


@receiver(post_save, sender=Reply, dispatch_uid='automation_reply_post_save')
def automation_reply_post_save(sender, instance, created, **kwargs):
    if not created:
        return
    if instance.type == 'system_event':
        return
    if isinstance(instance.body, str) and instance.body.startswith('[Automation]'):
        return
    try:
        from .engine import run_automation_rules
        run_automation_rules(instance.ticket, 'reply_added', reply=instance)

        # customer_replied fires only for public replies from non-MSP users
        if instance.type == 'public_reply':
            author = instance.author
            if author:
                from apps.users.permissions import MSP_ROLES
                if getattr(author, 'role', None) not in MSP_ROLES:
                    run_automation_rules(instance.ticket, 'customer_replied', reply=instance)
    except Exception:
        pass

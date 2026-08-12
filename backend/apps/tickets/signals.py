from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import Ticket, Reply, Notification


def _bulk_create(notifications):
    if notifications:
        Notification.objects.bulk_create(notifications, ignore_conflicts=True)


@receiver(post_save, sender=Ticket)
def ticket_post_save(sender, instance, created, **kwargs):
    from apps.users.permissions import MSP_ROLES
    from apps.users.models import User

    ticket = instance

    if created:
        # Notify all MSP staff in the tenant except the creator (requester if internal)
        staff = User.objects.filter(
            tenant=ticket.tenant,
            role__in=MSP_ROLES,
            is_active=True,
        ).exclude(id=ticket.requester_id)

        actor = ticket.requester if ticket.requester_id else None
        actor_name = actor.full_name if actor else 'Someone'

        _bulk_create([
            Notification(
                tenant=ticket.tenant,
                recipient=user,
                actor=actor,
                notif_type='new_ticket',
                ticket=ticket,
                message=f'{actor_name} created {ticket.ticket_ref}: {ticket.subject[:80]}',
            )
            for user in staff
        ])
        return

    # Detect assignee change — Django doesn't pass pre-save state in post_save,
    # so we rely on update_fields hint. If assignee changed, notify the new assignee.
    update_fields = kwargs.get('update_fields') or []
    if 'assignee_id' in update_fields or not update_fields:
        if ticket.assignee_id:
            # Don't notify if the assignee assigned themselves
            actor = _get_last_actor(ticket)
            if ticket.assignee != actor:
                Notification.objects.get_or_create(
                    tenant=ticket.tenant,
                    recipient=ticket.assignee,
                    notif_type='assigned',
                    ticket=ticket,
                    # Deduplicate: one unread assignment notification per ticket per assignee
                    is_read=False,
                    defaults={
                        'actor': actor,
                        'message': f'You were assigned to {ticket.ticket_ref}: {ticket.subject[:80]}',
                    },
                )


def _get_last_actor(ticket):
    """Best-effort: last reply author, otherwise None."""
    last_reply = ticket.replies.order_by('-created_at').first()
    return last_reply.author if last_reply else None


@receiver(post_save, sender=Reply)
def reply_post_save(sender, instance, created, **kwargs):
    if not created:
        return

    reply  = instance
    ticket = reply.ticket
    author = reply.author

    # Notify assignee when someone else replies
    if ticket.assignee and ticket.assignee != author:
        author_name = author.full_name if author else 'Someone'
        Notification.objects.create(
            tenant=ticket.tenant,
            recipient=ticket.assignee,
            actor=author,
            notif_type='new_reply',
            ticket=ticket,
            message=f'{author_name} replied on {ticket.ticket_ref}: {ticket.subject[:60]}',
        )

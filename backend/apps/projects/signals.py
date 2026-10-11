"""Capture important project activity from existing ticket and comment workflows.

Signals keep Client Feedback and Support Ticket replies visible even when made
through existing Helpdesk, Worker, or future trusted mail intake paths.
"""
from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.tickets.models import Reply
from apps.users.permissions import CLIENT_ROLES

from .activity import record_activity
from .models import TicketProjectAssociation, WorkItemComment


@receiver(post_save, sender=TicketProjectAssociation, dispatch_uid='projects_activity_ticket_linked')
def ticket_project_associated(sender, instance, created, **kwargs):
    if not created:
        return
    ticket = instance.ticket
    if ticket.category == 'Project Support':
        record_activity(
            instance.project, kind='support_ticket_created',
            actor=ticket.requester, ticket=ticket,
            summary=f'New Project Support Ticket {ticket.ticket_ref}',
            visibility='client' if not ticket.is_internal else 'internal',
        )
    else:
        record_activity(
            instance.project, kind='ticket_linked',
            actor=instance.linked_by, ticket=ticket,
            summary=f'Support Ticket {ticket.ticket_ref} linked to project',
            visibility='internal',
        )


@receiver(post_save, sender=WorkItemComment, dispatch_uid='projects_activity_comment')
def project_comment_activity(sender, instance, created, **kwargs):
    if not created:
        return
    item = instance.work_item
    is_client = instance.author_id and instance.author.role in CLIENT_ROLES
    record_activity(
        item.project,
        kind='client_feedback' if is_client else 'staff_feedback',
        actor=instance.author, work_item=item,
        summary=f'New feedback on {item.ref}',
        visibility=instance.visibility,
    )


@receiver(post_save, sender=Reply, dispatch_uid='projects_activity_ticket_reply')
def project_ticket_reply_activity(sender, instance, created, **kwargs):
    if not created or instance.type not in ('public_reply', 'internal_note'):
        return
    from django.utils import timezone
    from apps.tickets.models import Ticket
    from .models import ProjectRequest

    # Keep the working inbox ordered by actual conversations, not only Ticket
    # metadata changes. No model save signal is fired by queryset updates.
    now = timezone.now()
    Ticket.objects.filter(pk=instance.ticket_id).update(updated_at=now)
    ProjectRequest.objects.filter(ticket_id=instance.ticket_id).update(updated_at=now)
    association = TicketProjectAssociation.objects.select_related(
        'project', 'ticket'
    ).filter(ticket_id=instance.ticket_id).first()
    if association is None:
        return
    from_client = bool(instance.author_id and instance.author.role in CLIENT_ROLES)
    if instance.type == 'internal_note':
        event_kind = 'staff_ticket_reply'
        visibility = 'internal'
    else:
        event_kind = 'client_ticket_reply' if from_client else 'staff_ticket_reply'
        visibility = 'client'
    record_activity(
        association.project, kind=event_kind, actor=instance.author,
        ticket=association.ticket,
        summary=f'New reply on Ticket {association.ticket.ticket_ref}',
        visibility=visibility,
    )

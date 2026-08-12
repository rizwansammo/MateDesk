def sla_ticket_post_save(sender, instance, created, **kwargs):
    """Recompute SLA status whenever a ticket is saved. On creation, send VIP alert if applicable."""
    from .services import refresh_ticket_sla, send_vip_email
    refresh_ticket_sla(instance)
    if created:
        requester = instance.requester
        if requester and getattr(requester, 'is_vip', False):
            send_vip_email(instance)


def sla_reply_post_save(sender, instance, created, **kwargs):
    """Set first_response_at on the ticket for the first public agent reply."""
    if not created:
        return

    reply  = instance
    ticket = reply.ticket

    if (
        reply.author_id
        and reply.type == 'public_reply'
        and ticket.first_response_at is None
    ):
        try:
            author = reply.author
        except Exception:
            return

        if author.is_msp_staff:
            from apps.tickets.models import Ticket
            Ticket.objects.filter(pk=ticket.pk).update(first_response_at=reply.created_at)
            ticket.first_response_at = reply.created_at

    from .services import refresh_ticket_sla
    refresh_ticket_sla(ticket)

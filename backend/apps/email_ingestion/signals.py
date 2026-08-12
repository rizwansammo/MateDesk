# Signal-based email sending removed.
# Outbound SMTP is triggered explicitly in TicketViewSet.add_reply()
# (apps/tickets/views.py) so only agent web replies trigger an outbound email.
# Email-ingested replies must never loop back to the sender.

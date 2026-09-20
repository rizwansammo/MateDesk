from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase, override_settings

from apps.sla.services import send_vip_email


class VIPNotificationBrandingTests(SimpleTestCase):
    @override_settings(PRODUCT_NAME='NetaMate HelpDesk')
    @patch('apps.sla.services._smtp_send')
    def test_vip_notification_uses_deployment_product_name(self, smtp_send):
        tenant = SimpleNamespace(
            vip_rule=SimpleNamespace(
                is_active=True,
                notification_emails=['alerts@example.com'],
            )
        )
        ticket = SimpleNamespace(
            tenant=tenant,
            requester=SimpleNamespace(full_name='VIP User'),
            requester_name='',
            client_org=SimpleNamespace(name='Client Co'),
            ticket_ref='TKT-1001',
            subject='Critical issue',
        )

        send_vip_email(ticket)

        smtp_send.assert_called_once()
        kwargs = smtp_send.call_args.kwargs
        self.assertIn('Raised a Support Ticket in NetaMate HelpDesk', kwargs['body'])
        self.assertIn('Regards,\nNetaMate HelpDesk', kwargs['body'])

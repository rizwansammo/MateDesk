from unittest.mock import patch

from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.email_ingestion.models import (
    AUTH_METHOD_MATEMAIL,
    TenantEmailSettings,
)
from apps.tenants.models import Tenant
from apps.users.models import User


START_URL = "/api/email-settings/matemail/start/"
COMPLETE_URL = "/api/email-settings/matemail/complete/"
DISCONNECT_URL = "/api/email-settings/matemail/disconnect/"


def _tenant():
    return Tenant.objects.create(
        name="Connected App Test",
        slug="connected-app-test",
        is_active=True,
    )


def _user(tenant):
    return User.objects.create_user(
        email="owner@connected.test",
        password="testpass123",
        first_name="Owner",
        last_name="Test",
        role="msp_owner",
        tenant=tenant,
    )


def _client(user):
    client = APIClient()
    client.credentials(
        HTTP_AUTHORIZATION=f"Bearer {AccessToken.for_user(user)}"
    )
    return client


@override_settings(DEBUG=True)
class MateMailConnectedAppTest(TestCase):
    def setUp(self):
        self.tenant = _tenant()
        self.user = _user(self.tenant)
        self.client = _client(self.user)

    @patch("apps.email_ingestion.views.matemail.start_connection")
    def test_start_secret_is_passed_through_and_never_saved(self, start):
        start.return_value = {
            "tenant_id": "11111111-1111-1111-1111-111111111111",
            "authorization_url": "https://portal.matemail.online/app/integrations/authorize?request=mmr_test",
            "poll_token": "mmp_test",
        }

        response = self.client.post(
            START_URL,
            {
                "tenant_id": "11111111-1111-1111-1111-111111111111",
                "integration_secret": "mmi_one_time_secret",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        start.assert_called_once_with(
            "11111111-1111-1111-1111-111111111111",
            "mmi_one_time_secret",
        )
        self.assertFalse(
            TenantEmailSettings.objects.filter(tenant=self.tenant).exists()
        )

    @patch("apps.email_ingestion.views.matemail.connection_status")
    def test_complete_requires_helpdesk_scopes(self, status):
        status.return_value = {
            "status": "approved",
            "access_token": "mmc_operational",
            "mailbox_id": "22222222-2222-2222-2222-222222222222",
            "mailbox_email": "support@example.com",
            "mailbox_name": "Support",
            "permissions": [
                {"key": "mailbox.read", "label": "See mailbox details"},
                {"key": "mail.send", "label": "Send email"},
            ],
        }

        response = self.client.post(
            COMPLETE_URL,
            {
                "tenant_id": "11111111-1111-1111-1111-111111111111",
                "poll_token": "mmp_test",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("missing_scopes", response.data)
        self.assertFalse(
            TenantEmailSettings.objects.filter(tenant=self.tenant).exists()
        )

    @patch("apps.email_ingestion.views.matemail.connection_status")
    def test_complete_stores_only_encrypted_operational_token(self, status):
        token = "mmc_operational_secret"
        status.return_value = {
            "status": "approved",
            "access_token": token,
            "mailbox_id": "22222222-2222-2222-2222-222222222222",
            "mailbox_email": "support@example.com",
            "mailbox_name": "Support",
            "permissions": [
                {"key": "mailbox.read", "label": "See mailbox details"},
                {"key": "mail.read", "label": "Read email"},
                {"key": "mail.modify", "label": "Mark read or unread"},
                {"key": "mail.send", "label": "Send email"},
            ],
        }

        response = self.client.post(
            COMPLETE_URL,
            {
                "tenant_id": "11111111-1111-1111-1111-111111111111",
                "poll_token": "mmp_test",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        settings = TenantEmailSettings.objects.get(tenant=self.tenant)
        self.assertEqual(settings.auth_method, AUTH_METHOD_MATEMAIL)
        self.assertEqual(settings.matemail_mailbox_email, "support@example.com")
        self.assertNotEqual(settings.matemail_access_token, token)
        self.assertTrue(settings.matemail_access_token.startswith("enc:v1:"))
        self.assertEqual(settings.get_matemail_access_token(), token)
        self.assertNotIn("matemail_access_token", response.data)

    @patch("apps.email_ingestion.views.matemail.disconnect")
    def test_disconnect_clears_connected_app_token(self, disconnect):
        settings = TenantEmailSettings.objects.create(
            tenant=self.tenant,
            auth_method=AUTH_METHOD_MATEMAIL,
            matemail_tenant_id="11111111-1111-1111-1111-111111111111",
            matemail_mailbox_id="22222222-2222-2222-2222-222222222222",
            matemail_mailbox_email="support@example.com",
            matemail_access_token="mmc_secret",
            imap_enabled=True,
            smtp_enabled=True,
        )

        response = self.client.post(DISCONNECT_URL, {}, format="json")

        self.assertEqual(response.status_code, 200)
        settings.refresh_from_db()
        disconnect.assert_called_once()
        self.assertEqual(settings.matemail_access_token, "")
        self.assertEqual(settings.matemail_mailbox_email, "")
        self.assertFalse(settings.imap_enabled)
        self.assertFalse(settings.smtp_enabled)

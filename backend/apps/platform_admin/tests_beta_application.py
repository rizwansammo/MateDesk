import json
from unittest.mock import patch

from django.test import Client, TestCase, override_settings

from apps.platform_admin.models import BetaApplication, PlatformSettings
from apps.tenants.models import Tenant


@override_settings(
    DEPLOYMENT_MODE='multi_tenant',
    PUBLIC_REGISTRATION_ENABLED=True,
    PLATFORM_ADMIN_ENABLED=True,
    NON_TENANT_HOSTS={'matedesk.pro'},
    ALLOWED_HOSTS=['matedesk.pro', '.matedesk.pro'],
)
class PrivateBetaApplicationApiTests(TestCase):
    def setUp(self):
        self.client = Client()
        ps = PlatformSettings.load()
        ps.signup_mode = PlatformSettings.SIGNUP_MODE_PRIVATE_BETA
        ps.save(update_fields=['signup_mode'])

    def payload(self, **overrides):
        data = {
            'company_name': 'Acme Managed Services',
            'owner_name': 'John Smith',
            'email': 'john@acmemsp.com',
            'requested_slug': 'acme-msp',
        }
        data.update(overrides)
        return data

    @patch(
        'apps.platform_admin.beta_activation.send_beta_receipt_email',
        return_value=(True, ''),
    )
    def test_application_is_stored_without_creating_tenant(self, send_receipt):
        response = self.client.post(
            '/api/beta/apply/',
            data=json.dumps(self.payload()),
            content_type='application/json',
            HTTP_HOST='matedesk.pro',
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()['status'], 'pending')
        application = BetaApplication.objects.get(email='john@acmemsp.com')
        self.assertEqual(application.requested_slug, 'acme-msp')
        self.assertIsNotNone(application.receipt_email_sent_at)
        self.assertEqual(application.receipt_email_last_error, '')
        self.assertFalse(Tenant.objects.filter(slug='acme-msp').exists())
        send_receipt.assert_called_once()

    def test_duplicate_email_is_rejected(self):
        BetaApplication.objects.create(
            company_name='Existing MSP',
            owner_name='Existing Owner',
            email='john@acmemsp.com',
            requested_slug='existing-msp',
        )

        response = self.client.post(
            '/api/beta/apply/',
            data=json.dumps(self.payload(requested_slug='new-msp')),
            content_type='application/json',
            HTTP_HOST='matedesk.pro',
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(BetaApplication.objects.filter(email='john@acmemsp.com').count(), 1)

    def test_existing_tenant_slug_is_rejected(self):
        Tenant.objects.create(name='Existing', slug='acme-msp')

        response = self.client.post(
            '/api/beta/apply/',
            data=json.dumps(self.payload()),
            content_type='application/json',
            HTTP_HOST='matedesk.pro',
        )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(BetaApplication.objects.filter(email='john@acmemsp.com').exists())

    def test_application_endpoint_is_closed_in_public_trial_mode(self):
        ps = PlatformSettings.load()
        ps.signup_mode = PlatformSettings.SIGNUP_MODE_PUBLIC_TRIAL
        ps.save(update_fields=['signup_mode'])

        response = self.client.post(
            '/api/beta/apply/',
            data=json.dumps(self.payload()),
            content_type='application/json',
            HTTP_HOST='matedesk.pro',
        )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()['code'], 'private_beta_closed')
        self.assertFalse(BetaApplication.objects.exists())

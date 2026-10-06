import json

from django.test import Client, TestCase, override_settings

from apps.platform_admin.models import PlatformSettings
from apps.tenants.models import Tenant


@override_settings(
    DEPLOYMENT_MODE='multi_tenant',
    PUBLIC_REGISTRATION_ENABLED=True,
    PLATFORM_ADMIN_ENABLED=True,
    NON_TENANT_HOSTS={'matedesk.pro'},
    ALLOWED_HOSTS=['matedesk.pro', '.matedesk.pro'],
)
class PublicSignupModeTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.platform_settings = PlatformSettings.load()

    def test_public_trial_is_default_and_exposed(self):
        response = self.client.get(
            '/api/instance/public/',
            HTTP_HOST='matedesk.pro',
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['signup_mode'], 'public_trial')
        self.assertTrue(data['public_registration_enabled'])

    def test_private_beta_is_exposed_and_disables_public_registration(self):
        self.platform_settings.signup_mode = PlatformSettings.SIGNUP_MODE_PRIVATE_BETA
        self.platform_settings.save(update_fields=['signup_mode'])

        response = self.client.get(
            '/api/instance/public/',
            HTTP_HOST='matedesk.pro',
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['signup_mode'], 'private_beta')
        self.assertFalse(data['public_registration_enabled'])

    def test_private_beta_blocks_direct_registration(self):
        self.platform_settings.signup_mode = PlatformSettings.SIGNUP_MODE_PRIVATE_BETA
        self.platform_settings.save(update_fields=['signup_mode'])

        response = self.client.post(
            '/api/auth/register/',
            data=json.dumps({
                'company_name': 'Blocked Beta Applicant',
                'owner_name': 'Private Applicant',
                'email': 'private@example.com',
                'password': 'StrongPassword-123!',
                'tenant_slug': 'blocked-beta',
            }),
            content_type='application/json',
            HTTP_HOST='matedesk.pro',
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()['code'], 'private_beta')
        self.assertFalse(Tenant.objects.filter(slug='blocked-beta').exists())

    def test_public_trial_keeps_existing_self_service_registration(self):
        response = self.client.post(
            '/api/auth/register/',
            data=json.dumps({
                'company_name': 'Public Trial MSP',
                'owner_name': 'Trial Owner',
                'email': 'trial-owner@example.com',
                'password': 'StrongPassword-123!',
                'tenant_slug': 'public-trial-msp',
            }),
            content_type='application/json',
            HTTP_HOST='matedesk.pro',
        )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(Tenant.objects.filter(slug='public-trial-msp').exists())

from django.test import override_settings
from rest_framework.test import APITestCase

from apps.tenants.models import Tenant
from apps.users.models import User


@override_settings(
    DEPLOYMENT_MODE='single_tenant',
    SINGLE_TENANT_SLUG='netamate',
    ALLOWED_HOSTS=['helpdesk.netamate.com'],
    PRODUCT_WORDMARK='NetaMate',
    PRODUCT_LOGO_VARIANT='netamate',
    PRODUCT_LOGO_THEME_AWARE=True,
)
class SingleTenantBrandingTests(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(
            name='NetaMate Solutions',
            slug='netamate',
            is_active=True,
            status='active',
            billing_status='paid',
        )
        self.owner = User.objects.create_user(
            tenant=self.tenant,
            email='owner@netamate.com',
            password='StrongPassword-123!',
            first_name='Owner',
            role='msp_owner',
            is_active=True,
        )
        self.agent = User.objects.create_user(
            tenant=self.tenant,
            email='agent@netamate.com',
            password='StrongPassword-123!',
            first_name='Agent',
            role='msp_agent',
            is_active=True,
        )

    def test_dedicated_branding_defaults_to_netamate_identity(self):
        self.client.force_authenticate(self.owner)
        response = self.client.get(
            '/api/tenant/branding/',
            HTTP_HOST='helpdesk.netamate.com',
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['md_custom_text'], 'NetaMate')
        self.assertEqual(data['md_font_size'], 22)
        self.assertEqual(data['md_logo_variant'], 'netamate')
        self.assertTrue(data['md_logo_theme_aware'])

    def test_owner_can_update_wordmark_and_sizes(self):
        self.client.force_authenticate(self.owner)
        response = self.client.patch(
            '/api/tenant/branding/',
            {
                'md_custom_text': 'NetaMate',
                'md_icon_size': 30,
                'md_font_size': 22,
                'md_line_height': 0,
                'md_logo_variant': 'netamate',
                'md_logo_theme_aware': 'true',
            },
            format='multipart',
            HTTP_HOST='helpdesk.netamate.com',
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['md_custom_text'], 'NetaMate')
        self.assertEqual(data['md_icon_size'], 30)
        self.assertEqual(data['md_font_size'], 22)
        self.assertEqual(data['md_logo_variant'], 'netamate')
        self.assertTrue(data['md_logo_theme_aware'])

        self.tenant.refresh_from_db()
        self.assertEqual(self.tenant.branding['md_custom_text'], 'NetaMate')
        self.assertEqual(self.tenant.branding['md_icon_size'], 30)

    def test_owner_can_select_original_matedesk_mark(self):
        self.client.force_authenticate(self.owner)
        response = self.client.patch(
            '/api/tenant/branding/',
            {'md_logo_variant': 'matedesk', 'md_logo_theme_aware': 'false'},
            format='multipart',
            HTTP_HOST='helpdesk.netamate.com',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['md_logo_variant'], 'matedesk')
        self.tenant.refresh_from_db()
        self.assertEqual(self.tenant.branding['md_logo_variant'], 'matedesk')

    def test_agent_cannot_change_branding(self):
        self.client.force_authenticate(self.agent)
        response = self.client.patch(
            '/api/tenant/branding/',
            {'md_custom_text': 'Changed'},
            format='multipart',
            HTTP_HOST='helpdesk.netamate.com',
        )

        self.assertEqual(response.status_code, 403)


class MultiTenantBrandingWriteProtectionTests(APITestCase):
    @override_settings(
        DEPLOYMENT_MODE='multi_tenant',
        NON_TENANT_HOSTS={'matedesk.pro'},
        ALLOWED_HOSTS=['matedesk.pro', '.matedesk.pro'],
    )
    def test_tenant_owner_cannot_bypass_platform_admin_branding(self):
        tenant = Tenant.objects.create(
            name='Example MSP',
            slug='example',
            is_active=True,
        )
        owner = User.objects.create_user(
            tenant=tenant,
            email='owner@example.com',
            password='StrongPassword-123!',
            first_name='Owner',
            role='msp_owner',
            is_active=True,
        )
        self.client.force_authenticate(owner)

        response = self.client.patch(
            '/api/tenant/branding/',
            {'md_custom_text': 'Changed'},
            format='multipart',
            HTTP_HOST='example.matedesk.pro',
        )

        self.assertEqual(response.status_code, 403)

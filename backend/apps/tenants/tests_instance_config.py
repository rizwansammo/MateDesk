from django.test import Client, TestCase, override_settings

from apps.tenants.models import Tenant


class PublicInstanceConfigTests(TestCase):
    def setUp(self):
        self.client = Client()

    @override_settings(
        DEPLOYMENT_MODE='multi_tenant',
        PRODUCT_NAME='MateDesk',
        PRODUCT_VENDOR_NAME='NetaMate Solutions',
        PUBLIC_REGISTRATION_ENABLED=True,
        NON_TENANT_HOSTS={'matedesk.pro'},
        ALLOWED_HOSTS=['matedesk.pro', '.matedesk.pro'],
    )
    def test_multi_tenant_root_returns_platform_identity(self):
        response = self.client.get(
            '/api/instance/public/',
            HTTP_HOST='matedesk.pro',
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['deployment_mode'], 'multi_tenant')
        self.assertEqual(data['product_name'], 'MateDesk')
        self.assertEqual(data['tenant_name'], '')
        self.assertTrue(data['public_registration_enabled'])

    @override_settings(
        DEPLOYMENT_MODE='single_tenant',
        SINGLE_TENANT_SLUG='netamate',
        PRODUCT_NAME='NetaMate HelpDesk',
        PRODUCT_VENDOR_NAME='NetaMate Solutions',
        PRODUCT_LOGO_URL='https://assets.example.com/netamate-logo.png',
        LOGIN_HEADLINE='Welcome to NetaMate HelpDesk',
        LOGIN_SUBTITLE='Sign in to access NetaMate support.',
        PUBLIC_REGISTRATION_ENABLED=False,
        ALLOWED_HOSTS=['helpdesk.netamate.com'],
    )
    def test_single_tenant_returns_dedicated_identity(self):
        Tenant.objects.create(
            name='NetaMate Solutions',
            slug='netamate',
            is_active=True,
        )

        response = self.client.get(
            '/api/instance/public/',
            HTTP_HOST='helpdesk.netamate.com',
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['deployment_mode'], 'single_tenant')
        self.assertEqual(data['product_name'], 'NetaMate HelpDesk')
        self.assertEqual(data['vendor_name'], 'NetaMate Solutions')
        self.assertEqual(
            data['product_logo_url'],
            'https://assets.example.com/netamate-logo.png',
        )
        self.assertEqual(data['tenant_name'], 'NetaMate Solutions')
        self.assertFalse(data['public_registration_enabled'])

    @override_settings(
        DEPLOYMENT_MODE='single_tenant',
        SINGLE_TENANT_SLUG='netamate',
        PRODUCT_NAME='NetaMate HelpDesk',
        PRODUCT_WORDMARK='NetaMate',
        PRODUCT_VENDOR_NAME='NetaMate Solutions',
        PRODUCT_LOGO_URL='',
        PRODUCT_LOGO_VARIANT='netamate',
        PRODUCT_LOGO_THEME_AWARE=True,
        PUBLIC_REGISTRATION_ENABLED=False,
        ALLOWED_HOSTS=['helpdesk.netamate.com'],
    )
    def test_single_tenant_public_identity_uses_saved_tenant_branding(self):
        Tenant.objects.create(
            name='NetaMate Solutions',
            slug='netamate',
            is_active=True,
            branding={
                'md_custom_text': 'NetaMate Support',
                'md_logo_variant': 'netamate',
                'md_logo_theme_aware': False,
            },
        )

        response = self.client.get(
            '/api/instance/public/',
            HTTP_HOST='helpdesk.netamate.com',
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['product_name'], 'NetaMate HelpDesk')
        self.assertEqual(data['product_wordmark'], 'NetaMate Support')
        self.assertEqual(data['product_logo_variant'], 'netamate')
        self.assertFalse(data['product_logo_theme_aware'])

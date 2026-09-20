import json

from django.test import Client, TestCase, override_settings

from apps.tenants.models import Tenant
from apps.users.models import User


@override_settings(
    DEPLOYMENT_MODE='single_tenant',
    SINGLE_TENANT_SLUG='netamate',
    ALLOWED_HOSTS=['helpdesk.netamate.com'],
    PUBLIC_REGISTRATION_ENABLED=False,
    PRODUCT_NAME='NetaMate HelpDesk',
    PRODUCT_WORDMARK='NetaMate',
    PRODUCT_LOGO_URL='https://assets.example.com/netamate-logo.png',
)
class SingleTenantAuthenticationTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.tenant = Tenant.objects.create(
            name='NetaMate Solutions',
            slug='netamate',
            is_active=True,
            status='active',
            billing_status='paid',
        )
        self.user = User.objects.create_user(
            tenant=self.tenant,
            email='owner@netamate.com',
            password='StrongPassword-123!',
            first_name='Primary',
            last_name='Owner',
            role='msp_owner',
            is_active=True,
        )

    def test_login_and_me_work_on_direct_hostname(self):
        login = self.client.post(
            '/api/auth/login/',
            data=json.dumps({
                'email': 'owner@netamate.com',
                'password': 'StrongPassword-123!',
            }),
            content_type='application/json',
            HTTP_HOST='helpdesk.netamate.com',
        )
        self.assertEqual(login.status_code, 200)
        access = login.json()['access']
        self.assertEqual(login.json()['user']['tenant_slug'], 'netamate')

        me = self.client.get(
            '/api/auth/me/',
            HTTP_HOST='helpdesk.netamate.com',
            HTTP_AUTHORIZATION=f'Bearer {access}',
        )
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.json()['email'], 'owner@netamate.com')
        self.assertEqual(me.json()['tenant_slug'], 'netamate')

        branding = self.client.get(
            '/api/tenant/branding/',
            HTTP_HOST='helpdesk.netamate.com',
            HTTP_AUTHORIZATION=f'Bearer {access}',
        )
        self.assertEqual(branding.status_code, 200)
        self.assertEqual(branding.json()['md_custom_text'], 'NetaMate')
        self.assertEqual(
            branding.json()['md_logo_url'],
            'https://assets.example.com/netamate-logo.png',
        )

    def test_public_registration_is_not_available(self):
        response = self.client.post(
            '/api/auth/register/',
            data=json.dumps({
                'company_name': 'Should Not Exist',
                'owner_name': 'Blocked User',
                'email': 'blocked@example.com',
                'password': 'StrongPassword-123!',
            }),
            content_type='application/json',
            HTTP_HOST='helpdesk.netamate.com',
        )
        self.assertEqual(response.status_code, 404)
        self.assertFalse(Tenant.objects.filter(name='Should Not Exist').exists())

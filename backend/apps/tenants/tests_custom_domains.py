from unittest.mock import patch

from django.core.exceptions import ValidationError
from django.http import JsonResponse
from django.test import RequestFactory, TestCase, override_settings

from apps.tenants.domains import normalize_custom_domain, validate_custom_domain, verify_domain_ownership
from apps.tenants.models import Tenant, TenantDomain
from apps.users.models import User
from core.middleware.host import DynamicHostValidationMiddleware
from core.middleware.tenant import TenantMiddleware


@override_settings(
    DEPLOYMENT_MODE='multi_tenant',
    APP_DOMAIN='matedesk.pro',
    NON_TENANT_HOSTS={'matedesk.pro', 'www.matedesk.pro'},
    CUSTOM_DOMAINS_ENABLED=True,
    ALLOWED_HOSTS=['*'],
)
class CustomDomainModelAndRoutingTests(TestCase):
    def setUp(self):
        self.factory = RequestFactory()
        self.tenant = Tenant.objects.create(
            name='Example MSP',
            slug='example',
            is_active=True,
        )

    def test_domain_is_normalized_on_save(self):
        mapping = TenantDomain.objects.create(
            tenant=self.tenant,
            domain='HelpDesk.Example.COM.',
        )
        self.assertEqual(mapping.domain, 'helpdesk.example.com')
        self.assertEqual(mapping.verification_name, '_matedesk-verify.helpdesk.example.com')
        self.assertTrue(mapping.verification_value.startswith('matedesk-verification='))

    def test_platform_hostname_cannot_be_claimed(self):
        with self.assertRaises(ValidationError):
            TenantDomain.objects.create(
                tenant=self.tenant,
                domain='example.matedesk.pro',
            )

    def test_invalid_custom_hostnames_are_rejected(self):
        for value in ('https://example.com', '*.example.com', '127.0.0.1', 'localhost'):
            with self.subTest(value=value), self.assertRaises(ValidationError):
                validate_custom_domain(value)

    @patch('dns.resolver.resolve')
    def test_txt_ownership_requires_exact_token(self, resolve):
        class TXT:
            strings = [b'matedesk-verification=abc123']

        resolve.return_value = [TXT()]
        self.assertTrue(verify_domain_ownership('helpdesk.example.com', 'abc123'))
        self.assertFalse(verify_domain_ownership('helpdesk.example.com', 'wrong'))

    def test_active_custom_domain_resolves_tenant(self):
        TenantDomain.objects.create(
            tenant=self.tenant,
            domain='helpdesk.example.com',
            status='active',
        )
        captured = {}

        def view(request):
            captured['tenant'] = request.tenant
            return JsonResponse({'ok': True})

        response = TenantMiddleware(view)(
            self.factory.get('/api/tickets/', HTTP_HOST='helpdesk.example.com')
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(captured['tenant'].pk, self.tenant.pk)

    def test_pending_custom_domain_is_not_routable(self):
        TenantDomain.objects.create(
            tenant=self.tenant,
            domain='helpdesk.example.com',
            status='pending',
        )

        response = TenantMiddleware(lambda request: JsonResponse({'ok': True}))(
            self.factory.get('/api/tickets/', HTTP_HOST='helpdesk.example.com')
        )
        self.assertEqual(response.status_code, 404)

    def test_unknown_external_hostname_is_never_parsed_as_slug(self):
        # The first label intentionally matches the tenant slug. This used to be
        # enough for the legacy resolver to select a tenant on any arbitrary host.
        response = TenantMiddleware(lambda request: JsonResponse({'ok': True}))(
            self.factory.get('/api/tickets/', HTTP_HOST='example.attacker.test')
        )
        self.assertEqual(response.status_code, 404)

    @override_settings(CUSTOM_DOMAIN_CNAME_TARGET='domains.matedesk.pro')
    def test_custom_domain_origin_is_not_a_tenant_workspace(self):
        captured = {}

        def view(request):
            captured['tenant'] = request.tenant
            return JsonResponse({'ok': True})

        response = TenantMiddleware(view)(
            self.factory.get('/api/instance/public/', HTTP_HOST='domains.matedesk.pro')
        )
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(captured['tenant'])

    def test_platform_subdomain_fallback_still_works(self):
        captured = {}

        def view(request):
            captured['tenant'] = request.tenant
            return JsonResponse({'ok': True})

        response = TenantMiddleware(view)(
            self.factory.get('/api/tickets/', HTTP_HOST='example.matedesk.pro')
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(captured['tenant'].pk, self.tenant.pk)

    def test_custom_domain_login_and_authenticated_api(self):
        TenantDomain.objects.create(
            tenant=self.tenant,
            domain='helpdesk.example.com',
            status='active',
        )
        user = User.objects.create_user(
            tenant=self.tenant,
            email='owner@example.com',
            password='StrongPassword-123!',
            first_name='Owner',
            role='msp_owner',
            is_active=True,
        )

        login = self.client.post(
            '/api/auth/login/',
            {'email': user.email, 'password': 'StrongPassword-123!'},
            content_type='application/json',
            HTTP_HOST='helpdesk.example.com',
        )
        self.assertEqual(login.status_code, 200)
        payload = login.json()
        self.assertEqual(payload['user']['tenant_slug'], self.tenant.slug)

        me = self.client.get(
            '/api/auth/me/',
            HTTP_HOST='helpdesk.example.com',
            HTTP_AUTHORIZATION=f"Bearer {payload['access']}",
        )
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.json()['tenant_slug'], self.tenant.slug)

    def test_operator_console_is_blocked_on_custom_domain(self):
        TenantDomain.objects.create(
            tenant=self.tenant,
            domain='helpdesk.example.com',
            status='active',
        )
        response = TenantMiddleware(lambda request: JsonResponse({'ok': True}))(
            self.factory.get('/platform-admin/', HTTP_HOST='helpdesk.example.com')
        )
        self.assertEqual(response.status_code, 404)

    def test_dynamic_host_guard_allows_only_active_custom_domain(self):
        active = TenantDomain.objects.create(
            tenant=self.tenant,
            domain='helpdesk.example.com',
            status='active',
        )

        captured = {}

        def view(request):
            captured['mapping'] = getattr(request, '_matedesk_custom_domain', None)
            return JsonResponse({'ok': True})

        guard = DynamicHostValidationMiddleware(view)
        response = guard(self.factory.get('/login', HTTP_HOST=active.domain))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(captured['mapping'].pk, active.pk)

        response = guard(self.factory.get('/login', HTTP_HOST='unknown.example.net'))
        self.assertEqual(response.status_code, 404)


class CustomDomainNormalizationTests(TestCase):
    def test_idna_and_case_normalization(self):
        self.assertEqual(normalize_custom_domain('BÜCHER.Example.'), 'xn--bcher-kva.example')

from django.test import RequestFactory, TestCase, override_settings

from apps.tenants.models import Tenant
from core.middleware.tenant import TenantMiddleware


class DeploymentModeTenantMiddlewareTests(TestCase):
    def setUp(self):
        self.factory = RequestFactory()
        self.tenant = Tenant.objects.create(
            name='NetaMate Solutions',
            slug='netamate',
            is_active=True,
        )

    @override_settings(
        DEPLOYMENT_MODE='single_tenant',
        SINGLE_TENANT_SLUG='netamate',
    )
    def test_single_tenant_mode_uses_configured_tenant_on_direct_host(self):
        captured = {}

        def view(request):
            captured['tenant'] = request.tenant
            from django.http import JsonResponse
            return JsonResponse({'ok': True})

        middleware = TenantMiddleware(view)
        response = middleware(
            self.factory.get('/api/tickets/', HTTP_HOST='helpdesk.netamate.com')
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(captured['tenant'].pk, self.tenant.pk)

    @override_settings(
        DEPLOYMENT_MODE='multi_tenant',
        NON_TENANT_HOSTS={'matedesk.pro', 'www.matedesk.pro'},
    )
    def test_multi_tenant_mode_still_resolves_subdomain(self):
        captured = {}

        def view(request):
            captured['tenant'] = request.tenant
            from django.http import JsonResponse
            return JsonResponse({'ok': True})

        middleware = TenantMiddleware(view)
        response = middleware(
            self.factory.get('/api/tickets/', HTTP_HOST='netamate.matedesk.pro')
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(captured['tenant'].pk, self.tenant.pk)

    @override_settings(
        DEPLOYMENT_MODE='multi_tenant',
        NON_TENANT_HOSTS={'matedesk.pro', 'www.matedesk.pro'},
    )
    def test_multi_tenant_root_domain_remains_non_tenant(self):
        captured = {}

        def view(request):
            captured['tenant'] = request.tenant
            from django.http import JsonResponse
            return JsonResponse({'ok': True})

        middleware = TenantMiddleware(view)
        response = middleware(
            self.factory.get('/login', HTTP_HOST='matedesk.pro')
        )

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(captured['tenant'])

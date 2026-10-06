import re

from django.http import HttpResponseNotFound, JsonResponse

from .host import _raw_host


_SLUG_RE = re.compile(r'^[a-z0-9-]{1,63}$')
_PUBLIC_BYPASS_PREFIXES = ('/api/health/', '/static/', '/media/')
_OPERATOR_PREFIXES = ('/platform-admin', '/django-admin', '/admin')


class TenantMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        from django.conf import settings

        host = _raw_host(request)

        # Dedicated installations do not derive tenancy from the hostname. Every
        # application request belongs to the one configured tenant.
        if getattr(settings, 'DEPLOYMENT_MODE', 'multi_tenant') == 'single_tenant':
            if any(request.path.startswith(p) for p in _PUBLIC_BYPASS_PREFIXES + _OPERATOR_PREFIXES):
                request.tenant = None
                return self.get_response(request)

            from apps.tenants.models import Tenant
            try:
                request.tenant = Tenant.objects.get(
                    slug=settings.SINGLE_TENANT_SLUG,
                    is_active=True,
                )
            except Tenant.DoesNotExist:
                return JsonResponse({'error': 'Workspace not available.'}, status=503)
            return self.get_response(request)

        non_tenant_hosts = {
            h.strip().lower().rstrip('.')
            for h in getattr(settings, 'NON_TENANT_HOSTS', {'localhost', '127.0.0.1'})
            if h.strip()
        }
        app_domain = (getattr(settings, 'APP_DOMAIN', '') or '').strip().lower().rstrip('.')

        # Operator surfaces are valid only on the MateDesk platform/root host.
        # This is also enforced by generated custom-domain nginx configs.
        if any(request.path.startswith(p) for p in _OPERATOR_PREFIXES):
            if host not in non_tenant_hosts and host != app_domain:
                return HttpResponseNotFound('Not found.')
            request.tenant = None
            return self.get_response(request)

        if any(request.path.startswith(p) for p in _PUBLIC_BYPASS_PREFIXES):
            request.tenant = None
            return self.get_response(request)

        if host in non_tenant_hosts or (app_domain and host == app_domain):
            request.tenant = None
            return self.get_response(request)

        # Dynamic host validation normally resolved this already. The fallback
        # lookup keeps TenantMiddleware independently testable and protects
        # deployments where middleware ordering is customized.
        custom_tenant = getattr(request, '_matedesk_custom_tenant', None)
        if custom_tenant is None and getattr(settings, 'CUSTOM_DOMAINS_ENABLED', False):
            from apps.tenants.models import TenantDomain
            mapping = (
                TenantDomain.objects
                .select_related('tenant')
                .filter(domain=host, status='active', tenant__is_active=True)
                .first()
            )
            if mapping is not None:
                custom_tenant = mapping.tenant
                request._matedesk_custom_domain = mapping

        if custom_tenant is not None:
            request.tenant = custom_tenant
            return self.get_response(request)

        # Legacy/native workspace routing is intentionally restricted to exactly
        # one label under APP_DOMAIN. Arbitrary external hosts are never treated
        # as tenant slugs.
        suffix = f'.{app_domain}' if app_domain else ''
        if not suffix or not host.endswith(suffix):
            return JsonResponse({'error': 'Workspace not found.'}, status=404)

        slug = host[:-len(suffix)]
        if not _SLUG_RE.fullmatch(slug):
            return JsonResponse({'error': 'Workspace not found.'}, status=404)

        from apps.tenants.models import Tenant
        try:
            request.tenant = Tenant.objects.get(slug=slug, is_active=True)
        except Tenant.DoesNotExist:
            return JsonResponse({'error': 'Workspace not found.'}, status=404)

        return self.get_response(request)

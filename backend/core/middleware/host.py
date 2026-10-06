from django.conf import settings
from django.http import HttpResponseNotFound


def _raw_host(request):
    raw = request.META.get('HTTP_X_FORWARDED_HOST') or request.META.get('HTTP_HOST') or ''
    raw = raw.strip().lower()
    if raw.startswith('['):  # IPv6 literal; custom domains never use one.
        end = raw.find(']')
        return raw[1:end] if end != -1 else raw
    return raw.split(':', 1)[0].rstrip('.')


class DynamicHostValidationMiddleware:
    """
    Strict application allow-list used only when dynamic custom domains are on.

    Django's ALLOWED_HOSTS cannot contain DB-backed customer hostnames, so
    settings switches to '*' in that mode and this middleware restores strict
    validation before CORS/CSRF/auth middleware runs.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if not getattr(settings, 'CUSTOM_DOMAINS_ENABLED', False):
            return self.get_response(request)

        host = _raw_host(request)
        if not host:
            return HttpResponseNotFound('Host not found.')

        # Dedicated installs keep using their static ALLOWED_HOSTS contract.
        if getattr(settings, 'DEPLOYMENT_MODE', 'multi_tenant') == 'single_tenant':
            return self.get_response(request)

        app_domain = (getattr(settings, 'APP_DOMAIN', '') or '').lower().rstrip('.')
        non_tenant_hosts = {
            h.strip().lower().rstrip('.')
            for h in getattr(settings, 'NON_TENANT_HOSTS', set())
            if h.strip()
        }

        if host in non_tenant_hosts or (app_domain and host == app_domain):
            return self.get_response(request)
        if app_domain and host.endswith(f'.{app_domain}'):
            return self.get_response(request)

        from apps.tenants.models import TenantDomain
        mapping = (
            TenantDomain.objects
            .select_related('tenant')
            .filter(
                domain=host,
                status='active',
                tenant__is_active=True,
            )
            .first()
        )
        if mapping is None:
            return HttpResponseNotFound('Workspace not found.')

        request._matedesk_custom_tenant = mapping.tenant
        request._matedesk_custom_domain = mapping
        return self.get_response(request)

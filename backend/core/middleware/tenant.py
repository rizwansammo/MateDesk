from django.http import JsonResponse

# Paths that bypass tenant resolution entirely
_BYPASS_PREFIXES = ('/admin/', '/api/health/', '/static/', '/media/', '/platform-admin/')


class TenantMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if any(request.path.startswith(p) for p in _BYPASS_PREFIXES):
            request.tenant = None
            return self.get_response(request)

        host = request.get_host().split(':')[0]  # strip port if present

        # Hosts that are NOT tenant portals (apex domain, fixed subdomains, localhost).
        # NON_TENANT_HOSTS is populated from the env var in settings.py.
        from django.conf import settings
        non_tenant_hosts = getattr(settings, 'NON_TENANT_HOSTS', {'localhost', '127.0.0.1'})
        if host in non_tenant_hosts:
            request.tenant = None
            return self.get_response(request)

        parts = host.split('.')
        if len(parts) < 2:
            request.tenant = None
            return self.get_response(request)

        slug = parts[0]

        from apps.tenants.models import Tenant
        try:
            request.tenant = Tenant.objects.get(slug=slug, is_active=True)
        except Tenant.DoesNotExist:
            # Do not echo the slug back — avoids tenant enumeration via error responses
            return JsonResponse({'error': 'Workspace not found.'}, status=404)

        return self.get_response(request)

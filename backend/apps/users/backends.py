from django.contrib.auth.backends import ModelBackend


class TenantBackend(ModelBackend):
    """
    Authenticates a user scoped to a specific tenant.
    Accepts `tenant` kwarg directly (for API login) or reads `request.tenant`
    (set by TenantMiddleware from the subdomain).
    """

    def authenticate(self, request, email=None, password=None, tenant=None, **kwargs):
        if tenant is None and request is not None:
            tenant = getattr(request, 'tenant', None)
        if tenant is None:
            return None

        from .models import User
        try:
            user = User.objects.select_related('tenant').get(
                tenant=tenant, email=email, is_active=True
            )
        except User.DoesNotExist:
            return None

        if user.check_password(password):
            return user
        return None


class PlatformAdminBackend(ModelBackend):
    """
    Authenticates platform-level superusers (tenant=None, is_staff=True) for
    the Django admin panel. Only activates when there is no tenant context on
    the request (i.e. apex domain access, not a tenant subdomain).

    Django admin passes credentials as `username=` not `email=`, so we accept
    both kwarg names.
    """

    def authenticate(self, request, username=None, email=None, password=None, **kwargs):
        # Don't activate on tenant subdomains
        if request is not None and getattr(request, 'tenant', None) is not None:
            return None

        resolved_email = email or username
        if not resolved_email or not password:
            return None

        from .models import User
        try:
            user = User.objects.get(
                tenant__isnull=True,
                email=resolved_email,
                is_active=True,
                is_staff=True,
            )
        except User.DoesNotExist:
            return None

        if user.check_password(password):
            return user
        return None

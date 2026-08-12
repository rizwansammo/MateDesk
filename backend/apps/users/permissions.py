ROLE_MSP_OWNER   = 'msp_owner'
ROLE_MSP_MANAGER = 'msp_manager'
ROLE_MSP_AGENT   = 'msp_agent'
ROLE_CLIENT_OWNER = 'client_owner'
ROLE_END_USER     = 'end_user'

ROLE_CHOICES = [
    (ROLE_MSP_OWNER,   'MSP Owner'),
    (ROLE_MSP_MANAGER, 'MSP Manager'),
    (ROLE_MSP_AGENT,   'MSP Agent'),
    (ROLE_CLIENT_OWNER, 'Client Owner'),
    (ROLE_END_USER,     'End User'),
]

MSP_ROLES    = frozenset({ROLE_MSP_OWNER, ROLE_MSP_MANAGER, ROLE_MSP_AGENT})
CLIENT_ROLES = frozenset({ROLE_CLIENT_OWNER, ROLE_END_USER})

# Capability map — wire into DRF permission classes in Phase 8
ROLE_PERMISSIONS: dict[str, dict[str, bool]] = {
    ROLE_MSP_OWNER: {
        'can_manage_agents':    True,
        'can_manage_clients':   True,
        'can_manage_settings':  True,
        'can_view_all_tickets': True,
        'can_assign_tickets':   True,
        'can_delete_tickets':   True,
        'can_view_reports':     True,
    },
    ROLE_MSP_MANAGER: {
        'can_manage_agents':    True,
        'can_manage_clients':   True,
        'can_manage_settings':  False,
        'can_view_all_tickets': True,
        'can_assign_tickets':   True,
        'can_delete_tickets':   False,
        'can_view_reports':     True,
    },
    ROLE_MSP_AGENT: {
        'can_manage_agents':    False,
        'can_manage_clients':   False,
        'can_manage_settings':  False,
        'can_view_all_tickets': True,
        'can_assign_tickets':   True,
        'can_delete_tickets':   False,
        'can_view_reports':     False,
    },
    ROLE_CLIENT_OWNER: {
        'can_manage_agents':    False,
        'can_manage_clients':   False,
        'can_manage_settings':  False,
        'can_view_all_tickets': False,
        'can_assign_tickets':   False,
        'can_delete_tickets':   False,
        'can_view_reports':     True,   # own org reports only
    },
    ROLE_END_USER: {
        'can_manage_agents':    False,
        'can_manage_clients':   False,
        'can_manage_settings':  False,
        'can_view_all_tickets': False,
        'can_assign_tickets':   False,
        'can_delete_tickets':   False,
        'can_view_reports':     False,
    },
}


def has_permission(user, permission: str) -> bool:
    return ROLE_PERMISSIONS.get(user.role, {}).get(permission, False)


# ── DRF permission class ──────────────────────────────────────────────────────

from rest_framework.permissions import BasePermission  # noqa: E402


class IsTenantUser(BasePermission):
    """
    Validates that the authenticated user belongs to the tenant resolved from
    the current subdomain, preventing JWT replay across tenant workspaces.

    Dev (DEBUG=True): req_tenant=None is accepted — localhost has no subdomains.
    Production (DEBUG=False): req_tenant=None means the root domain was reached
    (matedesk.pro/api/*).  All tenant-scoped APIs must be accessed via the
    tenant's own subdomain in production.
    """
    message = 'Access denied: this token does not belong to this workspace.'

    def has_permission(self, request, view):
        from django.conf import settings
        req_tenant = getattr(request, 'tenant', None)
        if req_tenant is None:
            if settings.DEBUG:
                # localhost / dev — no subdomain, skip workspace check
                return True
            # Production root domain: reject all tenant-scoped API calls.
            # Callers must use their subdomain: {slug}.matedesk.pro/api/...
            self.message = 'Tenant workspace required. Access this API via your tenant subdomain.'
            return False
        return (
            request.user is not None
            and request.user.is_authenticated
            and str(getattr(request.user, 'tenant_id', None)) == str(req_tenant.id)
        )


class IsMSPUser(BasePermission):
    """
    Allows access only to users whose role is one of the MSP staff roles.
    """
    message = 'Access denied: MSP staff only.'

    def has_permission(self, request, view):
        return (
            request.user is not None
            and request.user.is_authenticated
            and getattr(request.user, 'role', None) in MSP_ROLES
        )

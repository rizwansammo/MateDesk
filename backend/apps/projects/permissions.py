"""One query boundary for project visibility and edit capabilities."""
from apps.users.permissions import CLIENT_ROLES, MSP_ROLES

from .models import Project


def tenant_for_request(request):
    return getattr(request, 'tenant', None) or getattr(request.user, 'tenant', None)


def visible_projects(request):
    tenant = tenant_for_request(request)
    if tenant is None:
        return Project.objects.none()
    user = request.user
    base = Project.objects.filter(tenant=tenant).select_related('client_org', 'created_by')
    if not user.is_authenticated or not user.is_active or user.tenant_id != tenant.id:
        return base.none()
    if user.role in ('msp_owner', 'msp_manager'):
        return base
    if user.role == 'msp_agent':
        return base.filter(members__user=user).distinct()
    if user.role in CLIENT_ROLES and user.client_org_id:
        return base.filter(
            client_org_id=user.client_org_id,
            client_org__is_active=True,
            visibility='client',
            members__user=user,
            members__role='client_reviewer',
        ).distinct()
    return base.none()


def can_manage_project(user, project):
    if not user.is_active or user.tenant_id != project.tenant_id or user.role not in MSP_ROLES:
        return False
    if user.role in ('msp_owner', 'msp_manager'):
        return True
    return project.members.filter(user=user, role='manager').exists()


def can_edit_work(user, project):
    if can_manage_project(user, project):
        return True
    return (
        user.is_active
        and user.tenant_id == project.tenant_id
        and user.role in MSP_ROLES
        and project.members.filter(user=user, role='contributor').exists()
    )

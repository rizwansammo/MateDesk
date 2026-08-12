from functools import wraps
from django.shortcuts import redirect

SESSION_KEY = '_platform_admin_id'


def get_platform_admin(request):
    """Return the logged-in platform admin User, or None."""
    from apps.users.models import User
    uid = request.session.get(SESSION_KEY)
    if not uid:
        return None
    try:
        return User.objects.get(pk=uid, tenant__isnull=True, is_staff=True, is_active=True)
    except User.DoesNotExist:
        return None


def platform_admin_required(view_func):
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        admin = get_platform_admin(request)
        if not admin:
            return redirect('platform_admin:login')
        request.platform_admin = admin
        return view_func(request, *args, **kwargs)
    return wrapper


def log_action(request, action, target_type='', target_id='', target_label='',
               target_tenant=None, details=None):
    from .models import AdminActionLog
    AdminActionLog.objects.create(
        actor=getattr(request, 'platform_admin', None),
        actor_email=getattr(getattr(request, 'platform_admin', None), 'email', ''),
        action=action,
        target_type=target_type,
        target_id=str(target_id),
        target_label=target_label,
        target_tenant=target_tenant,
        ip_address=request.META.get('REMOTE_ADDR'),
        details=details or {},
    )

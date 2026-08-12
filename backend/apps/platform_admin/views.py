import json
import secrets
from datetime import timedelta

from django.contrib.auth import authenticate
from django.contrib import messages
from django.db.models import Count, Q
from django.http import JsonResponse
from django.shortcuts import render, redirect, get_object_or_404
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from apps.tenants.models import Tenant, ClientOrganization
from apps.users.models import User
from apps.tickets.models import Ticket
from .auth_utils import platform_admin_required, get_platform_admin, SESSION_KEY, log_action
from .models import AdminActionLog, PlatformSettings, PlatformPlan
from .two_fa_utils import (
    create_email_otp, verify_email_otp, send_otp_email,
    generate_totp_secret, get_totp_provisioning_uri, verify_totp_code, generate_qr_svg,
)


# ── Login / Logout ──────────────────────────────────────────────────────────

_PENDING_2FA_KEY = '_pa_pending_2fa'


def login_view(request):
    if get_platform_admin(request):
        return redirect('platform_admin:dashboard')

    error = None
    if request.method == 'POST':
        email    = request.POST.get('email', '').strip()
        password = request.POST.get('password', '')
        remember = request.POST.get('remember_me') == 'on'

        user = authenticate(request, email=email, password=password)
        if user and user.tenant is None and user.is_staff and user.is_active:
            if user.two_fa_enabled:
                # Default to TOTP if available, else email
                default_method = 'totp' if user.totp_enabled else 'email'
                request.session[_PENDING_2FA_KEY] = {
                    'user_pk': str(user.pk),
                    'remember': remember,
                    'active_method': default_method,
                    'email_sent': False,
                }
                if default_method == 'email':
                    otp = create_email_otp(user)
                    send_otp_email(user, otp.code)
                    request.session[_PENDING_2FA_KEY]['email_sent'] = True
                return redirect('platform_admin:two_fa_verify')
            _complete_login(request, user, remember)
            return redirect('platform_admin:dashboard')
        else:
            error = 'Invalid credentials or insufficient permissions.'
            AdminActionLog.objects.create(
                actor=None,
                actor_email=email,
                action='admin_login_failed',
                ip_address=request.META.get('REMOTE_ADDR'),
                details={'email': email},
            )

    return render(request, 'platform_admin/login.html', {'error': error})


def _complete_login(request, user, remember):
    request.session[SESSION_KEY] = str(user.pk)
    request.session.set_expiry(86400 * 30 if remember else 0)
    AdminActionLog.objects.create(
        actor=user,
        actor_email=user.email,
        action='admin_login',
        ip_address=request.META.get('REMOTE_ADDR'),
        details={'email': user.email},
    )


# ── 2FA Verify (during login) ────────────────────────────────────────────────

def two_fa_verify(request):
    pending = request.session.get(_PENDING_2FA_KEY)
    if not pending:
        return redirect('platform_admin:login')

    try:
        user = User.objects.get(pk=pending['user_pk'], tenant__isnull=True, is_staff=True, is_active=True)
    except User.DoesNotExist:
        request.session.pop(_PENDING_2FA_KEY, None)
        return redirect('platform_admin:login')

    active_method = pending.get('active_method', 'totp' if user.totp_enabled else 'email')
    both_enabled  = user.totp_enabled and user.email_2fa_enabled

    # Handle method switch via GET
    switch = request.GET.get('switch')
    if switch in ('totp', 'email'):
        if (switch == 'totp' and user.totp_enabled) or (switch == 'email' and user.email_2fa_enabled):
            active_method = switch
            pending['active_method'] = active_method
            if switch == 'email' and not pending.get('email_sent'):
                otp = create_email_otp(user)
                send_otp_email(user, otp.code)
                pending['email_sent'] = True
            request.session[_PENDING_2FA_KEY] = pending
            request.session.modified = True
            return redirect('platform_admin:two_fa_verify')

    # Handle resend
    resent = False
    if request.method == 'GET' and request.GET.get('resend') == '1' and active_method == 'email':
        otp = create_email_otp(user)
        send_otp_email(user, otp.code)
        pending['email_sent'] = True
        request.session[_PENDING_2FA_KEY] = pending
        request.session.modified = True
        resent = True

    error = None
    if request.method == 'POST':
        code  = request.POST.get('code', '').strip().replace(' ', '')
        valid = False
        if active_method == 'email':
            valid = verify_email_otp(user, code)
        elif active_method == 'totp':
            valid = verify_totp_code(user.totp_secret, code)

        if valid:
            remember = pending.get('remember', False)
            request.session.pop(_PENDING_2FA_KEY, None)
            _complete_login(request, user, remember)
            return redirect('platform_admin:dashboard')
        else:
            error = 'Invalid or expired code. Please try again.'

    email_hint = user.email[:3] + '***' + user.email[user.email.index('@'):]
    return render(request, 'platform_admin/two_fa.html', {
        'active_method': active_method,
        'both_enabled':  both_enabled,
        'totp_enabled':  user.totp_enabled,
        'email_enabled': user.email_2fa_enabled,
        'email_hint':    email_hint,
        'error':         error,
        'resent':        resent,
    })


# ── 2FA Setup (per-admin, requires login) ────────────────────────────────────

@platform_admin_required
def two_fa_setup(request):
    admin = request.platform_admin
    return render(request, 'platform_admin/security/two_fa_setup.html', {
        'page': 'security_2fa',
        'admin': admin,
    })


@platform_admin_required
def two_fa_setup_totp(request):
    admin = request.platform_admin
    error = None

    if request.method == 'POST':
        code   = request.POST.get('code', '').strip()
        secret = request.session.get('_pa_totp_pending')
        if not secret:
            return redirect('platform_admin:two_fa_setup_totp')
        if verify_totp_code(secret, code):
            admin.totp_secret   = secret
            admin.totp_enabled  = True
            admin.save(update_fields=['totp_secret', 'totp_enabled'])
            request.session.pop('_pa_totp_pending', None)
            messages.success(request, 'Authenticator app enabled. You can now use it at login.')
            return redirect('platform_admin:two_fa_setup')
        else:
            error = 'Code incorrect. Make sure your authenticator app time is synced and try again.'

    secret = request.session.get('_pa_totp_pending') or generate_totp_secret()
    request.session['_pa_totp_pending'] = secret
    uri    = get_totp_provisioning_uri(admin, secret)
    qr_svg = generate_qr_svg(uri)

    return render(request, 'platform_admin/security/two_fa_setup_totp.html', {
        'page':   'security_2fa',
        'secret': secret,
        'qr_svg': qr_svg,
        'error':  error,
    })


@platform_admin_required
@require_http_methods(['POST'])
def two_fa_enable_email(request):
    admin = request.platform_admin
    admin.email_2fa_enabled = True
    admin.save(update_fields=['email_2fa_enabled'])
    messages.success(request, 'Email OTP enabled. You can now use it at login.')
    return redirect('platform_admin:two_fa_setup')


@platform_admin_required
@require_http_methods(['POST'])
def two_fa_disable_totp(request):
    admin = request.platform_admin
    admin.totp_enabled = False
    admin.totp_secret  = ''
    admin.save(update_fields=['totp_enabled', 'totp_secret'])
    request.session.pop('_pa_totp_pending', None)
    messages.success(request, 'Authenticator app removed.')
    return redirect('platform_admin:two_fa_setup')


@platform_admin_required
@require_http_methods(['POST'])
def two_fa_disable_email(request):
    admin = request.platform_admin
    admin.email_2fa_enabled = False
    admin.save(update_fields=['email_2fa_enabled'])
    messages.success(request, 'Email OTP disabled.')
    return redirect('platform_admin:two_fa_setup')


def logout_view(request):
    admin = get_platform_admin(request)
    if admin:
        AdminActionLog.objects.create(
            actor=admin,
            actor_email=admin.email,
            action='admin_logout',
            ip_address=request.META.get('REMOTE_ADDR'),
        )
    request.session.flush()
    return redirect('platform_admin:login')


# ── Dashboard ───────────────────────────────────────────────────────────────

@platform_admin_required
def dashboard(request):
    tenants = Tenant.objects.all()
    total = tenants.count()
    active = tenants.filter(status='active').count()
    trial = tenants.filter(status='trial').count()
    suspended = tenants.filter(status='suspended').count()

    total_users = User.objects.filter(tenant__isnull=False).count()
    total_orgs = ClientOrganization.objects.count()
    total_tickets = Ticket.objects.count()
    open_tickets = Ticket.objects.filter(
        status__in=['open', 'pending', 'in_progress']
    ).count()

    recent_logs = AdminActionLog.objects.select_related(
        'actor', 'target_tenant'
    ).order_by('-created_at')[:10]

    # Tenants with high usage (most tickets)
    tenant_usage = (
        Tenant.objects.filter(status__in=['active', 'trial'])
        .annotate(ticket_count=Count('tickets'))
        .order_by('-ticket_count')[:5]
    )

    # Recent tenants
    recent_tenants = Tenant.objects.order_by('-created_at')[:5]

    ctx = {
        'total_tenants': total,
        'active_tenants': active,
        'trial_tenants': trial,
        'suspended_tenants': suspended,
        'total_msp_users': total_users,
        'total_orgs': total_orgs,
        'total_tickets': total_tickets,
        'open_tickets': open_tickets,
        'recent_logs': recent_logs,
        'tenant_usage': tenant_usage,
        'recent_tenants': recent_tenants,
        'page': 'dashboard',
    }
    return render(request, 'platform_admin/dashboard.html', ctx)


# ── Tenants ─────────────────────────────────────────────────────────────────

@platform_admin_required
def tenants_list(request):
    qs = Tenant.objects.annotate(
        org_count=Count('client_orgs', distinct=True),
        user_count=Count('users', distinct=True),
        ticket_count=Count('tickets', distinct=True),
    ).order_by('-created_at')

    search = request.GET.get('q', '').strip()
    status_filter = request.GET.get('status', '')
    plan_filter = request.GET.get('plan', '')

    if search:
        qs = qs.filter(
            Q(name__icontains=search) | Q(slug__icontains=search)
        )
    if status_filter:
        qs = qs.filter(status=status_filter)
    if plan_filter:
        qs = qs.filter(plan=plan_filter)

    # Get owner per tenant
    owners = {
        u.tenant_id: u for u in
        User.objects.filter(
            role='msp_owner', tenant__isnull=False
        ).order_by('tenant_id', 'date_joined')
    }

    ctx = {
        'tenants': qs,
        'owners': owners,
        'search': search,
        'status_filter': status_filter,
        'plan_filter': plan_filter,
        'page': 'tenants',
    }
    return render(request, 'platform_admin/tenants/list.html', ctx)


@platform_admin_required
def tenant_create(request):
    if request.method == 'POST':
        name = request.POST.get('name', '').strip()
        slug = request.POST.get('slug', '').strip()
        plan = request.POST.get('plan', 'starter')
        status = request.POST.get('status', 'trial')
        owner_name = request.POST.get('owner_name', '').strip()
        owner_email = request.POST.get('owner_email', '').strip()
        trial_ends = request.POST.get('trial_ends_at') or None
        max_orgs = request.POST.get('max_organizations') or None
        max_users = request.POST.get('max_users') or None
        max_tickets = request.POST.get('max_tickets') or None

        errors = []
        if not name:
            errors.append('Company name is required.')
        if not slug:
            errors.append('Tenant slug is required.')
        if not owner_email:
            errors.append('Owner email is required.')
        if slug and Tenant.objects.filter(slug=slug).exists():
            errors.append(f'Slug "{slug}" is already taken.')
        if owner_email and User.objects.filter(
            email=owner_email, tenant__isnull=False
        ).exists():
            errors.append(
                f'A user with email {owner_email} already exists in another tenant.'
            )

        if not errors:
            tenant = Tenant.objects.create(
                name=name,
                slug=slug,
                plan=plan,
                status=status,
                trial_ends_at=trial_ends,
                max_organizations=int(max_orgs) if max_orgs else None,
                max_users=int(max_users) if max_users else None,
                max_tickets=int(max_tickets) if max_tickets else None,
            )
            # Create owner
            parts = owner_name.split(' ', 1)
            temp_password = secrets.token_urlsafe(12)
            owner = User.objects.create(
                tenant=tenant,
                email=owner_email,
                first_name=parts[0] if parts else '',
                last_name=parts[1] if len(parts) > 1 else '',
                role='msp_owner',
                is_active=True,
            )
            owner.set_password(temp_password)
            owner.save()

            log_action(
                request, 'tenant_created', 'tenant', tenant.pk, tenant.name, tenant,
                {'plan': plan, 'owner_email': owner_email},
            )
            messages.success(
                request,
                f'Tenant "{name}" created. Owner temporary password: {temp_password}',
            )
            return redirect('platform_admin:tenant_detail', pk=str(tenant.pk))

        ctx = {'errors': errors, 'post': request.POST, 'page': 'tenants'}
        return render(request, 'platform_admin/tenants/create.html', ctx)

    return render(request, 'platform_admin/tenants/create.html', {'page': 'tenants'})


@platform_admin_required
def tenant_detail(request, pk):
    tenant = get_object_or_404(Tenant, pk=pk)
    owner = User.objects.filter(tenant=tenant, role='msp_owner').first()
    orgs = ClientOrganization.objects.filter(tenant=tenant)
    users = User.objects.filter(tenant=tenant).select_related('client_org').order_by('role', 'first_name')
    tickets = Ticket.objects.filter(tenant=tenant).order_by('-created_at')[:20]
    logs = AdminActionLog.objects.filter(
        target_tenant=tenant
    ).order_by('-created_at')[:20]

    ticket_counts = Ticket.objects.filter(tenant=tenant).aggregate(
        total=Count('id'),
        open=Count('id', filter=Q(status__in=['open', 'pending', 'in_progress'])),
        solved=Count('id', filter=Q(status__in=['solved', 'closed'])),
    )
    tab = request.GET.get('tab', 'overview')

    _branding_defaults = {
        'md_icon_size': 32, 'md_font_size': 30, 'md_line_height': 0,
        'md_custom_text': '',
    }
    branding = {**_branding_defaults, **(tenant.branding or {})}
    branding['md_logo_url'] = tenant.branding_md_logo.url if tenant.branding_md_logo else ''

    temp_pw = request.session.pop('_temp_pw', None)
    ctx = {
        'tenant': tenant,
        'owner': owner,
        'orgs': orgs,
        'users': users,
        'tickets': tickets,
        'logs': logs,
        'ticket_counts': ticket_counts,
        'branding': branding,
        'tab': tab,
        'page': 'tenants',
        'temp_pw': temp_pw,
    }
    return render(request, 'platform_admin/tenants/detail.html', ctx)


@platform_admin_required
@require_http_methods(['POST'])
def tenant_delete(request, pk):
    tenant = get_object_or_404(Tenant, pk=pk)
    admin = get_platform_admin(request)

    password = request.POST.get('confirm_password', '')
    verified = authenticate(request, email=admin.email, password=password)
    if not verified:
        messages.error(request, 'Incorrect password — tenant was NOT deleted.')
        return redirect('platform_admin:tenant_detail', pk=pk)

    tenant_name = tenant.name
    log_action(request, 'tenant_deleted', 'tenant', tenant.pk, tenant_name, None,
               {'slug': tenant.slug, 'plan': tenant.plan})
    tenant.delete()
    messages.success(request, f'Tenant "{tenant_name}" and all associated data have been permanently deleted.')
    return redirect('platform_admin:tenants_list')


@platform_admin_required
@require_http_methods(['POST'])
def tenant_deactivate(request, pk):
    tenant = get_object_or_404(Tenant, pk=pk)
    tenant.status = 'suspended'
    tenant.save(update_fields=['status'])
    log_action(request, 'tenant_deactivated', 'tenant', tenant.pk, tenant.name, tenant)
    messages.success(request, f'Tenant "{tenant.name}" has been suspended.')
    return redirect('platform_admin:tenant_detail', pk=pk)


@platform_admin_required
@require_http_methods(['POST'])
def tenant_reactivate(request, pk):
    tenant = get_object_or_404(Tenant, pk=pk)
    tenant.status = 'active'
    tenant.save(update_fields=['status'])
    log_action(request, 'tenant_reactivated', 'tenant', tenant.pk, tenant.name, tenant)
    messages.success(request, f'Tenant "{tenant.name}" has been reactivated.')
    return redirect('platform_admin:tenant_detail', pk=pk)


@platform_admin_required
@require_http_methods(['POST'])
def tenant_reset_owner_password(request, pk):
    tenant = get_object_or_404(Tenant, pk=pk)
    owner = User.objects.filter(tenant=tenant, role='msp_owner').first()
    if not owner:
        messages.error(request, 'No MSP Owner found for this tenant.')
        return redirect('platform_admin:tenant_detail', pk=pk)
    temp_password = secrets.token_urlsafe(12)
    owner.set_password(temp_password)
    owner.save()
    log_action(
        request, 'owner_password_reset', 'user', owner.pk, owner.email, tenant,
        {'owner_email': owner.email},
    )
    request.session['_temp_pw'] = {'email': owner.email, 'password': temp_password}
    messages.success(request, f'Password reset for {owner.email}.')
    return redirect('platform_admin:tenant_detail', pk=pk)


@platform_admin_required
@require_http_methods(['POST'])
def tenant_update_branding(request, pk):
    tenant = get_object_or_404(Tenant, pk=pk)

    def _int(key, default, lo, hi):
        try:
            return max(lo, min(hi, int(request.POST.get(key, default))))
        except (ValueError, TypeError):
            return default

    branding = {
        'md_icon_size':    _int('md_icon_size',   32, 16,  64),
        'md_font_size':    _int('md_font_size',   30, 10,  80),
        'md_line_height':  _int('md_line_height',  0,  0, 120),
        'mc_icon_size':    _int('mc_icon_size',   32, 16,  64),
        'mc_font_size':    _int('mc_font_size',   30, 10,  80),
        'mc_line_height':  _int('mc_line_height',  0,  0, 120),
        'md_custom_text':  request.POST.get('md_custom_text', '').strip()[:80],
        'mc_custom_text':  request.POST.get('mc_custom_text', '').strip()[:80],
    }
    update_fields = ['branding']
    if 'branding_md_logo' in request.FILES:
        tenant.branding_md_logo = request.FILES['branding_md_logo']
        update_fields.append('branding_md_logo')
    if 'branding_mc_logo' in request.FILES:
        tenant.branding_mc_logo = request.FILES['branding_mc_logo']
        update_fields.append('branding_mc_logo')

    tenant.branding = branding
    tenant.save(update_fields=update_fields)
    log_action(request, 'tenant_updated', 'tenant', tenant.pk, tenant.name, tenant,
               {'field': 'branding', 'values': branding})
    messages.success(request, f'Branding updated for "{tenant.name}".')
    return redirect(f'/platform-admin/tenants/{pk}/?tab=branding')


# ── Platform Admin Accounts ─────────────────────────────────────────────────

@platform_admin_required
def admins_list(request):
    admins = User.objects.filter(
        tenant__isnull=True, is_staff=True
    ).order_by('-date_joined')
    temp_pw = request.session.pop('_temp_pw', None)
    ctx = {'admins': admins, 'page': 'accounts_admins', 'temp_pw': temp_pw}
    return render(request, 'platform_admin/accounts/admins.html', ctx)


@platform_admin_required
@require_http_methods(['POST'])
def admin_create(request):
    email = request.POST.get('email', '').strip()
    first_name = request.POST.get('first_name', '').strip()
    last_name = request.POST.get('last_name', '').strip()
    password = request.POST.get('password', '')

    if not email or not password:
        messages.error(request, 'Email and password are required.')
        return redirect('platform_admin:admins_list')

    if User.objects.filter(email=email, tenant__isnull=True).exists():
        messages.error(request, f'Admin with email {email} already exists.')
        return redirect('platform_admin:admins_list')

    user = User.objects.create(
        email=email,
        first_name=first_name,
        last_name=last_name,
        tenant=None,
        is_staff=True,
        is_active=True,
        role='msp_owner',
    )
    user.set_password(password)
    user.save()
    log_action(
        request, 'admin_created', 'user', user.pk, user.email, None,
        {'email': email},
    )
    messages.success(request, f'Admin account created for {email}.')
    return redirect('platform_admin:admins_list')


@platform_admin_required
@require_http_methods(['POST'])
def admin_deactivate(request, pk):
    admin_user = get_object_or_404(User, pk=pk, tenant__isnull=True, is_staff=True)
    if str(admin_user.pk) == str(request.platform_admin.pk):
        messages.error(request, 'You cannot deactivate your own account.')
        return redirect('platform_admin:admins_list')
    admin_user.is_active = False
    admin_user.save(update_fields=['is_active'])
    log_action(
        request, 'admin_deactivated', 'user', admin_user.pk, admin_user.email
    )
    messages.success(request, f'Admin account {admin_user.email} deactivated.')
    return redirect('platform_admin:admins_list')


# ── MSP Users ───────────────────────────────────────────────────────────────

@platform_admin_required
def msp_owners_list(request):
    users = User.objects.filter(
        role='msp_owner', tenant__isnull=False
    ).select_related('tenant').order_by('-date_joined')
    temp_pw = request.session.pop('_temp_pw', None)
    ctx = {
        'users': users,
        'page': 'accounts_owners',
        'role_label': 'MSP Owners',
        'role': 'msp_owner',
        'temp_pw': temp_pw,
    }
    return render(request, 'platform_admin/accounts/users.html', ctx)


@platform_admin_required
def msp_managers_list(request):
    users = User.objects.filter(
        role='msp_manager', tenant__isnull=False
    ).select_related('tenant').order_by('-date_joined')
    ctx = {
        'users': users,
        'page': 'accounts_managers',
        'role_label': 'MSP Managers',
        'role': 'msp_manager',
    }
    return render(request, 'platform_admin/accounts/users.html', ctx)


@platform_admin_required
def msp_agents_list(request):
    users = User.objects.filter(
        role='msp_agent', tenant__isnull=False
    ).select_related('tenant').order_by('-date_joined')
    ctx = {
        'users': users,
        'page': 'accounts_agents',
        'role_label': 'MSP Agents',
        'role': 'msp_agent',
    }
    return render(request, 'platform_admin/accounts/users.html', ctx)


@platform_admin_required
def client_users_list(request):
    users = User.objects.filter(
        role__in=['client_owner', 'end_user'],
        tenant__isnull=False,
    ).select_related('tenant').order_by('-date_joined')
    ctx = {
        'users': users,
        'page': 'accounts_clients',
        'role_label': 'Client Users',
        'role': 'client',
    }
    return render(request, 'platform_admin/accounts/users.html', ctx)


# ── Organizations ───────────────────────────────────────────────────────────

@platform_admin_required
def organizations_list(request):
    orgs = ClientOrganization.objects.select_related('tenant').annotate(
        user_count=Count('users', distinct=True),
        ticket_count=Count('tickets', distinct=True),
    ).order_by('-created_at')
    ctx = {'orgs': orgs, 'page': 'organizations'}
    return render(request, 'platform_admin/organizations/list.html', ctx)


# ── Helpdesk Control ────────────────────────────────────────────────────────

@platform_admin_required
def helpdesk_overview(request):
    ticket_stats = (
        Ticket.objects.values('tenant__name', 'tenant__slug')
        .annotate(
            total=Count('id'),
            open=Count('id', filter=Q(status__in=['open', 'pending', 'in_progress'])),
            solved=Count('id', filter=Q(status__in=['solved', 'closed'])),
        )
        .order_by('-total')[:20]
    )
    ctx = {'ticket_stats': ticket_stats, 'page': 'helpdesk_overview'}
    return render(request, 'platform_admin/helpdesk/overview.html', ctx)


@platform_admin_required
def email_health(request):
    try:
        from apps.email_ingestion.models import TenantEmailSettings
        settings_qs = TenantEmailSettings.objects.select_related('tenant').all()
    except Exception:
        settings_qs = []
    ctx = {'email_settings': settings_qs, 'page': 'helpdesk_email'}
    return render(request, 'platform_admin/helpdesk/email_health.html', ctx)


# ── Security / Audit ────────────────────────────────────────────────────────

@platform_admin_required
def audit_logs(request):
    logs = AdminActionLog.objects.select_related(
        'actor', 'target_tenant'
    ).order_by('-created_at')[:200]
    ctx = {'logs': logs, 'page': 'security_audit'}
    return render(request, 'platform_admin/security/audit_logs.html', ctx)


@platform_admin_required
def login_activity(request):
    logs = AdminActionLog.objects.filter(
        action__in=['admin_login', 'admin_login_failed', 'admin_logout']
    ).order_by('-created_at')[:100]
    ctx = {'logs': logs, 'page': 'security_login'}
    return render(request, 'platform_admin/security/login_activity.html', ctx)


@platform_admin_required
def subscriptions_list(request):
    tenants = Tenant.objects.annotate(
        ticket_count=Count('tickets', distinct=True),
        user_count=Count('users', distinct=True),
    ).order_by('billing_status', 'trial_ends_at')
    ctx = {'tenants': tenants, 'page': 'subscriptions_list'}
    return render(request, 'platform_admin/subscriptions/list.html', ctx)


@platform_admin_required
@require_http_methods(['POST'])
def tenant_change_plan(request, pk):
    tenant = get_object_or_404(Tenant, pk=pk)
    old_plan = tenant.plan
    new_plan = request.POST.get('plan')
    if new_plan in ['starter', 'professional', 'enterprise']:
        tenant.plan = new_plan
        tenant.save(update_fields=['plan'])
        log_action(
            request, 'plan_changed', 'tenant', tenant.pk, tenant.name, tenant,
            {'old_plan': old_plan, 'new_plan': new_plan},
        )
        messages.success(request, f'Plan changed from {old_plan} to {new_plan}.')
    return redirect('platform_admin:tenant_detail', pk=pk)


@platform_admin_required
@require_http_methods(['POST'])
def tenant_update_subscription(request, pk):
    tenant = get_object_or_404(Tenant, pk=pk)
    admin = get_platform_admin(request)

    password = request.POST.get('confirm_password', '')
    verified = authenticate(request, email=admin.email, password=password)
    if not verified:
        messages.error(request, 'Incorrect password — subscription was NOT updated.')
        return redirect(f'/platform-admin/tenants/{pk}/?tab=subscription')

    changed = {}
    plan = request.POST.get('plan')
    if plan in ['starter', 'professional', 'enterprise'] and plan != tenant.plan:
        changed['plan'] = (tenant.plan, plan)
        tenant.plan = plan

    status = request.POST.get('status')
    if status in ['active', 'trial', 'suspended', 'cancelled'] and status != tenant.status:
        changed['status'] = (tenant.status, status)
        tenant.status = status

    billing_status = request.POST.get('billing_status')
    if billing_status in ['paid', 'past_due', 'trial', 'cancelled'] and billing_status != tenant.billing_status:
        changed['billing_status'] = (tenant.billing_status, billing_status)
        tenant.billing_status = billing_status

    trial_ends_at = request.POST.get('trial_ends_at') or None
    tenant.trial_ends_at = trial_ends_at

    renewal_date = request.POST.get('renewal_date') or None
    tenant.renewal_date = renewal_date

    tenant.save()
    log_action(request, 'subscription_updated', 'tenant', tenant.pk, tenant.name, tenant, {'changed': str(changed)})
    messages.success(request, f'Subscription updated for "{tenant.name}".')
    return redirect(f'/platform-admin/tenants/{pk}/?tab=subscription')


@platform_admin_required
@require_http_methods(['POST'])
def tenant_schedule_delete(request, pk):
    tenant = get_object_or_404(Tenant, pk=pk)
    admin = get_platform_admin(request)

    password = request.POST.get('confirm_password', '')
    verified = authenticate(request, email=admin.email, password=password)
    if not verified:
        messages.error(request, 'Incorrect password — deletion was NOT scheduled.')
        return redirect('platform_admin:tenants_list')

    tenant.deletion_scheduled_at = timezone.now() + timedelta(hours=24)
    tenant.status = 'suspended'
    tenant.save(update_fields=['deletion_scheduled_at', 'status'])
    log_action(
        request, 'tenant_deletion_scheduled', 'tenant', tenant.pk, tenant.name, tenant,
        {'deletion_at': str(tenant.deletion_scheduled_at)},
    )
    messages.warning(
        request,
        f'"{tenant.name}" has been suspended and scheduled for permanent deletion in 24 hours.',
    )
    return redirect('platform_admin:tenants_list')


@platform_admin_required
@require_http_methods(['POST'])
def tenant_cancel_delete(request, pk):
    tenant = get_object_or_404(Tenant, pk=pk)
    admin = get_platform_admin(request)

    password = request.POST.get('confirm_password', '')
    verified = authenticate(request, email=admin.email, password=password)
    if not verified:
        messages.error(request, 'Incorrect password — cancellation failed.')
        return redirect('platform_admin:tenants_list')

    tenant.deletion_scheduled_at = None
    tenant.status = 'active'
    tenant.save(update_fields=['deletion_scheduled_at', 'status'])
    log_action(request, 'tenant_deletion_cancelled', 'tenant', tenant.pk, tenant.name, tenant)
    messages.success(request, f'Deletion cancelled for "{tenant.name}". Tenant is now active.')
    return redirect('platform_admin:tenants_list')


# ── Platform Admin Account Management ───────────────────────────────────────

@platform_admin_required
@require_http_methods(['POST'])
def admin_update(request, pk):
    admin_user = get_object_or_404(User, pk=pk, tenant__isnull=True, is_staff=True)
    first_name = request.POST.get('first_name', '').strip()
    last_name = request.POST.get('last_name', '').strip()
    email = request.POST.get('email', '').strip()

    if not email:
        messages.error(request, 'Email is required.')
        return redirect('platform_admin:admins_list')

    if email != admin_user.email and User.objects.filter(email=email, tenant__isnull=True).exclude(pk=pk).exists():
        messages.error(request, f'Email {email} is already in use.')
        return redirect('platform_admin:admins_list')

    admin_user.first_name = first_name
    admin_user.last_name = last_name
    admin_user.email = email
    admin_user.save(update_fields=['first_name', 'last_name', 'email'])
    log_action(request, 'admin_updated', 'user', admin_user.pk, admin_user.email, None)
    messages.success(request, f'Admin account updated for {email}.')
    return redirect('platform_admin:admins_list')


@platform_admin_required
@require_http_methods(['POST'])
def admin_reset_password(request, pk):
    admin_user = get_object_or_404(User, pk=pk, tenant__isnull=True, is_staff=True)
    current_admin = get_platform_admin(request)

    if str(admin_user.pk) == str(current_admin.pk):
        messages.error(request, 'Use the standard password reset flow to change your own password.')
        return redirect('platform_admin:admins_list')

    verifier_password = request.POST.get('confirm_password', '')
    verified = authenticate(request, email=current_admin.email, password=verifier_password)
    if not verified:
        messages.error(request, 'Incorrect password — admin password was NOT reset.')
        return redirect('platform_admin:admins_list')

    temp_password = secrets.token_urlsafe(12)
    admin_user.set_password(temp_password)
    admin_user.save()
    log_action(request, 'admin_password_reset', 'user', admin_user.pk, admin_user.email, None)
    request.session['_temp_pw'] = {'email': admin_user.email, 'password': temp_password}
    messages.success(request, f'Password reset for {admin_user.email}.')
    return redirect('platform_admin:admins_list')


@platform_admin_required
@require_http_methods(['POST'])
def msp_owner_reset_password(request, pk):
    owner = get_object_or_404(User, pk=pk, role='msp_owner', tenant__isnull=False)
    admin = get_platform_admin(request)

    password = request.POST.get('confirm_password', '')
    verified = authenticate(request, email=admin.email, password=password)
    if not verified:
        messages.error(request, 'Incorrect password — MSP owner password was NOT reset.')
        return redirect('platform_admin:msp_owners')

    temp_password = secrets.token_urlsafe(12)
    owner.set_password(temp_password)
    owner.save()
    log_action(
        request, 'msp_owner_password_reset', 'user', owner.pk, owner.email, owner.tenant,
        {'owner_email': owner.email},
    )
    request.session['_temp_pw'] = {'email': owner.email, 'password': temp_password}
    messages.success(request, f'Password reset for {owner.email}.')
    return redirect('platform_admin:msp_owners')


# ── Platform Settings ────────────────────────────────────────────────────────

@platform_admin_required
def settings_index(request):
    ps = PlatformSettings.load()
    ctx = {'page': 'settings', 'ps': ps}
    return render(request, 'platform_admin/settings/index.html', ctx)


@platform_admin_required
@require_http_methods(['POST'])
def settings_update(request):
    ps = PlatformSettings.load()
    admin = get_platform_admin(request)

    ps.platform_name   = request.POST.get('platform_name', ps.platform_name).strip()
    ps.company_name    = request.POST.get('company_name', ps.company_name).strip()
    ps.version         = request.POST.get('version', ps.version).strip()
    ps.platform_url    = request.POST.get('platform_url', ps.platform_url).strip()
    ps.admin_panel_url = request.POST.get('admin_panel_url', ps.admin_panel_url).strip()
    ps.environment     = request.POST.get('environment', ps.environment).strip()
    ps.operator        = request.POST.get('operator', ps.operator).strip()
    ps.support_email   = request.POST.get('support_email', ps.support_email).strip()
    ps.status_text     = request.POST.get('status_text', ps.status_text).strip()
    ps.build_info      = request.POST.get('build_info', ps.build_info).strip()
    poll_interval = request.POST.get('email_poll_interval')
    if poll_interval and poll_interval.isdigit() and int(poll_interval) in (30, 60, 120, 300):
        ps.email_poll_interval = int(poll_interval)
    # Admin SMTP fields (only save if submitted in this form)
    if 'admin_smtp_host' in request.POST:
        ps.admin_smtp_host       = request.POST.get('admin_smtp_host', '').strip()
        ps.admin_smtp_port       = int(request.POST.get('admin_smtp_port', 587) or 587)
        ps.admin_smtp_username   = request.POST.get('admin_smtp_username', '').strip()
        new_pw = request.POST.get('admin_smtp_password', '')
        if new_pw:
            ps.admin_smtp_password = new_pw
        ps.admin_smtp_use_tls    = request.POST.get('admin_smtp_use_tls') == 'on'
        ps.admin_smtp_from_email = request.POST.get('admin_smtp_from_email', '').strip()
        ps.admin_smtp_from_name  = request.POST.get('admin_smtp_from_name', '').strip()
    ps.updated_by      = admin
    ps.save()

    log_action(request, 'platform_settings_updated', 'settings', 1, 'Platform Settings', None)
    messages.success(request, 'Platform settings saved.')
    return redirect('platform_admin:settings')


# ── Plans / Subscriptions ────────────────────────────────────────────────────

@platform_admin_required
def plans_list(request):
    plan_stats = (
        Tenant.objects.values('plan')
        .annotate(count=Count('id'))
        .order_by('plan')
    )
    counts = {row['plan']: row['count'] for row in plan_stats}
    plans = PlatformPlan.objects.all()

    ctx = {
        'plan_stats': plan_stats,
        'starter_count': counts.get('starter', 0),
        'professional_count': counts.get('professional', 0),
        'enterprise_count': counts.get('enterprise', 0),
        'plans': plans,
        'page': 'subscriptions_plans',
    }
    return render(request, 'platform_admin/subscriptions/plans.html', ctx)


@platform_admin_required
@require_http_methods(['POST'])
def plan_update(request, pk):
    plan = get_object_or_404(PlatformPlan, pk=pk)

    plan.name         = request.POST.get('name', plan.name).strip()
    plan.tagline      = request.POST.get('tagline', plan.tagline).strip()
    plan.price        = request.POST.get('price', plan.price).strip()
    plan.price_monthly = request.POST.get('price_monthly', plan.price_monthly).strip()
    plan.annual_note  = request.POST.get('annual_note', plan.annual_note).strip()
    plan.is_featured  = request.POST.get('is_featured') == 'on'

    raw_features = request.POST.get('features', '')
    plan.features = [f.strip() for f in raw_features.splitlines() if f.strip()]

    plan.save()
    log_action(request, 'plan_updated', 'plan', plan.pk, plan.name, None)
    messages.success(request, f'Plan "{plan.name}" updated.')
    return redirect('platform_admin:plans_list')


# ── Public Plans API (no auth) ───────────────────────────────────────────────

def public_plans_api(request):
    plans = PlatformPlan.objects.all().order_by('sort_order')
    data = [
        {
            'plan_key': p.plan_key,
            'name': p.name,
            'tagline': p.tagline,
            'price': p.price,
            'price_monthly': p.price_monthly,
            'annual': p.annual_note,
            'featured': p.is_featured,
            'features': p.features,
        }
        for p in plans
    ]
    return JsonResponse({'plans': data})

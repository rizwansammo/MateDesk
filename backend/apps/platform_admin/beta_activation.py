from urllib.parse import urlencode

from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

from apps.email_ingestion.models import TenantEmailSettings
from apps.tenants.models import ClientOrganization, Tenant
from apps.users.models import User
from apps.users.permissions import ROLE_MSP_OWNER

from .platform_email import send_platform_email


def provision_beta_application(application):
    """Provision an approved beta workspace exactly once.

    The tenant is active immediately, while the owner remains inactive with an
    unusable password until the one-time activation link is completed.
    """
    if application.provisioned_tenant_id and application.owner_user_id:
        return application.provisioned_tenant, application.owner_user

    if application.status != application.STATUS_APPROVED:
        raise ValueError('Only approved applications can be provisioned.')

    if Tenant.objects.filter(slug=application.requested_slug).exists():
        raise ValueError('The requested workspace subdomain is no longer available.')
    if User.objects.filter(email__iexact=application.email).exists():
        raise ValueError('An account with this email now exists on the platform.')

    parts = application.owner_name.strip().split(' ', 1)
    first_name = parts[0] if parts else ''
    last_name = parts[1] if len(parts) > 1 else ''

    tenant = Tenant.objects.create(
        name=application.company_name,
        slug=application.requested_slug,
        plan='starter',
        status='active',
        billing_status='trial',
        is_active=True,
    )
    owner = User.objects.create_user(
        email=application.email,
        password=None,
        tenant=tenant,
        first_name=first_name,
        last_name=last_name,
        role=ROLE_MSP_OWNER,
        is_active=False,
    )

    ClientOrganization.objects.create(
        tenant=tenant,
        name='Walk-In',
        is_active=True,
    )
    TenantEmailSettings.objects.create(tenant=tenant)

    application.provisioned_tenant = tenant
    application.owner_user = owner
    application.save(update_fields=['provisioned_tenant', 'owner_user', 'updated_at'])
    return tenant, owner


def build_activation_url(application, origin):
    if not application.owner_user_id:
        raise ValueError('Application has not been provisioned.')

    owner = application.owner_user
    uid = urlsafe_base64_encode(force_bytes(owner.pk))
    token = default_token_generator.make_token(owner)
    query = urlencode({'uid': uid, 'token': token})
    return f"{origin.rstrip('/')}/activate?{query}"


def workspace_url(application, origin):
    if not application.provisioned_tenant_id:
        return ''

    root_host = origin.split('://', 1)[-1].split('/', 1)[0]
    scheme = origin.split('://', 1)[0] if '://' in origin else 'https'

    if ':' in root_host and root_host.rsplit(':', 1)[-1].isdigit():
        host, port = root_host.rsplit(':', 1)
        return f'{scheme}://{application.provisioned_tenant.slug}.{host}:{port}/login'

    return f'{scheme}://{application.provisioned_tenant.slug}.{root_host}/login'


def activation_expiry_label():
    seconds = int(getattr(settings, 'PASSWORD_RESET_TIMEOUT', 60 * 60 * 24 * 3))
    hours = max(1, seconds // 3600)
    if hours % 24 == 0:
        days = hours // 24
        return f'{days} day' + ('s' if days != 1 else '')
    return f'{hours} hours'


def send_beta_receipt_email(application, support_email=''):
    subject = 'We received your MateDesk Private Beta application'
    text_body = (
        f'Hi {application.owner_name},\n\n'
        'Thanks for applying to the MateDesk Private Beta. '
        'Our team will review your workspace request.\n\n'
        f'Requested workspace: {application.requested_slug}.matedesk.pro\n\n'
        'We will email you again when your application is approved.\n\n'
        'MateDesk\nNetaMate Solutions'
    )
    html_body = f"""<!doctype html>
<html><body style="margin:0;background:#f5f7fb;font-family:Inter,Arial,sans-serif;color:#111827;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:36px 18px;background:#f5f7fb;"><tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e5e7eb;">
<tr><td style="padding:22px 28px;border-bottom:1px solid #e5e7eb;">
<span style="font-size:12px;font-weight:700;letter-spacing:.08em;color:#1f4ed8;">MATEDESK · PRIVATE BETA</span>
</td></tr>
<tr><td style="padding:30px 28px;">
<h1 style="margin:0 0 14px;font-size:22px;color:#111827;">Application received</h1>
<p style="margin:0 0 14px;font-size:14px;line-height:1.65;color:#4b5563;">Hi {application.owner_name},</p>
<p style="margin:0 0 20px;font-size:14px;line-height:1.65;color:#4b5563;">Thanks for applying to the MateDesk Private Beta. Our team will review your workspace request and email you again when access is approved.</p>
<div style="padding:14px 16px;background:#f8fafc;border:1px solid #e5e7eb;font-size:13px;color:#4b5563;">
Requested workspace<br><strong style="color:#111827;">{application.requested_slug}.matedesk.pro</strong>
</div>
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;">MateDesk · NetaMate Solutions</td></tr>
</table></td></tr></table></body></html>"""

    return send_platform_email(
        to_email=application.email,
        subject=subject,
        text_body=text_body,
        html_body=html_body,
        reply_to=support_email or None,
    )


def send_beta_activation_email(application, activation_url, support_email=''):
    if not application.provisioned_tenant_id or not application.owner_user_id:
        return False, 'Workspace has not been provisioned.'

    expiry = activation_expiry_label()
    workspace = f'{application.provisioned_tenant.slug}.matedesk.pro'
    subject = "You're approved for the MateDesk Private Beta"
    text_body = (
        f'Hi {application.owner_name},\n\n'
        'Your application for the MateDesk Private Beta has been approved.\n\n'
        f'Workspace: {workspace}\n'
        f'Activate your account and set your password: {activation_url}\n\n'
        f'This one-time activation link expires in {expiry}.\n\n'
        'Welcome to MateDesk.\nNetaMate Solutions'
    )
    html_body = f"""<!doctype html>
<html><body style="margin:0;background:#0d1117;font-family:Inter,Arial,sans-serif;color:#e6edf3;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 18px;background:#0d1117;"><tr><td align="center">
<table width="540" cellpadding="0" cellspacing="0" style="max-width:540px;background:#161b22;border:1px solid #30363d;">
<tr><td style="padding:22px 30px;border-bottom:1px solid #21262d;">
<span style="font-size:12px;font-weight:700;letter-spacing:.08em;color:#58a6ff;">MATEDESK · PRIVATE BETA</span>
</td></tr>
<tr><td style="padding:32px 30px;">
<h1 style="margin:0 0 16px;font-size:24px;color:#f0f6fc;">You're approved.</h1>
<p style="margin:0 0 12px;font-size:14px;line-height:1.65;color:#9da7b3;">Hi {application.owner_name},</p>
<p style="margin:0 0 22px;font-size:14px;line-height:1.65;color:#9da7b3;">Your MateDesk Private Beta application has been approved. Your workspace is ready for account activation.</p>
<div style="padding:14px 16px;background:#0d1117;border:1px solid #30363d;margin-bottom:22px;">
<div style="font-size:11px;color:#6e7681;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;">Workspace</div>
<div style="font-size:14px;color:#f0f6fc;font-family:monospace;">{workspace}</div>
</div>
<a href="{activation_url}" style="display:inline-block;padding:12px 18px;background:#1f4ed8;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;">Set up your password</a>
<p style="margin:20px 0 0;font-size:12px;line-height:1.6;color:#6e7681;">This is a one-time activation link and expires in {expiry}. If the button does not work, copy this link into your browser:<br><span style="word-break:break-all;color:#8b949e;">{activation_url}</span></p>
</td></tr>
<tr><td style="padding:16px 30px;border-top:1px solid #21262d;font-size:11px;color:#6e7681;">MateDesk · NetaMate Solutions</td></tr>
</table></td></tr></table></body></html>"""

    return send_platform_email(
        to_email=application.email,
        subject=subject,
        text_body=text_body,
        html_body=html_body,
        reply_to=support_email or None,
    )

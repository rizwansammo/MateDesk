from django.contrib import admin
from django.urls import path, include, re_path
import mimetypes

from django.http import FileResponse, Http404, JsonResponse
from django.views.generic import RedirectView
from django.views.static import serve
from django.conf import settings
from apps.platform_admin.views import public_plans_api


def health(request):
    return JsonResponse({'status': 'ok', 'service': f'{settings.PRODUCT_NAME} API'})


def public_instance_branding_logo(request):
    tenant = getattr(request, 'tenant', None)
    if tenant is None or not tenant.branding_md_logo:
        raise Http404

    logo = tenant.branding_md_logo
    content_type = mimetypes.guess_type(logo.name)[0] or 'application/octet-stream'
    response = FileResponse(logo.open('rb'), content_type=content_type)
    # Branding changes should show immediately on login/dashboard after an owner saves them.
    response['Cache-Control'] = 'no-store'
    response['X-Content-Type-Options'] = 'nosniff'
    return response


def public_instance_config(request):
    tenant = getattr(request, 'tenant', None)

    signup_mode = 'public_trial'
    if settings.DEPLOYMENT_MODE == 'multi_tenant':
        from apps.platform_admin.models import PlatformSettings
        signup_mode = PlatformSettings.load().signup_mode

    public_registration_enabled = (
        settings.PUBLIC_REGISTRATION_ENABLED
        and signup_mode == 'public_trial'
    )

    product_name = settings.PRODUCT_NAME
    product_wordmark = settings.PRODUCT_WORDMARK
    product_logo_url = settings.PRODUCT_LOGO_URL
    product_logo_variant = settings.PRODUCT_LOGO_VARIANT
    product_logo_theme_aware = settings.PRODUCT_LOGO_THEME_AWARE

    if tenant is not None:
        branding = tenant.branding or {}
        product_wordmark = branding.get('md_custom_text') or product_wordmark
        if (
            branding.get('md_custom_text')
            and settings.DEPLOYMENT_MODE == 'multi_tenant'
        ):
            product_name = (
                product_wordmark
                if product_wordmark.lower().endswith('helpdesk')
                else f'{product_wordmark} HelpDesk'
            )
        product_logo_theme_aware = branding.get(
            'md_logo_theme_aware',
            product_logo_theme_aware,
        )

        if tenant.branding_md_logo:
            product_logo_url = '/api/instance/branding-logo/'
            product_logo_variant = ''
        elif branding.get('md_logo_variant'):
            product_logo_url = ''
            product_logo_variant = branding['md_logo_variant']

    return JsonResponse({
        'deployment_mode': settings.DEPLOYMENT_MODE,
        'product_name': product_name,
        'product_wordmark': product_wordmark,
        'vendor_name': settings.PRODUCT_VENDOR_NAME,
        'product_logo_url': product_logo_url,
        'product_logo_variant': product_logo_variant,
        'product_logo_theme_aware': product_logo_theme_aware,
        'tenant_name': tenant.name if tenant is not None else '',
        'login_headline': settings.LOGIN_HEADLINE,
        'login_subtitle': settings.LOGIN_SUBTITLE,
        'signup_mode': signup_mode,
        'public_registration_enabled': public_registration_enabled,
    })


urlpatterns = [
    path('api/health/', health),
    path('api/instance/public/', public_instance_config),
    path('api/instance/branding-logo/', public_instance_branding_logo),
    path('api/',        include('apps.users.urls')),
    path('api/',        include('apps.tickets.urls')),
    path('api/',        include('apps.tenants.urls')),
    path('api/',        include('apps.email_ingestion.urls')),
    path('api/',        include('apps.kb.urls')),
    path('api/',        include('apps.events.urls')),
    path('api/',        include('apps.canned.urls')),
    path('api/productivity/', include('apps.productivity.urls')),
    path('api/',              include('apps.billing.urls')),
    path('api/',              include('apps.sla.urls')),
    path('api/',              include('apps.automation.urls')),
    path('api/chat/',         include('apps.chat.urls')),
]

# Public pricing/plans only exists when public tenant registration is enabled.
if settings.PUBLIC_REGISTRATION_ENABLED:
    urlpatterns += [
        path('api/plans/public/', public_plans_api),
    ]

# Platform-level tenant/subscription administration is a SaaS concern. Dedicated
# single-tenant deployments disable this surface by default.
if settings.PLATFORM_ADMIN_ENABLED:
    urlpatterns += [
        # Django built-in admin kept at a hidden path — use /platform-admin/ instead
        path('django-admin/', admin.site.urls),
        path('admin',          RedirectView.as_view(url='/platform-admin/login/', permanent=False)),
        path('admin/',         RedirectView.as_view(url='/platform-admin/login/', permanent=False)),
        path('platform-admin', RedirectView.as_view(url='/platform-admin/login/', permanent=False)),
        path('platform-admin/', include('apps.platform_admin.urls', namespace='platform_admin')),
    ]

# Media files: served raw ONLY in local development. In production, attachments are
# fetched exclusively through the authenticated, tenant-scoped endpoint
# (/api/files/<id>/), so the unauthenticated /media/ route is never registered.
if settings.DEBUG:
    urlpatterns += [
        re_path(r'^media/(?P<path>.*)$', serve, {'document_root': settings.MEDIA_ROOT}),
    ]

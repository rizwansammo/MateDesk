from django.contrib import admin
from django.urls import path, include, re_path
from django.http import JsonResponse
from django.views.generic import RedirectView
from django.views.static import serve
from django.conf import settings
from apps.platform_admin.views import public_plans_api


def health(request):
    return JsonResponse({'status': 'ok', 'service': 'MateDesk API'})


def public_instance_config(request):
    tenant = getattr(request, 'tenant', None)
    return JsonResponse({
        'deployment_mode': settings.DEPLOYMENT_MODE,
        'product_name': settings.PRODUCT_NAME,
        'vendor_name': settings.PRODUCT_VENDOR_NAME,
        'tenant_name': tenant.name if tenant is not None else '',
        'login_headline': settings.LOGIN_HEADLINE,
        'login_subtitle': settings.LOGIN_SUBTITLE,
        'public_registration_enabled': settings.PUBLIC_REGISTRATION_ENABLED,
    })


urlpatterns = [
    path('api/health/', health),
    path('api/instance/public/', public_instance_config),
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

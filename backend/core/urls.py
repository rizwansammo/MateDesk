from django.contrib import admin
from django.urls import path, include, re_path
from django.http import JsonResponse
from django.views.generic import RedirectView
from django.views.static import serve
from django.conf import settings
from apps.platform_admin.views import public_plans_api


def health(request):
    return JsonResponse({'status': 'ok', 'service': 'MateDesk API'})


urlpatterns = [
    # Django built-in admin kept at a hidden path — use /platform-admin/ instead
    path('django-admin/', admin.site.urls),
    path('api/health/', health),
    path('api/plans/public/', public_plans_api),
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
    # Platform Admin panel
    path('admin',         RedirectView.as_view(url='/platform-admin/login/', permanent=False)),
    path('admin/',        RedirectView.as_view(url='/platform-admin/login/', permanent=False)),
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

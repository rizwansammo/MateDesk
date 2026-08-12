from django.urls import path
from rest_framework.routers import SimpleRouter

from .views import (
    TicketViewSet, ClientOrgListView, AgentListView, StatsView,
    AgentStatsView, RecentActivityView, VolumeByDayView,
    NotificationListView, NotificationMarkReadView, NotificationMarkAllReadView,
    AttachmentFileView, SupportGroupViewSet,
)

router = SimpleRouter(trailing_slash=True)
router.register(r'tickets',        TicketViewSet,       basename='ticket')
router.register(r'support-groups', SupportGroupViewSet, basename='support-group')

urlpatterns = router.urls + [
    path('files/<uuid:pk>/', AttachmentFileView.as_view(), name='attachment_file'),
    path('client-orgs/',    ClientOrgListView.as_view(),  name='client_orgs'),
    path('agents/',         AgentListView.as_view(),       name='agents'),
    path('stats/',          StatsView.as_view(),           name='stats'),
    path('stats/agents/',   AgentStatsView.as_view(),      name='agent_stats'),
    path('stats/activity/', RecentActivityView.as_view(),  name='recent_activity'),
    path('stats/volume/',   VolumeByDayView.as_view(),     name='volume_by_day'),
    path('notifications/',                          NotificationListView.as_view(),       name='notifications'),
    path('notifications/read-all/',                 NotificationMarkAllReadView.as_view(), name='notifications_read_all'),
    path('notifications/<uuid:pk>/read/',           NotificationMarkReadView.as_view(),   name='notification_read'),
]

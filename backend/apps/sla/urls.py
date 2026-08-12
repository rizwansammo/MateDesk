from django.urls import path
from .views import SLAPolicyListView, SLAPolicyDetailView, VIPRuleView

urlpatterns = [
    path('sla/policies/',          SLAPolicyListView.as_view()),
    path('sla/policies/<uuid:pk>/', SLAPolicyDetailView.as_view()),
    path('sla/vip-rule/',           VIPRuleView.as_view()),
]

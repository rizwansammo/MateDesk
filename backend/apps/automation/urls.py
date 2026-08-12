from django.urls import path
from .views import (
    AutomationRuleListView, AutomationRuleDetailView,
    AutomationRegistryView, AutomationTemplatesView,
    AutomationLogListView, AutomationTestView,
)

urlpatterns = [
    path('automation/rules/',           AutomationRuleListView.as_view()),
    path('automation/rules/<uuid:pk>/', AutomationRuleDetailView.as_view()),
    path('automation/registry/',        AutomationRegistryView.as_view()),
    path('automation/templates/',       AutomationTemplatesView.as_view()),
    path('automation/logs/',            AutomationLogListView.as_view()),
    path('automation/test/',            AutomationTestView.as_view()),
]

from django.urls import path
from .views import EmailSettingsView, TestImapView, KnownSenderListView, AssignSenderView, KnownSenderDeleteView

urlpatterns = [
    path('email-settings/',           EmailSettingsView.as_view()),
    path('email-settings/test-imap/', TestImapView.as_view()),
    path('senders/',                  KnownSenderListView.as_view()),
    path('senders/assign/',           AssignSenderView.as_view()),
    path('senders/<int:pk>/',         KnownSenderDeleteView.as_view()),
]

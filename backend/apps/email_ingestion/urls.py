from django.urls import path
from .views import (
    EmailSettingsView, TestImapView, TestSmtpView,
    MateMailConnectStartView, MateMailConnectCompleteView, MateMailDisconnectView,
    KnownSenderListView, AssignSenderView, KnownSenderDeleteView,
)

urlpatterns = [
    path('email-settings/',           EmailSettingsView.as_view()),
    path('email-settings/test-imap/', TestImapView.as_view()),
    path('email-settings/test-smtp/', TestSmtpView.as_view()),
    path('email-settings/matemail/start/', MateMailConnectStartView.as_view()),
    path('email-settings/matemail/complete/', MateMailConnectCompleteView.as_view()),
    path('email-settings/matemail/disconnect/', MateMailDisconnectView.as_view()),
    path('senders/',                  KnownSenderListView.as_view()),
    path('senders/assign/',           AssignSenderView.as_view()),
    path('senders/<int:pk>/',         KnownSenderDeleteView.as_view()),
]

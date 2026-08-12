from django.urls import path

from .views import (
    DMInboxView,
    DMMessagesView,
    DMUnreadCountView,
    DMMarkReadView,
    SupportQueueView,
    SupportHistoryView,
    SupportSessionMessagesView,
    MyActiveSessionView,
    ChatAgentsListView,
    ChatUsersListView,
    ChatOrgUsersView,
)

urlpatterns = [
    # DM
    path('dm/inbox/',                    DMInboxView.as_view(),          name='chat_dm_inbox'),
    path('dm/messages/<uuid:user_id>/',  DMMessagesView.as_view(),       name='chat_dm_messages'),
    path('dm/unread/',                   DMUnreadCountView.as_view(),     name='chat_dm_unread'),
    path('dm/read/<uuid:user_id>/',      DMMarkReadView.as_view(),        name='chat_dm_mark_read'),

    # Support
    path('support/queue/',                                SupportQueueView.as_view(),           name='chat_support_queue'),
    path('support/history/',                              SupportHistoryView.as_view(),          name='chat_support_history'),
    path('support/sessions/<uuid:session_id>/messages/', SupportSessionMessagesView.as_view(),  name='chat_support_messages'),
    path('support/my-session/',                          MyActiveSessionView.as_view(),          name='chat_my_session'),

    # Presence-aware user/agent lists
    path('agents/',    ChatAgentsListView.as_view(),  name='chat_agents'),
    path('users/',     ChatUsersListView.as_view(),   name='chat_users'),
    path('org-users/', ChatOrgUsersView.as_view(),    name='chat_org_users'),
]

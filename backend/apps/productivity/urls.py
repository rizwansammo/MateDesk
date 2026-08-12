from django.urls import path
from .views import AgentTodoListView, AgentTodoDetailView, AnnouncementListView, AnnouncementDetailView

urlpatterns = [
    path('todos/',               AgentTodoListView.as_view()),
    path('todos/<uuid:pk>/',     AgentTodoDetailView.as_view()),
    path('announcements/',       AnnouncementListView.as_view()),
    path('announcements/<uuid:pk>/', AnnouncementDetailView.as_view()),
]

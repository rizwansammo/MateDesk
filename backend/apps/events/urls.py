from django.urls import path
from .views import EventListCreateView, EventDetailView

urlpatterns = [
    path('events/',        EventListCreateView.as_view(), name='events_list'),
    path('events/<uuid:pk>/', EventDetailView.as_view(),  name='events_detail'),
]

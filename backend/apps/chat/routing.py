from django.urls import re_path

from .consumers import ChatConsumer, SupportConsumer

websocket_urlpatterns = [
    re_path(r'^ws/chat/$', ChatConsumer.as_asgi()),
    re_path(r'^ws/support/$', SupportConsumer.as_asgi()),
]

import os
from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')

django_asgi_app = get_asgi_application()

# Channels is a hard dependency — chat is WebSocket-only. These imports are
# deliberately NOT wrapped in try/except: a failure here must crash at boot
# rather than silently falling back to an HTTP-only server, which would leave
# live chat permanently broken with no error in any log.
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
from apps.chat.routing import websocket_urlpatterns as chat_ws

application = ProtocolTypeRouter(
    {
        'http': django_asgi_app,
        'websocket': AuthMiddlewareStack(
            URLRouter(chat_ws)
        ),
    }
)

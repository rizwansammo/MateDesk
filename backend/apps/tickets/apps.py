from django.apps import AppConfig


class TicketsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name  = 'apps.tickets'
    label = 'tickets'

    def ready(self):
        from . import signals  # noqa: F401

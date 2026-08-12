from django.apps import AppConfig


class SlaConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name  = 'apps.sla'
    label = 'sla'

    def ready(self):
        from django.db.models.signals import post_save
        from django.apps import apps

        Ticket = apps.get_model('tickets', 'Ticket')
        Reply  = apps.get_model('tickets', 'Reply')

        from .signals import sla_ticket_post_save, sla_reply_post_save

        post_save.connect(sla_ticket_post_save, sender=Ticket, dispatch_uid='sla_ticket_post_save')
        post_save.connect(sla_reply_post_save,  sender=Reply,  dispatch_uid='sla_reply_post_save')

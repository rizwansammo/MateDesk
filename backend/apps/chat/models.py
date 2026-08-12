import uuid
from django.conf import settings
from django.db import models


STATUS_WAITING = 'waiting'
STATUS_ACTIVE  = 'active'
STATUS_ENDED   = 'ended'

SESSION_STATUS_CHOICES = [
    (STATUS_WAITING, 'Waiting'),
    (STATUS_ACTIVE,  'Active'),
    (STATUS_ENDED,   'Ended'),
]

INITIATED_BY_CHOICES = [
    ('user',  'User'),
    ('agent', 'Agent'),
]

SENDER_TYPE_CHOICES = [
    ('user',  'User'),
    ('agent', 'Agent'),
]


class DirectMessage(models.Model):
    id        = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant    = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='direct_messages')
    sender    = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='sent_dms'
    )
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='received_dms'
    )
    body      = models.TextField()
    is_read   = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'chat_direct_messages'
        ordering = ['created_at']

    def __str__(self):
        return f'DM {self.sender_id} → {self.recipient_id} [{self.created_at}]'


class SupportSession(models.Model):
    id             = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant         = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='support_sessions')
    session_number = models.CharField(max_length=25, unique=True)  # CHT-YYYYMMDD-XXXXX
    user           = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='support_sessions_as_user'
    )
    agent          = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='support_sessions_as_agent'
    )
    status         = models.CharField(max_length=10, choices=SESSION_STATUS_CHOICES, default=STATUS_WAITING)
    initiated_by   = models.CharField(max_length=5, choices=INITIATED_BY_CHOICES)
    created_at     = models.DateTimeField(auto_now_add=True)
    ended_at       = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'chat_support_sessions'
        ordering = ['-created_at']

    def __str__(self):
        return self.session_number

    @classmethod
    def generate_session_number_for_tenant(cls, tenant_id) -> str:
        from django.utils import timezone
        today = timezone.now().date()
        date_str = today.strftime('%Y%m%d')
        count = cls.objects.filter(tenant_id=tenant_id, created_at__date=today).count() + 1
        return f'CHT-{date_str}-{count:05d}'


class SupportMessage(models.Model):
    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session     = models.ForeignKey(SupportSession, on_delete=models.CASCADE, related_name='messages')
    sender      = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='support_messages_sent'
    )
    sender_type = models.CharField(max_length=5, choices=SENDER_TYPE_CHOICES)
    body        = models.TextField()
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'chat_support_messages'
        ordering = ['created_at']

    def __str__(self):
        return f'{self.session.session_number} [{self.sender_type}] {self.body[:50]}'

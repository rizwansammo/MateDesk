from django.db import models

from .crypto import decrypt_email_credential, encrypt_email_credential

AUTH_METHOD_BASIC  = 'basic'
AUTH_METHOD_OAUTH2 = 'oauth2'
AUTH_METHOD_CHOICES = [
    (AUTH_METHOD_BASIC,  'Basic Auth (App Password)'),
    (AUTH_METHOD_OAUTH2, 'OAuth2 / Modern Auth'),
]


class TenantEmailSettings(models.Model):
    tenant = models.OneToOneField(
        'tenants.Tenant', on_delete=models.CASCADE, related_name='email_settings'
    )

    # Auth method
    auth_method = models.CharField(
        max_length=10, choices=AUTH_METHOD_CHOICES, default=AUTH_METHOD_BASIC,
    )

    # IMAP — inbound mail
    imap_host     = models.CharField(max_length=255, blank=True)
    imap_port     = models.PositiveIntegerField(default=993)
    imap_username = models.CharField(max_length=255, blank=True)
    imap_password = models.CharField(max_length=512, blank=True)
    imap_use_ssl  = models.BooleanField(default=True)
    imap_folder   = models.CharField(max_length=100, default='INBOX')
    imap_enabled  = models.BooleanField(default=False)

    # SMTP — outbound replies
    smtp_host       = models.CharField(max_length=255, blank=True)
    smtp_port       = models.PositiveIntegerField(default=587)
    smtp_username   = models.CharField(max_length=255, blank=True)
    smtp_password   = models.CharField(max_length=512, blank=True)
    smtp_use_tls    = models.BooleanField(default=True)
    smtp_from_name  = models.CharField(max_length=255, blank=True)
    smtp_from_email = models.EmailField(blank=True)
    smtp_enabled    = models.BooleanField(default=False)

    # OAuth2 / Modern Auth fields
    oauth_provider      = models.CharField(max_length=20, blank=True)   # 'm365' | 'google' | 'zoho'
    oauth_client_id     = models.CharField(max_length=500, blank=True)
    oauth_client_secret = models.CharField(max_length=500, blank=True)
    oauth_tenant_id     = models.CharField(max_length=255, blank=True)  # M365 Directory/Tenant ID

    # Status
    last_polled_at   = models.DateTimeField(null=True, blank=True)
    emails_processed = models.PositiveIntegerField(default=0)
    last_error       = models.TextField(blank=True)

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'tenant_email_settings'

    def get_imap_password(self) -> str:
        return decrypt_email_credential(self.imap_password)

    def get_smtp_password(self) -> str:
        return decrypt_email_credential(self.smtp_password)

    def get_oauth_client_secret(self) -> str:
        return decrypt_email_credential(self.oauth_client_secret)

    def save(self, *args, **kwargs):
        update_fields = kwargs.get('update_fields')
        for field in ('imap_password', 'smtp_password', 'oauth_client_secret'):
            if update_fields is None or field in update_fields:
                raw = getattr(self, field, '') or ''
                if raw and not raw.startswith('enc:v1:'):
                    setattr(self, field, encrypt_email_credential(raw))
        super().save(*args, **kwargs)

    def __str__(self):
        return f'Email settings [{self.tenant.slug}]'


class KnownSender(models.Model):
    """Maps a full email address to a client org within a tenant.
    Takes priority over domain-based org routing during email ingestion."""
    tenant     = models.ForeignKey(
        'tenants.Tenant', on_delete=models.CASCADE, related_name='known_senders'
    )
    client_org = models.ForeignKey(
        'tenants.ClientOrganization', on_delete=models.CASCADE, related_name='known_senders'
    )
    email      = models.EmailField()
    name       = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table        = 'known_senders'
        unique_together = [['tenant', 'email']]

    def __str__(self):
        return f'{self.email} → {self.client_org.name} [{self.tenant.slug}]'


class ProcessedEmail(models.Model):
    """Deduplication log for every email pulled from IMAP."""
    tenant     = models.ForeignKey(
        'tenants.Tenant', on_delete=models.CASCADE, related_name='processed_emails'
    )
    message_id = models.CharField(max_length=998)   # RFC 5322 max
    ticket     = models.ForeignKey(
        'tickets.Ticket', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='source_emails'
    )
    reply      = models.ForeignKey(
        'tickets.Reply', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='source_emails'
    )
    from_email   = models.EmailField()
    from_name    = models.CharField(max_length=500, blank=True)
    subject      = models.CharField(max_length=998, blank=True)
    cc_emails    = models.JSONField(default=list, blank=True)
    processed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table        = 'processed_emails'
        unique_together = [['tenant', 'message_id']]

    def __str__(self):
        return f'{self.from_email} → {self.ticket}'

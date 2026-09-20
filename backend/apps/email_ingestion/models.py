from django.db import models

from .crypto import decrypt_email_credential, encrypt_email_credential

AUTH_METHOD_BASIC    = 'basic'
AUTH_METHOD_OAUTH2   = 'oauth2'
AUTH_METHOD_MATEMAIL = 'matemail'
AUTH_METHOD_CHOICES = [
    (AUTH_METHOD_BASIC,    'Basic Auth (App Password)'),
    (AUTH_METHOD_OAUTH2,   'OAuth2 / Modern Auth'),
    (AUTH_METHOD_MATEMAIL, 'MateMail Connected App'),
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

    # MateMail Connected App. The one-time Integration Secret is NEVER stored.
    # Only the revocable operational access token is encrypted here.
    matemail_tenant_id    = models.CharField(max_length=64, blank=True)
    matemail_mailbox_id   = models.CharField(max_length=64, blank=True)
    matemail_mailbox_email = models.EmailField(blank=True)
    matemail_mailbox_name = models.CharField(max_length=255, blank=True)
    matemail_permissions  = models.JSONField(default=list, blank=True)
    matemail_access_token = models.CharField(max_length=1024, blank=True)
    matemail_connected_at = models.DateTimeField(null=True, blank=True)

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

    def get_matemail_access_token(self) -> str:
        return decrypt_email_credential(self.matemail_access_token)

    def save(self, *args, **kwargs):
        update_fields = kwargs.get('update_fields')
        for field in (
            'imap_password',
            'smtp_password',
            'oauth_client_secret',
            'matemail_access_token',
        ):
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

    # Reply-To handling. The header is attacker-controlled, so it is only acted
    # on when the address is already a Known Sender or an active user; see
    # services._trusted_reply_to. Both the accepted address and the raw header
    # are kept so a ticket can always show who actually sent it versus who the
    # sender claimed to be replying for.
    reply_to_email = models.EmailField(blank=True)          # accepted, drives replies
    reply_to_raw   = models.CharField(max_length=998, blank=True)  # as received

    processed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table        = 'processed_emails'
        unique_together = [['tenant', 'message_id']]

    def __str__(self):
        return f'{self.from_email} → {self.ticket}'

from rest_framework import serializers
from .models import TenantEmailSettings, KnownSender


class KnownSenderSerializer(serializers.ModelSerializer):
    org_name = serializers.CharField(source='client_org.name', read_only=True)
    org_id   = serializers.CharField(source='client_org.id',   read_only=True)

    class Meta:
        model  = KnownSender
        fields = ['id', 'email', 'name', 'org_id', 'org_name', 'created_at']


class EmailSettingsSerializer(serializers.ModelSerializer):
    imap_password_set        = serializers.SerializerMethodField()
    smtp_password_set        = serializers.SerializerMethodField()
    oauth_client_secret_set  = serializers.SerializerMethodField()
    matemail_connected        = serializers.SerializerMethodField()

    def get_imap_password_set(self, obj):
        return bool(obj.imap_password)

    def get_smtp_password_set(self, obj):
        return bool(obj.smtp_password)

    def get_oauth_client_secret_set(self, obj):
        return bool(obj.oauth_client_secret)

    def get_matemail_connected(self, obj):
        return bool(obj.matemail_access_token and obj.matemail_mailbox_email)

    class Meta:
        model  = TenantEmailSettings
        fields = [
            # Auth method
            'auth_method',
            # IMAP
            'imap_host', 'imap_port', 'imap_username',
            'imap_password', 'imap_password_set',
            'imap_use_ssl', 'imap_folder', 'imap_enabled',
            # SMTP
            'smtp_host', 'smtp_port', 'smtp_username',
            'smtp_password', 'smtp_password_set',
            'smtp_use_tls', 'smtp_from_name', 'smtp_from_email', 'smtp_enabled',
            # OAuth2
            'oauth_provider', 'oauth_client_id',
            'oauth_client_secret', 'oauth_client_secret_set',
            'oauth_tenant_id',
            # MateMail connected app
            'matemail_connected', 'matemail_tenant_id',
            'matemail_mailbox_id', 'matemail_mailbox_email',
            'matemail_mailbox_name', 'matemail_permissions',
            'matemail_connected_at',
            # Status (read-only)
            'last_polled_at', 'emails_processed', 'last_error',
        ]
        extra_kwargs = {
            'imap_password':           {'write_only': True, 'required': False, 'allow_blank': True},
            'smtp_password':           {'write_only': True, 'required': False, 'allow_blank': True},
            'oauth_client_secret':     {'write_only': True, 'required': False, 'allow_blank': True},
            'last_polled_at':          {'read_only': True},
            'emails_processed':        {'read_only': True},
            'last_error':              {'read_only': True},
            'imap_password_set':       {'read_only': True},
            'smtp_password_set':       {'read_only': True},
            'oauth_client_secret_set': {'read_only': True},
            'matemail_connected':       {'read_only': True},
            'matemail_tenant_id':       {'read_only': True},
            'matemail_mailbox_id':      {'read_only': True},
            'matemail_mailbox_email':   {'read_only': True},
            'matemail_mailbox_name':    {'read_only': True},
            'matemail_permissions':     {'read_only': True},
            'matemail_connected_at':    {'read_only': True},
        }

from django.contrib import admin
from .models import TenantEmailSettings, ProcessedEmail


@admin.register(TenantEmailSettings)
class EmailSettingsAdmin(admin.ModelAdmin):
    list_display    = ['tenant', 'imap_host', 'imap_enabled', 'smtp_host', 'smtp_enabled',
                       'last_polled_at', 'emails_processed']
    list_filter     = ['imap_enabled', 'smtp_enabled']
    search_fields   = ['tenant__name', 'tenant__slug', 'imap_host', 'smtp_host']
    readonly_fields = ['last_polled_at', 'emails_processed', 'last_error', 'updated_at']


@admin.register(ProcessedEmail)
class ProcessedEmailAdmin(admin.ModelAdmin):
    list_display    = ['from_email', 'from_name', 'tenant', 'ticket', 'processed_at']
    list_filter     = ['tenant']
    search_fields   = ['from_email', 'from_name', 'message_id']
    readonly_fields = ['processed_at']

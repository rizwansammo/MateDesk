from datetime import timedelta

from django.utils import timezone

try:
    from celery import shared_task
except ImportError:
    def shared_task(fn):
        return fn


@shared_task(name='apps.email_ingestion.tasks.poll_all_tenant_mailboxes')
def poll_all_tenant_mailboxes():
    """
    Runs every 30 s via Celery Beat.
    Skips tenants whose last_polled_at is more recent than the configured interval.
    """
    from apps.platform_admin.models import PlatformSettings
    from apps.email_ingestion.models import TenantEmailSettings
    from apps.email_ingestion.services import poll_tenant_mailbox

    interval_seconds = PlatformSettings.load().email_poll_interval
    cutoff = timezone.now() - timedelta(seconds=interval_seconds)

    due = TenantEmailSettings.objects.filter(
        imap_enabled=True,
    ).exclude(
        last_polled_at__gt=cutoff,
    ).select_related('tenant')

    for email_settings in due:
        try:
            poll_tenant_mailbox(email_settings.tenant)
        except Exception:
            pass

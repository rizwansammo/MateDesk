import logging
import signal
import time

from django.core.management.base import BaseCommand

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = (
        'Email polling daemon. Runs continuously — meant to be managed by pm2 or systemd. '
        'Polls all tenants with IMAP enabled on each interval.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--interval', type=int, default=300,
            help='Seconds between poll cycles (default: 300 = 5 minutes)',
        )

    def handle(self, *args, **options):
        interval = options['interval']
        self.stdout.write(
            self.style.SUCCESS(f'Email scheduler started — polling every {interval}s')
        )

        # Graceful shutdown on SIGTERM / SIGINT
        self._running = True
        def _stop(signum, frame):
            self._running = False
        signal.signal(signal.SIGTERM, _stop)
        signal.signal(signal.SIGINT,  _stop)

        while self._running:
            self._run_cycle()
            # Sleep in short increments so SIGTERM is handled promptly
            for _ in range(interval):
                if not self._running:
                    break
                time.sleep(1)

        self.stdout.write('Email scheduler stopped.')

    def _run_cycle(self):
        try:
            from apps.tenants.models import Tenant
            from apps.email_ingestion.services import poll_tenant_mailbox

            tenants = list(
                Tenant.objects.filter(
                    is_active=True,
                    email_settings__imap_enabled=True,
                )
            )
            if not tenants:
                return

            for tenant in tenants:
                try:
                    count = poll_tenant_mailbox(tenant)
                    if count:
                        self.stdout.write(f'  [{tenant.slug}] {count} email(s) ingested')
                except Exception as exc:
                    logger.error('Poll error for tenant %s: %s', tenant.slug, exc)

        except Exception as exc:
            logger.error('Scheduler cycle error: %s', exc)

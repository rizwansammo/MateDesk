from django.core.management.base import BaseCommand, CommandError
from apps.tenants.models import Tenant
from apps.email_ingestion.services import poll_tenant_mailbox


class Command(BaseCommand):
    help = 'Poll IMAP mailboxes and convert new emails into tickets/replies'

    def add_arguments(self, parser):
        parser.add_argument(
            '--tenant', type=str, metavar='SLUG',
            help='Poll only this tenant slug (default: all active tenants with IMAP enabled)',
        )

    def handle(self, *args, **options):
        slug = options.get('tenant')

        if slug:
            try:
                tenants = [Tenant.objects.get(slug=slug, is_active=True)]
            except Tenant.DoesNotExist:
                raise CommandError(f'Tenant "{slug}" not found or inactive.')
        else:
            # Only poll tenants that have IMAP enabled to avoid pointless connections
            tenants = list(
                Tenant.objects.filter(
                    is_active=True,
                    email_settings__imap_enabled=True,
                )
            )

        if not tenants:
            self.stdout.write('No tenants with IMAP enabled.')
            return

        total = 0
        for tenant in tenants:
            count = poll_tenant_mailbox(tenant)
            status = self.style.SUCCESS(f'{count} email(s)') if count else f'{count} email(s)'
            self.stdout.write(f'  {tenant.slug}: {status}')
            total += count

        self.stdout.write(self.style.SUCCESS(f'Done — {total} email(s) processed across {len(tenants)} tenant(s).'))

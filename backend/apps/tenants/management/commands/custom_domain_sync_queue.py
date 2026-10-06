from django.conf import settings
from django.core.management.base import BaseCommand

from apps.tenants.models import TenantDomain


class Command(BaseCommand):
    help = 'Emit custom-domain lifecycle work for the MateServer host provisioner.'

    def handle(self, *args, **options):
        if not getattr(settings, 'CUSTOM_DOMAINS_ENABLED', False):
            return

        qs = (
            TenantDomain.objects
            .filter(status__in=['verified', 'provisioning', 'disabled'])
            .order_by('created_at')
        )
        for mapping in qs:
            if mapping.status == 'disabled' and mapping.deprovisioned_at:
                continue
            self.stdout.write(f'{mapping.status}\t{mapping.domain}')

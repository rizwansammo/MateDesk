from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.tenants.models import TenantDomain


class Command(BaseCommand):
    help = 'Update a custom-domain lifecycle state from the trusted host provisioner.'

    def add_arguments(self, parser):
        parser.add_argument('domain')
        parser.add_argument(
            'state',
            choices=['provisioning', 'active', 'failed', 'deprovisioned'],
        )
        parser.add_argument('--error', default='')

    def handle(self, *args, **options):
        domain = options['domain'].strip().lower().rstrip('.')
        try:
            mapping = TenantDomain.objects.get(domain=domain)
        except TenantDomain.DoesNotExist as exc:
            raise CommandError('Custom domain not found.') from exc

        state = options['state']
        now = timezone.now()

        if state == 'provisioning':
            if mapping.status not in {'verified', 'provisioning'}:
                raise CommandError(f'Cannot provision a domain in {mapping.status} state.')
            mapping.status = 'provisioning'
            mapping.last_error = ''
            fields = ['status', 'last_error', 'updated_at']

        elif state == 'active':
            if mapping.status not in {'verified', 'provisioning'}:
                raise CommandError(f'Cannot activate a domain in {mapping.status} state.')
            mapping.status = 'active'
            mapping.ssl_issued_at = mapping.ssl_issued_at or now
            mapping.deprovisioned_at = None
            mapping.last_error = ''
            fields = ['status', 'ssl_issued_at', 'deprovisioned_at', 'last_error', 'updated_at']

        elif state == 'failed':
            if mapping.status not in {'verified', 'provisioning'}:
                raise CommandError(f'Cannot fail a domain in {mapping.status} state.')
            mapping.status = 'failed'
            mapping.last_error = (options['error'] or 'Host provisioning failed.')[:1000]
            fields = ['status', 'last_error', 'updated_at']

        else:
            if mapping.status != 'disabled':
                raise CommandError('Only disabled domains can be marked deprovisioned.')
            mapping.deprovisioned_at = now
            mapping.last_error = ''
            fields = ['deprovisioned_at', 'last_error', 'updated_at']

        mapping.save(update_fields=fields)
        self.stdout.write(f'{mapping.domain}\t{mapping.status}')

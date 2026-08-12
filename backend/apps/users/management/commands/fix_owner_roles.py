from django.core.management.base import BaseCommand
from apps.tenants.models import Tenant
from apps.users.models import User
from apps.users.permissions import ROLE_MSP_OWNER


class Command(BaseCommand):
    help = 'Sets the oldest user in each tenant to msp_owner if they have no MSP role.'

    def handle(self, *args, **options):
        fixed = 0
        for tenant in Tenant.objects.all():
            owner = User.objects.filter(tenant=tenant).order_by('date_joined').first()
            if owner and owner.role not in ('msp_owner', 'msp_manager', 'msp_agent'):
                old_role = owner.role
                owner.role = ROLE_MSP_OWNER
                owner.save(update_fields=['role'])
                self.stdout.write(
                    f'  {tenant.slug}: {owner.email}  {old_role} → msp_owner'
                )
                fixed += 1
        self.stdout.write(self.style.SUCCESS(f'Done. Fixed {fixed} user(s).'))

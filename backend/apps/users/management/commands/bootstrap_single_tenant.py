import os

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.email_ingestion.models import TenantEmailSettings
from apps.tenants.models import ClientOrganization, Tenant
from apps.users.models import User
from apps.users.permissions import ROLE_MSP_OWNER


class Command(BaseCommand):
    help = 'Bootstrap the configured dedicated single-tenant workspace and its first owner.'

    def add_arguments(self, parser):
        parser.add_argument('--name', default='', help='Tenant display name.')
        parser.add_argument('--owner-email', required=True, help='Initial owner email.')
        parser.add_argument('--owner-name', default='', help='Initial owner full name.')

    @transaction.atomic
    def handle(self, *args, **options):
        if getattr(settings, 'DEPLOYMENT_MODE', 'multi_tenant') != 'single_tenant':
            raise CommandError('bootstrap_single_tenant is only valid in single_tenant mode.')

        slug = getattr(settings, 'SINGLE_TENANT_SLUG', '').strip().lower()
        if not slug:
            raise CommandError('SINGLE_TENANT_SLUG is not configured.')

        display_name = options['name'].strip() or slug.replace('-', ' ').title()
        email = options['owner_email'].strip().lower()
        owner_name = options['owner_name'].strip()
        if not email:
            raise CommandError('--owner-email cannot be empty.')

        tenant, tenant_created = Tenant.objects.get_or_create(
            slug=slug,
            defaults={
                'name': display_name,
                'plan': 'enterprise',
                'status': 'active',
                'billing_status': 'paid',
                'is_active': True,
            },
        )

        changed_fields = []
        if not tenant.is_active:
            tenant.is_active = True
            changed_fields.append('is_active')
        if tenant_created is False and options['name'].strip() and tenant.name != display_name:
            tenant.name = display_name
            changed_fields.append('name')
        if changed_fields:
            tenant.save(update_fields=changed_fields)

        ClientOrganization.objects.get_or_create(
            tenant=tenant,
            name='Walk-In',
            defaults={'is_active': True},
        )
        TenantEmailSettings.objects.get_or_create(tenant=tenant)

        owner = User.objects.filter(tenant=tenant, email=email).first()
        owner_created = owner is None

        if owner_created:
            password = os.environ.get('BOOTSTRAP_OWNER_PASSWORD', '')
            if len(password) < 12:
                raise CommandError(
                    'BOOTSTRAP_OWNER_PASSWORD must be set and at least 12 characters '
                    'when creating the initial owner.'
                )
            parts = owner_name.split(' ', 1) if owner_name else ['', '']
            owner = User.objects.create_user(
                tenant=tenant,
                email=email,
                password=password,
                first_name=parts[0],
                last_name=parts[1] if len(parts) > 1 else '',
                role=ROLE_MSP_OWNER,
                is_active=True,
            )
        else:
            update_fields = []
            if owner.role != ROLE_MSP_OWNER:
                owner.role = ROLE_MSP_OWNER
                update_fields.append('role')
            if not owner.is_active:
                owner.is_active = True
                update_fields.append('is_active')
            if update_fields:
                owner.save(update_fields=update_fields)

        action = 'created' if tenant_created else 'ready'
        owner_action = 'created' if owner_created else 'ready'
        self.stdout.write(self.style.SUCCESS(
            f"Single-tenant workspace '{tenant.slug}' {action}; owner {owner.email} {owner_action}."
        ))

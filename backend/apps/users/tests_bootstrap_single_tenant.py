import os
from io import StringIO
from unittest.mock import patch

from django.core.management import CommandError, call_command
from django.test import TestCase, override_settings

from apps.email_ingestion.models import TenantEmailSettings
from apps.tenants.models import ClientOrganization, Tenant
from apps.users.models import User


class BootstrapSingleTenantTests(TestCase):
    @override_settings(
        DEPLOYMENT_MODE='multi_tenant',
        SINGLE_TENANT_SLUG='netamate',
    )
    def test_refuses_to_run_in_multi_tenant_mode(self):
        with self.assertRaises(CommandError):
            call_command(
                'bootstrap_single_tenant',
                owner_email='owner@example.com',
                stdout=StringIO(),
            )

    @override_settings(
        DEPLOYMENT_MODE='single_tenant',
        SINGLE_TENANT_SLUG='netamate',
    )
    @patch.dict(os.environ, {'BOOTSTRAP_OWNER_PASSWORD': 'StrongPassword-123!'})
    def test_creates_workspace_owner_and_defaults(self):
        call_command(
            'bootstrap_single_tenant',
            name='NetaMate Solutions',
            owner_email='owner@netamate.com',
            owner_name='Primary Owner',
            stdout=StringIO(),
        )

        tenant = Tenant.objects.get(slug='netamate')
        self.assertEqual(tenant.name, 'NetaMate Solutions')
        self.assertEqual(tenant.status, 'active')
        self.assertEqual(tenant.billing_status, 'paid')
        self.assertEqual(tenant.plan, 'enterprise')

        owner = User.objects.get(tenant=tenant, email='owner@netamate.com')
        self.assertEqual(owner.role, 'msp_owner')
        self.assertTrue(owner.check_password('StrongPassword-123!'))
        self.assertTrue(
            ClientOrganization.objects.filter(tenant=tenant, name='Walk-In').exists()
        )
        self.assertTrue(TenantEmailSettings.objects.filter(tenant=tenant).exists())

    @override_settings(
        DEPLOYMENT_MODE='single_tenant',
        SINGLE_TENANT_SLUG='netamate',
    )
    @patch.dict(os.environ, {'BOOTSTRAP_OWNER_PASSWORD': 'StrongPassword-123!'})
    def test_is_idempotent(self):
        kwargs = {
            'name': 'NetaMate Solutions',
            'owner_email': 'owner@netamate.com',
            'owner_name': 'Primary Owner',
            'stdout': StringIO(),
        }
        call_command('bootstrap_single_tenant', **kwargs)
        call_command('bootstrap_single_tenant', **kwargs)

        tenant = Tenant.objects.get(slug='netamate')
        self.assertEqual(Tenant.objects.filter(slug='netamate').count(), 1)
        self.assertEqual(User.objects.filter(tenant=tenant).count(), 1)
        self.assertEqual(
            ClientOrganization.objects.filter(tenant=tenant, name='Walk-In').count(),
            1,
        )
        self.assertEqual(TenantEmailSettings.objects.filter(tenant=tenant).count(), 1)

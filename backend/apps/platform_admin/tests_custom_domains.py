from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
from django.http import HttpResponse
from django.test import Client, TestCase, override_settings
from django.urls import reverse

from apps.platform_admin.auth_utils import SESSION_KEY
from apps.tenants.models import Tenant, TenantDomain
from apps.users.models import User


class PlatformAdminCustomDomainTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.admin = User.objects.create_user(
            tenant=None,
            email='platform@example.com',
            password='StrongPassword-123!',
            first_name='Platform',
            role='msp_owner',
            is_staff=True,
            is_active=True,
        )
        session = self.client.session
        session[SESSION_KEY] = str(self.admin.pk)
        session.save()

        self.tenant = Tenant.objects.create(
            name='Example MSP',
            slug='example',
            is_active=True,
            status='active',
        )

    @patch('apps.platform_admin.views.render')
    def test_platform_admin_cannot_create_reserved_domains_tenant(self, render):
        render.return_value = HttpResponse('validation error', status=200)
        response = self.client.post(
            reverse('platform_admin:tenant_create'),
            {
                'name': 'Reserved Infrastructure',
                'slug': 'domains',
                'owner_name': 'Reserved Owner',
                'owner_email': 'reserved-owner@example.com',
                'plan': 'starter',
                'status': 'active',
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(Tenant.objects.filter(slug='domains').exists())
        self.assertIn('reserved by the platform', str(render.call_args.args[2]['errors']))

    def test_add_domain_creates_pending_mapping(self):
        response = self.client.post(
            reverse('platform_admin:tenant_domain_add', args=[self.tenant.pk]),
            {'domain': 'HelpDesk.Example.COM.'},
        )
        self.assertEqual(response.status_code, 302)

        mapping = TenantDomain.objects.get(tenant=self.tenant)
        self.assertEqual(mapping.domain, 'helpdesk.example.com')
        self.assertEqual(mapping.status, 'pending')

    def test_domain_cannot_be_attached_to_two_tenants(self):
        other = Tenant.objects.create(
            name='Other MSP',
            slug='other',
            is_active=True,
        )
        TenantDomain.objects.create(
            tenant=other,
            domain='helpdesk.example.com',
        )

        response = self.client.post(
            reverse('platform_admin:tenant_domain_add', args=[self.tenant.pk]),
            {'domain': 'helpdesk.example.com'},
        )
        self.assertEqual(response.status_code, 302)
        self.assertEqual(
            TenantDomain.objects.filter(domain='helpdesk.example.com').count(),
            1,
        )

    @patch('apps.platform_admin.views.verify_domain_ownership', return_value=True)
    def test_verify_queues_ssl_provisioning(self, verify):
        mapping = TenantDomain.objects.create(
            tenant=self.tenant,
            domain='helpdesk.example.com',
        )

        response = self.client.post(
            reverse(
                'platform_admin:tenant_domain_verify',
                args=[self.tenant.pk, mapping.pk],
            )
        )
        self.assertEqual(response.status_code, 302)
        verify.assert_called_once_with(mapping.domain, mapping.verification_token)

        mapping.refresh_from_db()
        self.assertEqual(mapping.status, 'verified')
        self.assertIsNotNone(mapping.verified_at)

    def test_primary_domain_requires_active_mapping(self):
        mapping = TenantDomain.objects.create(
            tenant=self.tenant,
            domain='helpdesk.example.com',
            status='active',
        )
        response = self.client.post(
            reverse(
                'platform_admin:tenant_domain_set_primary',
                args=[self.tenant.pk, mapping.pk],
            )
        )
        self.assertEqual(response.status_code, 302)
        mapping.refresh_from_db()
        self.assertTrue(mapping.is_primary)

    def test_disable_retains_record_for_host_deprovision(self):
        mapping = TenantDomain.objects.create(
            tenant=self.tenant,
            domain='helpdesk.example.com',
            status='active',
            is_primary=True,
        )

        response = self.client.post(
            reverse(
                'platform_admin:tenant_domain_disable',
                args=[self.tenant.pk, mapping.pk],
            )
        )
        self.assertEqual(response.status_code, 302)

        mapping.refresh_from_db()
        self.assertEqual(mapping.status, 'disabled')
        self.assertFalse(mapping.is_primary)
        self.assertIsNone(mapping.deprovisioned_at)

    def test_reenable_rotates_ownership_token(self):
        mapping = TenantDomain.objects.create(
            tenant=self.tenant,
            domain='helpdesk.example.com',
            status='disabled',
        )
        old_token = mapping.verification_token

        response = self.client.post(
            reverse(
                'platform_admin:tenant_domain_reenable',
                args=[self.tenant.pk, mapping.pk],
            )
        )
        self.assertEqual(response.status_code, 302)

        mapping.refresh_from_db()
        self.assertEqual(mapping.status, 'pending')
        self.assertNotEqual(mapping.verification_token, old_token)
        self.assertIsNone(mapping.verified_at)

    def test_pending_domain_can_be_removed(self):
        mapping = TenantDomain.objects.create(
            tenant=self.tenant,
            domain='helpdesk.example.com',
            status='pending',
        )
        response = self.client.post(
            reverse(
                'platform_admin:tenant_domain_remove',
                args=[self.tenant.pk, mapping.pk],
            )
        )
        self.assertEqual(response.status_code, 302)
        self.assertFalse(TenantDomain.objects.filter(pk=mapping.pk).exists())

    def test_tenant_delete_is_blocked_while_custom_domain_is_active(self):
        TenantDomain.objects.create(
            tenant=self.tenant,
            domain='helpdesk.example.com',
            status='active',
        )
        response = self.client.post(
            reverse('platform_admin:tenant_delete', args=[self.tenant.pk]),
            {'confirm_password': 'StrongPassword-123!'},
        )
        self.assertEqual(response.status_code, 302)
        self.assertTrue(Tenant.objects.filter(pk=self.tenant.pk).exists())

    def test_scheduled_delete_is_blocked_until_domain_deprovisioned(self):
        TenantDomain.objects.create(
            tenant=self.tenant,
            domain='helpdesk.example.com',
            status='disabled',
            deprovisioned_at=None,
        )
        response = self.client.post(
            reverse('platform_admin:tenant_schedule_delete', args=[self.tenant.pk]),
            {'confirm_password': 'StrongPassword-123!'},
        )
        self.assertEqual(response.status_code, 302)
        self.tenant.refresh_from_db()
        self.assertIsNone(self.tenant.deletion_scheduled_at)

    def test_previously_provisioned_domain_is_not_hard_deleted(self):
        from django.utils import timezone

        mapping = TenantDomain.objects.create(
            tenant=self.tenant,
            domain='helpdesk.example.com',
            status='disabled',
            ssl_issued_at=timezone.now(),
            deprovisioned_at=timezone.now(),
        )
        response = self.client.post(
            reverse(
                'platform_admin:tenant_domain_remove',
                args=[self.tenant.pk, mapping.pk],
            )
        )
        self.assertEqual(response.status_code, 302)
        self.assertTrue(TenantDomain.objects.filter(pk=mapping.pk).exists())


@override_settings(CUSTOM_DOMAINS_ENABLED=True)
class CustomDomainProvisionerCommandTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(
            name='Example MSP',
            slug='example',
            is_active=True,
        )
        self.mapping = TenantDomain.objects.create(
            tenant=self.tenant,
            domain='helpdesk.example.com',
            status='verified',
        )

    def test_queue_emits_verified_domain(self):
        out = StringIO()
        call_command('custom_domain_sync_queue', stdout=out)
        self.assertIn('verified\thelpdesk.example.com', out.getvalue())

    def test_trusted_state_transitions(self):
        call_command(
            'custom_domain_set_state',
            self.mapping.domain,
            'provisioning',
            stdout=StringIO(),
        )
        self.mapping.refresh_from_db()
        self.assertEqual(self.mapping.status, 'provisioning')

        call_command(
            'custom_domain_set_state',
            self.mapping.domain,
            'active',
            stdout=StringIO(),
        )
        self.mapping.refresh_from_db()
        self.assertEqual(self.mapping.status, 'active')
        self.assertIsNotNone(self.mapping.ssl_issued_at)

    def test_disabled_domain_is_marked_deprovisioned(self):
        self.mapping.status = 'disabled'
        self.mapping.save(update_fields=['status', 'updated_at'])

        call_command(
            'custom_domain_set_state',
            self.mapping.domain,
            'deprovisioned',
            stdout=StringIO(),
        )
        self.mapping.refresh_from_db()
        self.assertEqual(self.mapping.status, 'disabled')
        self.assertIsNotNone(self.mapping.deprovisioned_at)

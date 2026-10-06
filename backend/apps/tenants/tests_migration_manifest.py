import json
from io import StringIO

from django.core.management import call_command
from django.test import TestCase

from apps.email_ingestion.models import TenantEmailSettings
from apps.tenants.models import ClientOrganization, Tenant
from apps.tickets.models import Reply, Ticket
from apps.users.models import User


class TenantMigrationManifestTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(
            name='Example MSP',
            slug='example',
            is_active=True,
            status='active',
        )
        self.org = ClientOrganization.objects.create(
            tenant=self.tenant,
            name='Example Client',
            domain='client.example.com',
            contact_email='contact@client.example.com',
        )
        self.owner = User.objects.create_user(
            tenant=self.tenant,
            email='owner@example.com',
            password='StrongPassword-123!',
            first_name='Owner',
            role='msp_owner',
            is_active=True,
        )
        self.requester = User.objects.create_user(
            tenant=self.tenant,
            client_org=self.org,
            email='requester@client.example.com',
            password='StrongPassword-456!',
            first_name='Requester',
            role='end_user',
            is_active=True,
        )
        self.ticket = Ticket.objects.create(
            tenant=self.tenant,
            ticket_ref='T01012026-0001',
            seq=1,
            subject='Private test subject',
            description='Private body',
            requester=self.requester,
            assignee=self.owner,
            client_org=self.org,
        )
        Reply.objects.create(
            ticket=self.ticket,
            author=self.owner,
            body='Private reply body',
        )
        TenantEmailSettings.objects.create(
            tenant=self.tenant,
            auth_method='basic',
            imap_username='support@example.com',
            imap_enabled=True,
            smtp_from_email='support@example.com',
            smtp_enabled=True,
        )

    def test_manifest_is_machine_readable_and_pii_minimized(self):
        out = StringIO()
        call_command(
            'tenant_migration_manifest',
            tenant=self.tenant.slug,
            stdout=out,
        )
        raw = out.getvalue()
        data = json.loads(raw)

        self.assertEqual(data['format'], 'matedesk-tenant-migration-manifest-v1')
        self.assertEqual(data['tenant']['slug'], 'example')
        self.assertEqual(data['counts']['users'], 2)
        self.assertEqual(data['counts']['organizations'], 1)
        self.assertEqual(data['counts']['tickets'], 1)
        self.assertEqual(data['counts']['replies'], 1)
        self.assertEqual(data['email_settings']['auth_method'], 'basic')

        # Raw identity/content must never leak into the manifest.
        for secret_text in (
            'owner@example.com',
            'requester@client.example.com',
            'support@example.com',
            'Example Client',
            'Private test subject',
            'Private body',
            'Private reply body',
        ):
            self.assertNotIn(secret_text, raw)

        # Stable collision keys are present instead.
        self.assertTrue(data['users'][0]['email_h'])
        self.assertTrue(data['organizations'][0]['match_h'])
        self.assertTrue(data['tickets'][0]['subject_h'])
        self.assertTrue(data['replies'][0]['body_h'])

    def test_domain_backed_org_uses_stable_match_key(self):
        out = StringIO()
        call_command(
            'tenant_migration_manifest',
            tenant=self.tenant.slug,
            stdout=out,
        )
        data = json.loads(out.getvalue())
        org = data['organizations'][0]
        self.assertTrue(org['has_domain'])
        self.assertTrue(org['domain_h'])
        self.assertTrue(org['match_h'])

    def test_blank_domain_org_is_still_matchable_by_name(self):
        ClientOrganization.objects.create(
            tenant=self.tenant,
            name='No Domain Client',
            domain='',
        )
        out = StringIO()
        call_command(
            'tenant_migration_manifest',
            tenant=self.tenant.slug,
            stdout=out,
        )
        data = json.loads(out.getvalue())
        blank = next(x for x in data['organizations'] if not x['has_domain'])
        self.assertEqual(blank['domain_h'], '')
        self.assertTrue(blank['match_h'])

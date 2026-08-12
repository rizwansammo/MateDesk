"""
Regression tests for tenant isolation and RBAC in the tickets app.

Run:  python manage.py test apps.tickets.tests_rbac --verbosity=2
"""
from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.tenants.models import Tenant, ClientOrganization

User = get_user_model()


def _make_tenant(slug='test-tenant'):
    return Tenant.objects.create(
        name='Test MSP',
        slug=slug,
        is_active=True,
    )


def _make_user(tenant, role, email, org=None):
    u = User.objects.create_user(
        email=email,
        password='testpass123',
        first_name='Test',
        last_name=role,
        role=role,
        tenant=tenant,
    )
    if org:
        u.client_org = org
        u.save()
    return u


def _auth_client(user):
    token = AccessToken.for_user(user)
    token['tenant_id'] = str(user.tenant_id)
    c = APIClient()
    c.credentials(HTTP_AUTHORIZATION=f'Bearer {str(token)}')
    c.defaults['SERVER_NAME'] = 'localhost'
    return c


@override_settings(DEBUG=True)
class ClientOrgIsolationTest(TestCase):
    """A: Client user cannot see all organisations."""

    def setUp(self):
        self.tenant = _make_tenant()
        self.org_a = ClientOrganization.objects.create(
            tenant=self.tenant, name='Org A', is_active=True,
        )
        self.org_b = ClientOrganization.objects.create(
            tenant=self.tenant, name='Org B', is_active=True,
        )
        self.msp_agent = _make_user(self.tenant, 'msp_agent', 'agent@t.com')
        self.client_owner = _make_user(self.tenant, 'client_owner', 'co@t.com', org=self.org_a)
        self.end_user = _make_user(self.tenant, 'end_user', 'eu@t.com')

    def test_msp_sees_all_orgs(self):
        c = _auth_client(self.msp_agent)
        r = c.get('/api/client-orgs/')
        self.assertEqual(r.status_code, 200)
        ids = {o['id'] for o in r.data}
        self.assertIn(str(self.org_a.id), ids)
        self.assertIn(str(self.org_b.id), ids)

    def test_client_owner_sees_only_own_org(self):
        c = _auth_client(self.client_owner)
        r = c.get('/api/client-orgs/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data), 1)
        self.assertEqual(r.data[0]['id'], str(self.org_a.id))

    def test_end_user_without_org_sees_empty(self):
        c = _auth_client(self.end_user)
        r = c.get('/api/client-orgs/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data, [])


@override_settings(DEBUG=True)
class UserDetailRBACTest(TestCase):
    """B: Client user cannot patch another user.
       C: Client user cannot change role/client_org/is_active."""

    def setUp(self):
        self.tenant = _make_tenant(slug='rbac-tenant')
        self.org = ClientOrganization.objects.create(
            tenant=self.tenant, name='Org', is_active=True,
        )
        self.client_owner = _make_user(self.tenant, 'client_owner', 'co@r.com', org=self.org)
        self.other_user = _make_user(self.tenant, 'end_user', 'eu@r.com', org=self.org)
        self.msp_agent = _make_user(self.tenant, 'msp_agent', 'agent@r.com')

    def test_client_cannot_patch_other_user(self):
        c = _auth_client(self.client_owner)
        r = c.patch(f'/api/users/{self.other_user.pk}/', {'first_name': 'Hacked'}, format='json')
        self.assertEqual(r.status_code, 403)

    def test_client_cannot_change_own_role(self):
        c = _auth_client(self.client_owner)
        r = c.patch(f'/api/users/{self.client_owner.pk}/', {'role': 'msp_owner'}, format='json')
        self.assertEqual(r.status_code, 403)

    def test_client_cannot_change_is_active(self):
        c = _auth_client(self.client_owner)
        r = c.patch(f'/api/users/{self.client_owner.pk}/', {'is_active': False}, format='json')
        self.assertEqual(r.status_code, 403)

    def test_client_cannot_change_client_org(self):
        c = _auth_client(self.client_owner)
        r = c.patch(f'/api/users/{self.client_owner.pk}/', {'client_org_id': None}, format='json')
        self.assertEqual(r.status_code, 403)

    def test_client_cannot_view_other_user(self):
        c = _auth_client(self.client_owner)
        r = c.get(f'/api/users/{self.other_user.pk}/')
        self.assertEqual(r.status_code, 403)

    def test_client_can_view_self(self):
        c = _auth_client(self.client_owner)
        r = c.get(f'/api/users/{self.client_owner.pk}/')
        self.assertEqual(r.status_code, 200)

    def test_client_can_patch_own_safe_fields(self):
        c = _auth_client(self.client_owner)
        r = c.patch(f'/api/users/{self.client_owner.pk}/', {'phone': '555-1234'}, format='json')
        self.assertEqual(r.status_code, 200)
        self.client_owner.refresh_from_db()
        self.assertEqual(self.client_owner.phone, '555-1234')

    def test_msp_can_patch_any_user(self):
        c = _auth_client(self.msp_agent)
        r = c.patch(f'/api/users/{self.other_user.pk}/', {'first_name': 'Updated'}, format='json')
        self.assertEqual(r.status_code, 200)


@override_settings(DEBUG=True)
class InternalNoteRBACTest(TestCase):
    """D: Client user cannot create internal_note."""

    def setUp(self):
        from apps.tickets.models import Ticket
        self.tenant = _make_tenant(slug='note-tenant')
        self.org = ClientOrganization.objects.create(
            tenant=self.tenant, name='Org', is_active=True,
        )
        self.msp_agent = _make_user(self.tenant, 'msp_agent', 'agent@n.com')
        self.client_user = _make_user(self.tenant, 'end_user', 'eu@n.com', org=self.org)
        self.ticket = Ticket.objects.create(
            tenant=self.tenant,
            ticket_ref='T01012025-0001',
            seq=1,
            subject='Test ticket',
            requester=self.client_user,
            status='open',
            priority='normal',
        )

    def test_client_cannot_create_internal_note(self):
        c = _auth_client(self.client_user)
        r = c.post(
            f'/api/tickets/{self.ticket.ticket_ref}/replies/',
            {'type': 'internal_note', 'body': 'secret note'},
            format='json',
        )
        self.assertEqual(r.status_code, 403)

    def test_client_can_create_public_reply(self):
        c = _auth_client(self.client_user)
        r = c.post(
            f'/api/tickets/{self.ticket.ticket_ref}/replies/',
            {'type': 'public_reply', 'body': 'Hello'},
            format='json',
        )
        self.assertEqual(r.status_code, 201)

    def test_msp_can_create_internal_note(self):
        c = _auth_client(self.msp_agent)
        r = c.post(
            f'/api/tickets/{self.ticket.ticket_ref}/replies/',
            {'type': 'internal_note', 'body': 'internal'},
            format='json',
        )
        self.assertEqual(r.status_code, 201)

    def test_client_cannot_see_internal_notes_in_ticket_detail(self):
        from apps.tickets.models import Reply
        Reply.objects.create(
            ticket=self.ticket, author=self.msp_agent,
            type='internal_note', body='secret internal note',
        )
        c = _auth_client(self.client_user)
        r = c.get(f'/api/tickets/{self.ticket.ticket_ref}/')
        self.assertEqual(r.status_code, 200)
        reply_types = [rep['type'] for rep in r.data.get('replies', [])]
        self.assertNotIn('internal_note', reply_types)

    def test_msp_can_see_internal_notes_in_ticket_detail(self):
        from apps.tickets.models import Reply
        Reply.objects.create(
            ticket=self.ticket, author=self.msp_agent,
            type='internal_note', body='secret internal note',
        )
        c = _auth_client(self.msp_agent)
        r = c.get(f'/api/tickets/{self.ticket.ticket_ref}/')
        self.assertEqual(r.status_code, 200)
        reply_types = [rep['type'] for rep in r.data.get('replies', [])]
        self.assertIn('internal_note', reply_types)

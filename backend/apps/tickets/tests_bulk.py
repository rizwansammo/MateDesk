"""
Bulk ticket actions — POST /api/tickets/bulk/ with action="close" | "delete".

The endpoint resolves refs through the viewset's own get_queryset(), so tenant
isolation and role scoping are inherited rather than re-implemented; the tests
below pin that down, because a bulk endpoint that widened either would leak or
destroy another workspace's data in one call.

Closing mirrors the resolved_at rules in partial_update. Those rules exist
because 'closed' counts as resolved, not as reopening — see tests_lifecycle.
"""
from django.test import TestCase, override_settings
from django.utils import timezone

from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.tenants.models import Tenant, ClientOrganization
from apps.users.models import User
from apps.tickets.models import Ticket, Reply

URL = '/api/tickets/bulk/'


def _tenant(slug='bulk-co'):
    return Tenant.objects.create(name='Bulk Co', slug=slug, is_active=True)


def _user(tenant, role='msp_owner', org=None):
    u = User.objects.create_user(
        email=f'{role}@{tenant.slug}.test', password='testpass123',
        first_name='Test', last_name=role, role=role, tenant=tenant,
    )
    if org:
        u.client_org = org
        u.save()
    return u


def _client(user):
    c = APIClient()
    c.credentials(HTTP_AUTHORIZATION=f'Bearer {AccessToken.for_user(user)}')
    return c


def _ticket(tenant, seq=1, **fields):
    defaults = dict(
        tenant=tenant, ticket_ref=f'T01012026-{seq:04d}', seq=seq,
        subject=f'Ticket {seq}', status='open', priority='normal',
        requester_name='Bob',
    )
    defaults.update(fields)
    return Ticket.objects.create(**defaults)


@override_settings(DEBUG=True)   # IsTenantUser needs a resolved tenant otherwise
class BulkCloseTest(TestCase):
    def setUp(self):
        self.tenant = _tenant()
        self.owner  = _user(self.tenant)
        self.c      = _client(self.owner)
        self.a = _ticket(self.tenant, 1)
        self.b = _ticket(self.tenant, 2)

    def _close(self, refs):
        return self.c.post(URL, {'refs': refs, 'action': 'close'}, format='json')

    def test_closes_every_selected_ticket(self):
        resp = self._close([self.a.ticket_ref, self.b.ticket_ref])

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['count'], 2)
        self.a.refresh_from_db(); self.b.refresh_from_db()
        self.assertEqual(self.a.status, 'closed')
        self.assertEqual(self.b.status, 'closed')

    def test_leaves_unselected_tickets_alone(self):
        self._close([self.a.ticket_ref])

        self.b.refresh_from_db()
        self.assertEqual(self.b.status, 'open')

    def test_stamps_resolved_at(self):
        self._close([self.a.ticket_ref])

        self.a.refresh_from_db()
        self.assertIsNotNone(self.a.resolved_at)

    def test_preserves_an_existing_resolution_time(self):
        """solved -> closed keeps the original timestamp, as single-ticket does."""
        earlier = timezone.now() - timezone.timedelta(days=2)
        solved  = _ticket(self.tenant, 3, status='solved', resolved_at=earlier)

        self._close([solved.ticket_ref])

        solved.refresh_from_db()
        self.assertEqual(solved.status, 'closed')
        self.assertEqual(solved.resolved_at, earlier)

    def test_reopened_ticket_gets_a_fresh_timestamp(self):
        """Resolved, reopened, then bulk-closed — the stale stamp must not stick."""
        stale = _ticket(
            self.tenant, 4, status='open',
            resolved_at=timezone.now() - timezone.timedelta(days=5),
        )
        self._close([stale.ticket_ref])

        stale.refresh_from_db()
        self.assertGreater(stale.resolved_at, timezone.now() - timezone.timedelta(minutes=1))

    def test_already_closed_tickets_are_skipped(self):
        earlier = timezone.now() - timezone.timedelta(days=3)
        done = _ticket(self.tenant, 5, status='closed', resolved_at=earlier)

        resp = self._close([done.ticket_ref])

        self.assertEqual(resp.data['count'], 0)
        done.refresh_from_db()
        self.assertEqual(done.resolved_at, earlier)

    def test_writes_one_audit_reply_per_ticket(self):
        self._close([self.a.ticket_ref, self.b.ticket_ref])

        for ticket in (self.a, self.b):
            events = Reply.objects.filter(ticket=ticket, type='system_event')
            self.assertEqual(events.count(), 1)
            self.assertIn('Closed', events.first().body)

    def test_no_audit_reply_for_a_skipped_ticket(self):
        done = _ticket(self.tenant, 6, status='closed')
        self._close([done.ticket_ref])
        self.assertEqual(Reply.objects.filter(ticket=done).count(), 0)


@override_settings(DEBUG=True)
class BulkDeleteTest(TestCase):
    def setUp(self):
        self.tenant = _tenant()
        self.owner  = _user(self.tenant)
        self.c      = _client(self.owner)
        self.a = _ticket(self.tenant, 1)
        self.b = _ticket(self.tenant, 2)

    def _delete(self, refs, client=None):
        return (client or self.c).post(URL, {'refs': refs, 'action': 'delete'}, format='json')

    def test_deletes_every_selected_ticket(self):
        resp = self._delete([self.a.ticket_ref, self.b.ticket_ref])

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['count'], 2)
        self.assertEqual(Ticket.objects.filter(tenant=self.tenant).count(), 0)

    def test_leaves_unselected_tickets_alone(self):
        self._delete([self.a.ticket_ref])

        self.assertTrue(Ticket.objects.filter(pk=self.b.pk).exists())

    def test_cascades_to_replies(self):
        Reply.objects.create(ticket=self.a, author=self.owner, type='public_reply', body='hi')
        self._delete([self.a.ticket_ref])
        self.assertEqual(Reply.objects.filter(ticket_id=self.a.pk).count(), 0)

    def test_manager_may_delete(self):
        manager = _user(self.tenant, role='msp_manager')
        resp = self._delete([self.a.ticket_ref], _client(manager))
        self.assertEqual(resp.status_code, 200)

    def test_agent_may_not_delete(self):
        """Agents can close but not destroy."""
        agent = _user(self.tenant, role='msp_agent')
        resp = self._delete([self.a.ticket_ref], _client(agent))

        self.assertEqual(resp.status_code, 403)
        self.assertTrue(Ticket.objects.filter(pk=self.a.pk).exists())

    def test_agent_may_still_close(self):
        agent = _user(self.tenant, role='msp_agent')
        resp = _client(agent).post(
            URL, {'refs': [self.a.ticket_ref], 'action': 'close'}, format='json')

        self.assertEqual(resp.status_code, 200)
        self.a.refresh_from_db()
        self.assertEqual(self.a.status, 'closed')


@override_settings(DEBUG=True)
class BulkIsolationTest(TestCase):
    """A bulk call must not reach past the caller's own scope."""

    def setUp(self):
        self.tenant = _tenant()
        self.owner  = _user(self.tenant)
        self.c      = _client(self.owner)

    def test_cannot_touch_another_tenants_tickets(self):
        other       = _tenant('other-co')
        other_owner = _user(other)
        victim      = _ticket(other, 1)

        resp = self.c.post(
            URL, {'refs': [victim.ticket_ref], 'action': 'delete'}, format='json')

        self.assertEqual(resp.status_code, 404)
        self.assertTrue(Ticket.objects.filter(pk=victim.pk).exists())
        self.assertIsNotNone(other_owner)

    def test_mixed_refs_only_affect_the_callers_tenant(self):
        """A ref list spanning two tenants must silently drop the foreign one."""
        other  = _tenant('other-co')
        mine   = _ticket(self.tenant, 1)
        theirs = _ticket(other, 1)   # same ref string, different tenant

        resp = self.c.post(
            URL, {'refs': [mine.ticket_ref], 'action': 'delete'}, format='json')

        self.assertEqual(resp.data['count'], 1)
        self.assertFalse(Ticket.objects.filter(pk=mine.pk).exists())
        self.assertTrue(Ticket.objects.filter(pk=theirs.pk).exists())

    def test_client_user_is_rejected(self):
        org  = ClientOrganization.objects.create(
            tenant=self.tenant, name='Acme', is_active=True)
        enduser = _user(self.tenant, role='end_user', org=org)
        ticket  = _ticket(self.tenant, 1, client_org=org)

        resp = _client(enduser).post(
            URL, {'refs': [ticket.ticket_ref], 'action': 'close'}, format='json')

        self.assertEqual(resp.status_code, 403)
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, 'open')

    def test_anonymous_is_rejected(self):
        resp = APIClient().post(URL, {'refs': ['x'], 'action': 'close'}, format='json')
        self.assertIn(resp.status_code, (401, 403))


@override_settings(DEBUG=True)
class BulkValidationTest(TestCase):
    def setUp(self):
        self.tenant = _tenant()
        self.c      = _client(_user(self.tenant))
        self.ticket = _ticket(self.tenant)

    def test_unknown_action_is_rejected(self):
        resp = self.c.post(
            URL, {'refs': [self.ticket.ticket_ref], 'action': 'purge'}, format='json')

        self.assertEqual(resp.status_code, 400)
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.status, 'open')

    def test_missing_action_is_rejected(self):
        resp = self.c.post(URL, {'refs': [self.ticket.ticket_ref]}, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_empty_ref_list_is_rejected(self):
        resp = self.c.post(URL, {'refs': [], 'action': 'close'}, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_refs_must_be_a_list(self):
        resp = self.c.post(URL, {'refs': 'T01012026-0001', 'action': 'close'}, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_oversized_batch_is_rejected(self):
        resp = self.c.post(
            URL, {'refs': [f'T01012026-{i:04d}' for i in range(201)], 'action': 'close'},
            format='json')
        self.assertEqual(resp.status_code, 400)

    def test_non_string_refs_are_ignored_not_crashed(self):
        resp = self.c.post(
            URL, {'refs': [self.ticket.ticket_ref, None, 42, {'a': 1}], 'action': 'close'},
            format='json')

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['count'], 1)

    def test_unknown_refs_give_404(self):
        resp = self.c.post(
            URL, {'refs': ['T99999999-9999'], 'action': 'close'}, format='json')
        self.assertEqual(resp.status_code, 404)

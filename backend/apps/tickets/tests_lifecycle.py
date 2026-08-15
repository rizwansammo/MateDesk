"""
Ticket lifecycle: status transitions, resolved_at bookkeeping, merge/absorb, and
role-based queryset scoping.

Complements tests_rbac.py, which covers reply visibility and user-detail
permissions. This file covers state changes and the merge graph.

One test documents a modelling gap (merge chains) rather than a defect, and is
named accordingly.
"""
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.tenants.models import Tenant, ClientOrganization
from apps.users.models import User
from apps.tickets.models import Ticket, Reply


def _tenant(slug='life-co'):
    return Tenant.objects.create(name='Life Co', slug=slug, is_active=True)


def _user(tenant, role='msp_owner', email=None, org=None, vip=False):
    u = User.objects.create_user(
        email=email or f'{role}@{tenant.slug}.test', password='testpass123',
        first_name='Test', last_name=role, role=role, tenant=tenant, is_vip=vip,
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
class StatusTransitionTest(TestCase):
    def setUp(self):
        self.tenant = _tenant()
        self.owner  = _user(self.tenant)
        self.c      = _client(self.owner)
        self.ticket = _ticket(self.tenant)

    def _patch(self, **data):
        return self.c.patch(f'/api/tickets/{self.ticket.ticket_ref}/', data, format='json')

    def test_status_can_be_changed(self):
        r = self._patch(status='in_progress')
        self.assertEqual(r.status_code, 200)
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.status, 'in_progress')

    def test_solving_sets_resolved_at(self):
        self.assertIsNone(self.ticket.resolved_at)
        self._patch(status='solved')
        self.ticket.refresh_from_db()
        self.assertIsNotNone(self.ticket.resolved_at)

    def test_closing_sets_resolved_at(self):
        # Regression: 'closed' previously fell into the else branch and NULLed
        # resolved_at, so every closed ticket lost its resolution timestamp.
        self._patch(status='closed')
        self.ticket.refresh_from_db()
        self.assertIsNotNone(self.ticket.resolved_at)

    def test_solved_then_closed_preserves_the_original_timestamp(self):
        # The normal path is solve, then close. The first resolution time is the
        # meaningful one and must survive the second transition.
        self._patch(status='solved')
        self.ticket.refresh_from_db()
        first = self.ticket.resolved_at
        self.assertIsNotNone(first)

        self._patch(status='closed')
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.resolved_at, first)

    def test_reopening_clears_resolved_at(self):
        self._patch(status='solved')
        self.ticket.refresh_from_db()
        self.assertIsNotNone(self.ticket.resolved_at)

        self._patch(status='open')
        self.ticket.refresh_from_db()
        self.assertIsNone(self.ticket.resolved_at)

    def test_reopening_from_closed_clears_resolved_at(self):
        self._patch(status='closed')
        self._patch(status='in_progress')
        self.ticket.refresh_from_db()
        self.assertIsNone(self.ticket.resolved_at)

    def test_a_patch_that_does_not_touch_status_leaves_resolved_at_alone(self):
        self._patch(status='solved')
        self.ticket.refresh_from_db()
        first = self.ticket.resolved_at

        self._patch(priority='high')
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.resolved_at, first)
        self.assertEqual(self.ticket.priority, 'high')

    def test_priority_and_level_can_be_changed(self):
        self._patch(priority='critical', level='L3')
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.priority, 'critical')
        self.assertEqual(self.ticket.level, 'L3')


@override_settings(DEBUG=True)
class MergeTest(TestCase):
    def setUp(self):
        self.tenant = _tenant()
        self.owner  = _user(self.tenant)
        self.c      = _client(self.owner)
        self.a      = _ticket(self.tenant, seq=1)
        self.b      = _ticket(self.tenant, seq=2)

    def _merge(self, source, target_ref, client=None):
        return (client or self.c).post(
            f'/api/tickets/{source.ticket_ref}/merge/',
            {'target_ref': target_ref}, format='json')

    def test_merge_marks_source_secondary_and_closes_it(self):
        r = self._merge(self.a, self.b.ticket_ref)
        self.assertEqual(r.status_code, 200)
        self.a.refresh_from_db()
        self.assertEqual(self.a.merge_status, 'secondary')
        self.assertEqual(self.a.merged_into, self.b)
        self.assertEqual(self.a.status, 'closed')

    def test_merge_marks_target_primary(self):
        self._merge(self.a, self.b.ticket_ref)
        self.b.refresh_from_db()
        self.assertEqual(self.b.merge_status, 'primary')

    def test_merge_writes_a_system_event_on_both_tickets(self):
        self._merge(self.a, self.b.ticket_ref)
        self.assertTrue(Reply.objects.filter(ticket=self.a, type='system_event').exists())
        self.assertTrue(Reply.objects.filter(ticket=self.b, type='system_event').exists())

    def test_cannot_merge_a_ticket_into_itself(self):
        r = self._merge(self.a, self.a.ticket_ref)
        self.assertEqual(r.status_code, 400)

    def test_target_ref_is_required(self):
        r = self.c.post(f'/api/tickets/{self.a.ticket_ref}/merge/', {}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_unknown_target_is_404(self):
        r = self._merge(self.a, 'T01012026-9999')
        self.assertEqual(r.status_code, 404)

    def test_cannot_merge_a_ticket_that_is_already_secondary(self):
        self._merge(self.a, self.b.ticket_ref)
        c = _ticket(self.tenant, seq=3)
        r = self._merge(self.a, c.ticket_ref)
        self.assertEqual(r.status_code, 400)

    def test_cannot_merge_into_a_secondary(self):
        self._merge(self.a, self.b.ticket_ref)      # a -> b, a is secondary
        c = _ticket(self.tenant, seq=3)
        r = self._merge(c, self.a.ticket_ref)       # c -> a should be refused
        self.assertEqual(r.status_code, 400)

    def test_cannot_merge_across_tenants(self):
        other = _tenant('other-co')
        foreign = _ticket(other, seq=99)
        r = self._merge(self.a, foreign.ticket_ref)
        self.assertEqual(r.status_code, 404)

    def test_client_user_cannot_merge(self):
        end_user = _user(self.tenant, role='end_user', email='eu@life.test')
        r = self._merge(self.a, self.b.ticket_ref, client=_client(end_user))
        self.assertEqual(r.status_code, 403)

    def test_msp_agent_can_merge(self):
        agent = _user(self.tenant, role='msp_agent', email='ag@life.test')
        r = self._merge(self.a, self.b.ticket_ref, client=_client(agent))
        self.assertEqual(r.status_code, 200)

    def test_LIMITATION_merge_chains_are_permitted(self):
        """A primary can later be merged into a third ticket, forming a chain.

        After a -> b, b is 'primary'. Merging b -> c is allowed, because the
        guards only refuse a source that is already 'secondary'. The result is
        a -> b -> c, so a's merged_into now points at a ticket that is itself
        secondary, and nothing resolves the chain to its final primary.

        Recorded rather than fixed: the correct behaviour (refuse, or re-point
        every secondary at the new primary) is a product decision.
        """
        c = _ticket(self.tenant, seq=3)
        self._merge(self.a, self.b.ticket_ref)     # a -> b
        r = self._merge(self.b, c.ticket_ref)      # b -> c, permitted
        self.assertEqual(r.status_code, 200)

        self.a.refresh_from_db()
        self.b.refresh_from_db()
        self.assertEqual(self.a.merged_into, self.b)
        self.assertEqual(self.b.merge_status, 'secondary')   # a points at a secondary


@override_settings(DEBUG=True)
class AbsorbTest(TestCase):
    def setUp(self):
        self.tenant = _tenant()
        self.owner  = _user(self.tenant)
        self.c      = _client(self.owner)
        self.a      = _ticket(self.tenant, seq=1)
        self.b      = _ticket(self.tenant, seq=2)

    def _absorb(self, primary, source_ref, client=None):
        return (client or self.c).post(
            f'/api/tickets/{primary.ticket_ref}/absorb/',
            {'source_ref': source_ref}, format='json')

    def test_absorb_is_the_inverse_of_merge(self):
        r = self._absorb(self.b, self.a.ticket_ref)
        self.assertEqual(r.status_code, 200)
        self.a.refresh_from_db()
        self.b.refresh_from_db()
        self.assertEqual(self.a.merge_status, 'secondary')
        self.assertEqual(self.a.merged_into, self.b)
        self.assertEqual(self.a.status, 'closed')
        self.assertEqual(self.b.merge_status, 'primary')

    def test_cannot_absorb_a_ticket_into_itself(self):
        self.assertEqual(self._absorb(self.a, self.a.ticket_ref).status_code, 400)

    def test_source_ref_is_required(self):
        r = self.c.post(f'/api/tickets/{self.a.ticket_ref}/absorb/', {}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_unknown_source_is_404(self):
        self.assertEqual(self._absorb(self.a, 'T01012026-9999').status_code, 404)

    def test_cannot_absorb_an_already_secondary_ticket(self):
        self._absorb(self.b, self.a.ticket_ref)
        c = _ticket(self.tenant, seq=3)
        self.assertEqual(self._absorb(c, self.a.ticket_ref).status_code, 400)

    def test_a_secondary_cannot_absorb(self):
        self._absorb(self.b, self.a.ticket_ref)    # a is now secondary
        c = _ticket(self.tenant, seq=3)
        self.assertEqual(self._absorb(self.a, c.ticket_ref).status_code, 400)

    def test_cannot_absorb_across_tenants(self):
        other = _tenant('other-co')
        foreign = _ticket(other, seq=99)
        self.assertEqual(self._absorb(self.a, foreign.ticket_ref).status_code, 404)

    def test_client_user_cannot_absorb(self):
        end_user = _user(self.tenant, role='end_user', email='eu@life.test')
        r = self._absorb(self.b, self.a.ticket_ref, client=_client(end_user))
        self.assertEqual(r.status_code, 403)

    def test_absorb_writes_a_system_event_on_both_tickets(self):
        self._absorb(self.b, self.a.ticket_ref)
        self.assertTrue(Reply.objects.filter(ticket=self.a, type='system_event').exists())
        self.assertTrue(Reply.objects.filter(ticket=self.b, type='system_event').exists())

    def test_a_primary_can_absorb_more_than_one_ticket(self):
        c = _ticket(self.tenant, seq=3)
        self.assertEqual(self._absorb(self.b, self.a.ticket_ref).status_code, 200)
        self.assertEqual(self._absorb(self.b, c.ticket_ref).status_code, 200)
        self.a.refresh_from_db(); c.refresh_from_db(); self.b.refresh_from_db()
        self.assertEqual(self.a.merged_into, self.b)
        self.assertEqual(c.merged_into, self.b)
        self.assertEqual(self.b.merge_status, 'primary')


@override_settings(DEBUG=True)
class QuerysetScopingTest(TestCase):
    """Role-based row filtering on the list endpoint."""

    def setUp(self):
        self.tenant = _tenant()
        self.org_a  = ClientOrganization.objects.create(tenant=self.tenant, name='Org A')
        self.org_b  = ClientOrganization.objects.create(tenant=self.tenant, name='Org B')

        self.eu_a = _user(self.tenant, role='end_user', email='eu-a@life.test', org=self.org_a)
        self.eu_b = _user(self.tenant, role='end_user', email='eu-b@life.test', org=self.org_b)

        self.t_eu_a = _ticket(self.tenant, seq=1, client_org=self.org_a, requester=self.eu_a)
        self.t_org_a_other = _ticket(self.tenant, seq=2, client_org=self.org_a)
        self.t_org_b = _ticket(self.tenant, seq=3, client_org=self.org_b, requester=self.eu_b)

    def _refs(self, user):
        r = _client(user).get('/api/tickets/')
        self.assertEqual(r.status_code, 200)
        results = r.data['results'] if isinstance(r.data, dict) else r.data
        # TicketListSerializer exposes ticket_ref as 'ref', not 'ticket_ref'.
        return {t['ref'] for t in results}

    def test_msp_staff_see_every_ticket(self):
        owner = _user(self.tenant, role='msp_owner')
        self.assertEqual(len(self._refs(owner)), 3)

    def test_end_user_sees_only_their_own_tickets(self):
        refs = self._refs(self.eu_a)
        self.assertEqual(refs, {self.t_eu_a.ticket_ref})

    def test_client_owner_sees_the_whole_org(self):
        co = _user(self.tenant, role='client_owner', email='co@life.test', org=self.org_a)
        self.assertEqual(
            self._refs(co),
            {self.t_eu_a.ticket_ref, self.t_org_a_other.ticket_ref})

    def test_vip_end_user_is_scoped_to_the_org_not_just_self(self):
        # A VIP end user is deliberately widened to org scope, matching client_owner.
        vip = _user(self.tenant, role='end_user', email='vip@life.test',
                    org=self.org_a, vip=True)
        self.assertEqual(
            self._refs(vip),
            {self.t_eu_a.ticket_ref, self.t_org_a_other.ticket_ref})

    def test_client_owner_with_no_org_sees_nothing(self):
        orphan = _user(self.tenant, role='client_owner', email='orphan@life.test')
        self.assertEqual(self._refs(orphan), set())

    def test_tickets_from_another_tenant_are_never_visible(self):
        other = _tenant('other-co')
        _ticket(other, seq=99)
        owner = _user(self.tenant, role='msp_owner')
        self.assertEqual(len(self._refs(owner)), 3)

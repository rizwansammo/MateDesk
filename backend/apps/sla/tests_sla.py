"""
SLA policy matching, breach evaluation and pause accounting.

`created_at` is auto_now_add, so every test that needs an aged ticket rewrites it
with a queryset .update() and re-reads — assigning to the instance alone would be
overwritten on the next save.

Three tests document defects rather than intended behaviour. They are named
test_BUG_* and explained inline, so the suite records the current contract
honestly instead of asserting that a bug is correct.
"""
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from apps.tenants.models import Tenant, ClientOrganization
from apps.tickets.models import Ticket
from apps.sla.models import SLAPolicy, SLATarget, SLAPauseLog, VIPRule
from apps.sla.services import (
    get_matching_policy, compute_sla_status, refresh_ticket_sla,
)


def _tenant(slug='sla-co'):
    return Tenant.objects.create(name='SLA Co', slug=slug, is_active=True)


def _policy(tenant, *, order=10, scope='all_orgs', org=None, active=True,
            name=None, fr=60, res=480, soon=30, priority='normal'):
    p = SLAPolicy.objects.create(
        tenant=tenant, name=name or f'Policy {order}', is_active=active,
        priority_order=order, scope_type=scope, scope_org=org,
    )
    SLATarget.objects.create(
        policy=p, priority=priority,
        first_response_minutes=fr, resolution_minutes=res, due_soon_minutes=soon,
    )
    return p


def _ticket(tenant, *, org=None, seq=1, priority='normal', status='open',
            internal=False, age_minutes=0):
    t = Ticket.objects.create(
        tenant=tenant, client_org=org,
        ticket_ref=f'T01012026-{seq:04d}', seq=seq,
        subject=f'Ticket {seq}', status=status, priority=priority,
        is_internal=internal, requester_name='Requester',
    )
    if age_minutes:
        # created_at is auto_now_add; only a direct UPDATE can backdate it.
        Ticket.objects.filter(pk=t.pk).update(
            created_at=timezone.now() - timedelta(minutes=age_minutes)
        )
        t.refresh_from_db()
    return t


class PolicyMatchingTest(TestCase):
    def setUp(self):
        self.tenant = _tenant()
        self.org    = ClientOrganization.objects.create(tenant=self.tenant, name='Acme')
        self.other  = ClientOrganization.objects.create(tenant=self.tenant, name='Other')

    def test_no_policies_means_no_match(self):
        self.assertIsNone(get_matching_policy(_ticket(self.tenant)))

    def test_all_orgs_policy_matches_any_ticket(self):
        p = _policy(self.tenant)
        self.assertEqual(get_matching_policy(_ticket(self.tenant, org=self.org)), p)

    def test_inactive_policy_is_ignored(self):
        _policy(self.tenant, active=False)
        self.assertIsNone(get_matching_policy(_ticket(self.tenant)))

    def test_specific_org_matches_only_that_org(self):
        p = _policy(self.tenant, scope='specific_org', org=self.org)
        self.assertEqual(get_matching_policy(_ticket(self.tenant, org=self.org)), p)
        self.assertIsNone(get_matching_policy(_ticket(self.tenant, org=self.other, seq=2)))

    def test_specific_org_does_not_match_a_ticket_with_no_org(self):
        _policy(self.tenant, scope='specific_org', org=self.org)
        self.assertIsNone(get_matching_policy(_ticket(self.tenant, org=None)))

    def test_lowest_priority_order_wins(self):
        first  = _policy(self.tenant, order=5,  name='First')
        _policy(self.tenant, order=10, name='Second')
        self.assertEqual(get_matching_policy(_ticket(self.tenant)), first)

    def test_specific_org_can_outrank_all_orgs(self):
        specific = _policy(self.tenant, order=1, scope='specific_org', org=self.org, name='Org')
        _policy(self.tenant, order=5, name='Catch-all')
        self.assertEqual(get_matching_policy(_ticket(self.tenant, org=self.org)), specific)

    def test_all_orgs_wins_when_it_ranks_higher(self):
        catch_all = _policy(self.tenant, order=1, name='Catch-all')
        _policy(self.tenant, order=5, scope='specific_org', org=self.org, name='Org')
        self.assertEqual(get_matching_policy(_ticket(self.tenant, org=self.org)), catch_all)

    def test_internal_tickets_are_exempt(self):
        _policy(self.tenant)
        self.assertIsNone(get_matching_policy(_ticket(self.tenant, internal=True)))

    def test_after_hours_scope_is_not_yet_implemented(self):
        # Documented as Phase B in services.py — it must not match, rather than
        # matching every ticket by accident.
        _policy(self.tenant, scope='after_hours')
        self.assertIsNone(get_matching_policy(_ticket(self.tenant)))

    def test_policies_are_tenant_scoped(self):
        other_tenant = _tenant('other-co')
        _policy(other_tenant)
        self.assertIsNone(get_matching_policy(_ticket(self.tenant)))


class BreachEvaluationTest(TestCase):
    def setUp(self):
        self.tenant = _tenant()
        # first response 60m, resolution 480m, due-soon window 30m
        _policy(self.tenant, fr=60, res=480, soon=30)

    def test_fresh_ticket_is_on_track(self):
        self.assertEqual(compute_sla_status(_ticket(self.tenant)), 'on_track')

    def test_no_target_for_the_priority_means_not_applied(self):
        # The policy above only defines a target for 'normal'.
        t = _ticket(self.tenant, priority='critical')
        self.assertEqual(compute_sla_status(t), 'not_applied')

    def test_unanswered_past_first_response_target_is_breached(self):
        t = _ticket(self.tenant, age_minutes=61)
        self.assertEqual(compute_sla_status(t), 'breached')

    def test_answered_within_target_is_on_track(self):
        t = _ticket(self.tenant, age_minutes=61)
        Ticket.objects.filter(pk=t.pk).update(
            first_response_at=t.created_at + timedelta(minutes=30)
        )
        t.refresh_from_db()
        self.assertEqual(compute_sla_status(t), 'on_track')

    def test_due_soon_inside_the_warning_window(self):
        # 480 - 30 = 450m; at 455m elapsed it is due_soon but not yet breached.
        t = _ticket(self.tenant, age_minutes=455)
        Ticket.objects.filter(pk=t.pk).update(first_response_at=t.created_at)
        t.refresh_from_db()
        self.assertEqual(compute_sla_status(t), 'due_soon')

    def test_past_resolution_target_is_breached(self):
        t = _ticket(self.tenant, age_minutes=481)
        Ticket.objects.filter(pk=t.pk).update(first_response_at=t.created_at)
        t.refresh_from_db()
        self.assertEqual(compute_sla_status(t), 'breached')

    def test_solved_within_both_targets_is_completed(self):
        t = _ticket(self.tenant, age_minutes=100, status='solved')
        Ticket.objects.filter(pk=t.pk).update(
            first_response_at=t.created_at + timedelta(minutes=10),
            resolved_at=t.created_at + timedelta(minutes=90),
        )
        t.refresh_from_db()
        self.assertEqual(compute_sla_status(t), 'completed')

    def test_solved_but_first_response_was_late_is_breached(self):
        t = _ticket(self.tenant, age_minutes=200, status='solved')
        Ticket.objects.filter(pk=t.pk).update(
            first_response_at=t.created_at + timedelta(minutes=90),   # target was 60
            resolved_at=t.created_at + timedelta(minutes=120),
        )
        t.refresh_from_db()
        self.assertEqual(compute_sla_status(t), 'breached')

    def test_solved_but_resolved_late_is_breached(self):
        t = _ticket(self.tenant, age_minutes=600, status='solved')
        Ticket.objects.filter(pk=t.pk).update(
            first_response_at=t.created_at + timedelta(minutes=10),
            resolved_at=t.created_at + timedelta(minutes=500),        # target was 480
        )
        t.refresh_from_db()
        self.assertEqual(compute_sla_status(t), 'breached')

    def test_solved_with_no_first_response_is_breached(self):
        t = _ticket(self.tenant, age_minutes=100, status='solved')
        Ticket.objects.filter(pk=t.pk).update(resolved_at=t.created_at + timedelta(minutes=90))
        t.refresh_from_db()
        self.assertEqual(compute_sla_status(t), 'breached')

    def test_closed_is_evaluated_like_solved(self):
        t = _ticket(self.tenant, age_minutes=100, status='closed')
        Ticket.objects.filter(pk=t.pk).update(
            first_response_at=t.created_at + timedelta(minutes=10),
            resolved_at=t.created_at + timedelta(minutes=90),
        )
        t.refresh_from_db()
        self.assertEqual(compute_sla_status(t), 'completed')


class PauseAccountingTest(TestCase):
    def setUp(self):
        self.tenant = _tenant()
        _policy(self.tenant, fr=60, res=480, soon=30)

    def test_a_closed_pause_extends_the_due_time(self):
        # 61m old with no reply would breach; a 30m pause pushes the target out.
        t = _ticket(self.tenant, age_minutes=61)
        SLAPauseLog.objects.create(
            ticket=t,
            paused_at=t.created_at + timedelta(minutes=10),
            resumed_at=t.created_at + timedelta(minutes=40),
        )
        self.assertEqual(compute_sla_status(t), 'on_track')

    def test_an_open_pause_counts_up_to_now(self):
        t = _ticket(self.tenant, age_minutes=61)
        SLAPauseLog.objects.create(ticket=t, paused_at=timezone.now() - timedelta(minutes=45))
        self.assertEqual(compute_sla_status(t), 'on_track')

    def test_pauses_accumulate(self):
        t = _ticket(self.tenant, age_minutes=100)
        for start, end in ((10, 40), (50, 80)):
            SLAPauseLog.objects.create(
                ticket=t,
                paused_at=t.created_at + timedelta(minutes=start),
                resumed_at=t.created_at + timedelta(minutes=end),
            )
        # Two 30m pauses = 60m, pushing the 60m first-response target out to 120m
        # while only 100m has elapsed. Deliberately not landing exactly on the
        # boundary: `now` is evaluated a fraction of a second after the ticket is
        # backdated, so an exact-boundary assertion would be flaky.
        self.assertEqual(compute_sla_status(t), 'on_track')

    def test_a_pause_shorter_than_the_overrun_still_breaches(self):
        t = _ticket(self.tenant, age_minutes=100)
        SLAPauseLog.objects.create(
            ticket=t,
            paused_at=t.created_at + timedelta(minutes=10),
            resumed_at=t.created_at + timedelta(minutes=20),
        )
        self.assertEqual(compute_sla_status(t), 'breached')

    def test_pauses_are_per_ticket(self):
        a = _ticket(self.tenant, seq=1, age_minutes=61)
        b = _ticket(self.tenant, seq=2, age_minutes=61)
        SLAPauseLog.objects.create(
            ticket=b,
            paused_at=b.created_at + timedelta(minutes=10),
            resumed_at=b.created_at + timedelta(minutes=40),
        )
        self.assertEqual(compute_sla_status(a), 'breached')
        self.assertEqual(compute_sla_status(b), 'on_track')


class RefreshAndNotifyTest(TestCase):
    def setUp(self):
        self.tenant = _tenant()
        self.policy = _policy(self.tenant, fr=60, res=480, soon=30)

    def test_refresh_persists_the_new_status(self):
        t = _ticket(self.tenant, age_minutes=61)
        refresh_ticket_sla(t)
        t.refresh_from_db()
        self.assertEqual(t.sla_status, 'breached')

    def test_breach_sets_the_notified_flag(self):
        t = _ticket(self.tenant, age_minutes=61)
        refresh_ticket_sla(t)
        t.refresh_from_db()
        self.assertTrue(t.sla_breach_notified)

    def test_refresh_is_idempotent(self):
        t = _ticket(self.tenant, age_minutes=61)
        refresh_ticket_sla(t)
        refresh_ticket_sla(t)
        t.refresh_from_db()
        self.assertEqual(t.sla_status, 'breached')
        self.assertTrue(t.sla_breach_notified)

    def test_no_matching_policy_yields_not_applied(self):
        SLAPolicy.objects.all().delete()
        t = _ticket(self.tenant, age_minutes=999)
        refresh_ticket_sla(t)
        t.refresh_from_db()
        self.assertEqual(t.sla_status, 'not_applied')

    def test_internal_ticket_stays_not_applied(self):
        t = _ticket(self.tenant, internal=True, age_minutes=999)
        refresh_ticket_sla(t)
        t.refresh_from_db()
        self.assertEqual(t.sla_status, 'not_applied')

    # ── Defects, recorded as-is ───────────────────────────────────────────────

    def test_first_response_breach_latches_after_a_late_reply(self):
        """A missed first response is permanent.

        Regression test. Previously only the `first_response_at is None` case was
        checked, so an agent replying late made the check fall through: the ticket
        reverted from breached to on_track and sla_breach_notified was cleared,
        which undercounted breaches and allowed a second notification later.
        """
        t = _ticket(self.tenant, age_minutes=61)
        refresh_ticket_sla(t)
        t.refresh_from_db()
        self.assertEqual(t.sla_status, 'breached')

        # Agent finally replies — late, past the 60m target.
        Ticket.objects.filter(pk=t.pk).update(
            first_response_at=t.created_at + timedelta(minutes=61)
        )
        t.refresh_from_db()
        refresh_ticket_sla(t)
        t.refresh_from_db()

        self.assertEqual(t.sla_status, 'breached')
        self.assertTrue(t.sla_breach_notified)

    def test_an_on_time_reply_does_not_latch_a_breach(self):
        # The latch must key on lateness, not merely on having replied.
        t = _ticket(self.tenant, age_minutes=61)
        Ticket.objects.filter(pk=t.pk).update(
            first_response_at=t.created_at + timedelta(minutes=30)
        )
        t.refresh_from_db()
        self.assertEqual(compute_sla_status(t), 'on_track')

    def test_solved_verdict_is_stable_when_resolved_at_is_missing(self):
        """A finished ticket's verdict must not depend on when it is read.

        Regression test. The old fallback (`resolved_at or now`) re-measured a
        solved ticket against the current time, so the same row flipped from
        completed to breached as it aged.
        """
        t = _ticket(self.tenant, age_minutes=100, status='solved')
        Ticket.objects.filter(pk=t.pk).update(
            first_response_at=t.created_at + timedelta(minutes=10),
            resolved_at=None,
        )
        t.refresh_from_db()
        self.assertEqual(compute_sla_status(t), 'completed')

        # Same ticket read much later. created_at and first_response_at must move
        # together — shifting only created_at would make the reply retroactively
        # late and breach on the first-response clock, which is a different rule.
        older = timezone.now() - timedelta(minutes=5000)
        Ticket.objects.filter(pk=t.pk).update(
            created_at=older,
            first_response_at=older + timedelta(minutes=10),
        )
        t.refresh_from_db()
        self.assertEqual(compute_sla_status(t), 'completed')

    def test_solved_late_still_breaches_when_resolved_at_is_present(self):
        # The stability guard must not mask a genuine resolution breach.
        t = _ticket(self.tenant, age_minutes=600, status='solved')
        Ticket.objects.filter(pk=t.pk).update(
            first_response_at=t.created_at + timedelta(minutes=10),
            resolved_at=t.created_at + timedelta(minutes=500),   # target was 480
        )
        t.refresh_from_db()
        self.assertEqual(compute_sla_status(t), 'breached')


class VIPRuleTest(TestCase):
    def test_vip_rule_is_one_per_tenant(self):
        tenant = _tenant()
        VIPRule.objects.create(tenant=tenant, notification_emails=['ops@example.com'])
        with self.assertRaises(Exception):
            VIPRule.objects.create(tenant=tenant, notification_emails=['other@example.com'])

    def test_vip_email_is_a_no_op_without_a_rule(self):
        from apps.sla.services import send_vip_email
        tenant = _tenant()
        send_vip_email(_ticket(tenant))       # must not raise

    def test_breach_email_is_a_no_op_without_configured_addresses(self):
        from apps.sla.services import send_breach_emails
        tenant = _tenant()
        _policy(tenant)
        send_breach_emails(_ticket(tenant))   # must not raise

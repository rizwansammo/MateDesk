"""
Automation engine: field extraction, condition operators, rule selection and
action application.

The engine is invoked directly rather than through the post_save signal, so a
test asserts the engine's own behaviour and not the signal wiring. The
re-entrancy guard is thread-local, so tests that trip it reset it explicitly.
"""
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from apps.tenants.models import Tenant, ClientOrganization
from apps.users.models import User
from apps.tickets.models import Ticket, Reply, SupportGroup
from apps.automation.models import AutomationRule, AutomationLog
from apps.automation.engine import (
    _get_field_value, _evaluate_condition, evaluate_conditions,
    run_automation_rules,
)


def _tenant(slug='auto-co'):
    return Tenant.objects.create(name='Auto Co', slug=slug, is_active=True)


def _user(tenant, role='msp_agent', email=None, vip=False):
    return User.objects.create_user(
        email=email or f'{role}@auto.test', password='x', tenant=tenant,
        first_name='A', last_name=role, role=role, is_vip=vip,
    )


def _ticket(tenant, seq=1, **fields):
    defaults = dict(
        tenant=tenant, ticket_ref=f'T01012026-{seq:04d}', seq=seq,
        subject='Printer broken', status='open', priority='normal',
        requester_name='Bob',
    )
    defaults.update(fields)
    return Ticket.objects.create(**defaults)


def _rule(tenant, *, trigger='ticket_created', conditions=None, actions=None,
          match='all', order=10, active=True, scope='all_orgs', org=None,
          stop=False, name=None):
    return AutomationRule.objects.create(
        tenant=tenant, name=name or f'Rule {order}', is_active=active,
        priority_order=order, trigger=trigger, scope_type=scope, scope_org=org,
        condition_match=match, conditions=conditions or [], actions=actions or [],
        stop_processing=stop,
    )


class FieldExtractionTest(TestCase):
    def setUp(self):
        self.tenant = _tenant()

    def test_text_fields_are_lowercased(self):
        t = _ticket(self.tenant, subject='Printer BROKEN')
        self.assertEqual(_get_field_value(t, 'ticket.title'), 'printer broken')

    def test_status_and_priority_are_returned_verbatim(self):
        t = _ticket(self.tenant, status='in_progress', priority='high')
        self.assertEqual(_get_field_value(t, 'ticket.status'), 'in_progress')
        self.assertEqual(_get_field_value(t, 'ticket.priority'), 'high')

    def test_missing_org_yields_empty_string(self):
        self.assertEqual(_get_field_value(_ticket(self.tenant), 'ticket.client_org'), '')

    def test_org_name_is_lowercased(self):
        org = ClientOrganization.objects.create(tenant=self.tenant, name='ACME Ltd')
        t = _ticket(self.tenant, client_org=org)
        self.assertEqual(_get_field_value(t, 'ticket.client_org'), 'acme ltd')

    def test_group_name(self):
        g = SupportGroup.objects.create(tenant=self.tenant, name='Tier 1')
        t = _ticket(self.tenant, group=g)
        self.assertEqual(_get_field_value(t, 'ticket.group'), 'tier 1')

    def test_is_assigned_is_a_bool(self):
        t = _ticket(self.tenant)
        self.assertIs(_get_field_value(t, 'ticket.is_assigned'), False)
        t.assignee = _user(self.tenant)
        t.save()
        self.assertIs(_get_field_value(t, 'ticket.is_assigned'), True)

    def test_days_open_is_a_float(self):
        t = _ticket(self.tenant)
        Ticket.objects.filter(pk=t.pk).update(
            created_at=timezone.now() - timedelta(days=3))
        t.refresh_from_db()
        v = _get_field_value(t, 'ticket.days_open')
        self.assertIsInstance(v, float)
        self.assertAlmostEqual(v, 3.0, places=1)

    def test_hours_since_update_is_a_float(self):
        t = _ticket(self.tenant)
        Ticket.objects.filter(pk=t.pk).update(
            updated_at=timezone.now() - timedelta(hours=5))
        t.refresh_from_db()
        self.assertAlmostEqual(_get_field_value(t, 'ticket.hours_since_update'), 5.0, places=1)

    def test_reply_count_excludes_system_events(self):
        t = _ticket(self.tenant)
        Reply.objects.create(ticket=t, type='public_reply', body='a')
        Reply.objects.create(ticket=t, type='internal_note', body='b')
        Reply.objects.create(ticket=t, type='system_event', body='c')
        self.assertEqual(_get_field_value(t, 'ticket.reply_count'), 2.0)

    def test_requester_email_domain(self):
        u = _user(self.tenant, role='end_user', email='bob@acme.com')
        t = _ticket(self.tenant, requester=u)
        self.assertEqual(_get_field_value(t, 'requester.email_domain'), 'acme.com')

    def test_requester_is_vip(self):
        vip = _user(self.tenant, role='end_user', email='vip@acme.com', vip=True)
        self.assertIs(_get_field_value(_ticket(self.tenant, requester=vip), 'requester.is_vip'), True)
        self.assertIs(_get_field_value(_ticket(self.tenant, seq=2), 'requester.is_vip'), False)

    def test_reply_is_from_customer(self):
        t = _ticket(self.tenant)
        agent    = _user(self.tenant, role='msp_agent', email='ag@a.io')
        customer = _user(self.tenant, role='end_user',  email='cu@a.io')
        r_agent = Reply.objects.create(ticket=t, type='public_reply', body='x', author=agent)
        r_cust  = Reply.objects.create(ticket=t, type='public_reply', body='y', author=customer)
        self.assertIs(_get_field_value(t, 'reply.is_from_customer', reply=r_agent), False)
        self.assertIs(_get_field_value(t, 'reply.is_from_customer', reply=r_cust), True)

    def test_reply_with_no_author_is_not_from_customer(self):
        t = _ticket(self.tenant)
        r = Reply.objects.create(ticket=t, type='system_event', body='x')
        self.assertIs(_get_field_value(t, 'reply.is_from_customer', reply=r), False)

    def test_unknown_field_yields_empty_string(self):
        self.assertEqual(_get_field_value(_ticket(self.tenant), 'nope.nope'), '')


class ConditionOperatorTest(TestCase):
    def setUp(self):
        self.tenant = _tenant()
        self.ticket = _ticket(self.tenant, subject='Printer is broken')

    def _c(self, field, operator, value):
        return _evaluate_condition(
            self.ticket, {'field': field, 'operator': operator, 'value': value})

    def test_contains(self):
        self.assertTrue(self._c('ticket.title', 'contains', 'broken'))
        self.assertFalse(self._c('ticket.title', 'contains', 'working'))

    def test_contains_is_case_insensitive(self):
        self.assertTrue(self._c('ticket.title', 'contains', 'BROKEN'))

    def test_not_contains(self):
        self.assertTrue(self._c('ticket.title', 'not_contains', 'working'))
        self.assertFalse(self._c('ticket.title', 'not_contains', 'broken'))

    def test_equals_and_not_equals(self):
        self.assertTrue(self._c('ticket.status', 'equals', 'open'))
        self.assertFalse(self._c('ticket.status', 'equals', 'closed'))
        self.assertTrue(self._c('ticket.status', 'not_equals', 'closed'))

    def test_starts_with_and_ends_with(self):
        self.assertTrue(self._c('ticket.title', 'starts_with', 'printer'))
        self.assertTrue(self._c('ticket.title', 'ends_with', 'broken'))
        self.assertFalse(self._c('ticket.title', 'starts_with', 'broken'))

    def test_is_empty_and_is_not_empty(self):
        self.assertTrue(self._c('ticket.level', 'is_empty', ''))
        self.assertTrue(self._c('ticket.title', 'is_not_empty', ''))

    def test_in_list(self):
        self.assertTrue(self._c('ticket.status', 'in_list', 'open, pending'))
        self.assertFalse(self._c('ticket.status', 'in_list', 'solved, closed'))

    def test_in_list_tolerates_whitespace_and_case(self):
        self.assertTrue(self._c('ticket.status', 'in_list', '  OPEN ,pending '))

    def test_unknown_operator_is_false(self):
        self.assertFalse(self._c('ticket.status', 'wat', 'open'))

    def test_numeric_comparisons(self):
        Ticket.objects.filter(pk=self.ticket.pk).update(
            created_at=timezone.now() - timedelta(days=5))
        self.ticket.refresh_from_db()
        self.assertTrue(self._c('ticket.days_open', 'greater_than', '3'))
        self.assertFalse(self._c('ticket.days_open', 'greater_than', '10'))
        self.assertTrue(self._c('ticket.days_open', 'less_than', '10'))

    def test_non_numeric_value_against_a_numeric_field_is_false(self):
        # Must not raise — a misconfigured rule should simply not match.
        self.assertFalse(self._c('ticket.days_open', 'greater_than', 'abc'))

    def test_string_operator_on_a_numeric_field_is_false(self):
        self.assertFalse(self._c('ticket.days_open', 'contains', '3'))

    def test_boolean_field_accepts_several_truthy_spellings(self):
        self.ticket.assignee = _user(self.tenant)
        self.ticket.save()
        for spelling in ('true', 'True', '1', 'yes'):
            self.assertTrue(self._c('ticket.is_assigned', 'equals', spelling), spelling)

    def test_boolean_field_equals_false(self):
        self.assertTrue(self._c('ticket.is_assigned', 'equals', 'false'))

    def test_boolean_field_rejects_non_equality_operators(self):
        self.assertFalse(self._c('ticket.is_assigned', 'contains', 'true'))


class ConditionMatchingTest(TestCase):
    def setUp(self):
        self.tenant = _tenant()
        self.ticket = _ticket(self.tenant, subject='Printer broken', priority='high')

    def test_no_conditions_matches_everything(self):
        # A rule with an empty condition list is an unconditional rule.
        self.assertTrue(evaluate_conditions(_rule(self.tenant), self.ticket))

    def test_match_all_requires_every_condition(self):
        rule = _rule(self.tenant, match='all', conditions=[
            {'field': 'ticket.title',    'operator': 'contains', 'value': 'printer'},
            {'field': 'ticket.priority', 'operator': 'equals',   'value': 'high'},
        ])
        self.assertTrue(evaluate_conditions(rule, self.ticket))

        rule.conditions[1]['value'] = 'low'
        self.assertFalse(evaluate_conditions(rule, self.ticket))

    def test_match_any_requires_one_condition(self):
        rule = _rule(self.tenant, match='any', conditions=[
            {'field': 'ticket.title',    'operator': 'contains', 'value': 'nonsense'},
            {'field': 'ticket.priority', 'operator': 'equals',   'value': 'high'},
        ])
        self.assertTrue(evaluate_conditions(rule, self.ticket))

    def test_match_any_with_no_matches_is_false(self):
        rule = _rule(self.tenant, match='any', conditions=[
            {'field': 'ticket.title',    'operator': 'contains', 'value': 'nonsense'},
            {'field': 'ticket.priority', 'operator': 'equals',   'value': 'low'},
        ])
        self.assertFalse(evaluate_conditions(rule, self.ticket))


class RuleSelectionTest(TestCase):
    """Rule selection, ordering and logging.

    IMPORTANT: every test here creates the ticket BEFORE the rules. Ticket.save()
    fires a post_save signal that already runs the engine with trigger
    'ticket_created', so a rule that exists at creation time has already been
    applied once — which would double every action and every log row. Creating
    the ticket first makes the explicit run below the only execution, so the
    counts asserted are exact.
    """

    def setUp(self):
        self.tenant = _tenant()
        self.org    = ClientOrganization.objects.create(tenant=self.tenant, name='Acme')
        self.other  = ClientOrganization.objects.create(tenant=self.tenant, name='Other')

    def _run(self, ticket, trigger='ticket_created'):
        # The re-entrancy guard is thread-local, and this calls the engine
        # directly rather than through a save, so clear it defensively.
        from apps.automation import engine
        engine._running.active = False
        run_automation_rules(ticket, trigger)

    def test_matching_rule_applies_and_is_logged(self):
        t = _ticket(self.tenant)
        _rule(self.tenant, actions=[{'type': 'set_priority', 'value': 'critical'}])
        self._run(t)
        t.refresh_from_db()
        self.assertEqual(t.priority, 'critical')
        self.assertEqual(AutomationLog.objects.count(), 1)

    def test_inactive_rule_does_not_run(self):
        t = _ticket(self.tenant)
        _rule(self.tenant, active=False,
              actions=[{'type': 'set_priority', 'value': 'critical'}])
        self._run(t)
        t.refresh_from_db()
        self.assertEqual(t.priority, 'normal')
        self.assertEqual(AutomationLog.objects.count(), 0)

    def test_a_different_trigger_does_not_run(self):
        t = _ticket(self.tenant)
        _rule(self.tenant, trigger='ticket_closed',
              actions=[{'type': 'set_priority', 'value': 'critical'}])
        self._run(t, trigger='ticket_created')
        t.refresh_from_db()
        self.assertEqual(t.priority, 'normal')

    def test_specific_org_scope_skips_other_orgs(self):
        t = _ticket(self.tenant, client_org=self.other)
        _rule(self.tenant, scope='specific_org', org=self.org,
              actions=[{'type': 'set_priority', 'value': 'critical'}])
        self._run(t)
        t.refresh_from_db()
        self.assertEqual(t.priority, 'normal')

    def test_specific_org_scope_applies_to_its_own_org(self):
        t = _ticket(self.tenant, client_org=self.org)
        _rule(self.tenant, scope='specific_org', org=self.org,
              actions=[{'type': 'set_priority', 'value': 'critical'}])
        self._run(t)
        t.refresh_from_db()
        self.assertEqual(t.priority, 'critical')

    def test_conditions_gate_the_actions(self):
        t = _ticket(self.tenant)
        _rule(self.tenant,
              conditions=[{'field': 'ticket.title', 'operator': 'contains',
                           'value': 'nonsense'}],
              actions=[{'type': 'set_priority', 'value': 'critical'}])
        self._run(t)
        t.refresh_from_db()
        self.assertEqual(t.priority, 'normal')

    def test_rules_run_in_priority_order(self):
        t = _ticket(self.tenant)
        _rule(self.tenant, order=1, name='First',
              actions=[{'type': 'set_priority', 'value': 'low'}])
        _rule(self.tenant, order=2, name='Second',
              actions=[{'type': 'set_priority', 'value': 'critical'}])
        self._run(t)
        t.refresh_from_db()
        # Both ran; the later rule wins the final value.
        self.assertEqual(t.priority, 'critical')
        self.assertEqual(AutomationLog.objects.count(), 2)

    def test_stop_processing_halts_later_rules(self):
        t = _ticket(self.tenant)
        _rule(self.tenant, order=1, name='First', stop=True,
              actions=[{'type': 'set_priority', 'value': 'low'}])
        _rule(self.tenant, order=2, name='Second',
              actions=[{'type': 'set_priority', 'value': 'critical'}])
        self._run(t)
        t.refresh_from_db()
        self.assertEqual(t.priority, 'low')
        self.assertEqual(AutomationLog.objects.count(), 1)

    def test_rules_are_tenant_scoped(self):
        t = _ticket(self.tenant)
        other_tenant = _tenant('other-co')
        _rule(other_tenant, actions=[{'type': 'set_priority', 'value': 'critical'}])
        self._run(t)
        t.refresh_from_db()
        self.assertEqual(t.priority, 'normal')

    def test_a_rule_with_no_effective_action_is_not_logged(self):
        # AutomationLog is written only when at least one action reported a
        # result, so a no-op rule does not create log noise.
        t = _ticket(self.tenant)
        _rule(self.tenant, actions=[])
        self._run(t)
        self.assertEqual(AutomationLog.objects.count(), 0)

    def test_a_failing_action_does_not_abort_the_rule_set(self):
        # Actions are individually guarded; a malformed one must not stop the rest.
        t = _ticket(self.tenant)
        _rule(self.tenant, order=1, name='Bad', actions=[{'type': 'nonexistent_action'}])
        _rule(self.tenant, order=2, name='Good',
              actions=[{'type': 'set_priority', 'value': 'critical'}])
        self._run(t)
        t.refresh_from_db()
        self.assertEqual(t.priority, 'critical')

    def test_log_records_the_rule_and_trigger(self):
        t = _ticket(self.tenant)
        _rule(self.tenant, name='Escalate',
              actions=[{'type': 'set_priority', 'value': 'critical'}])
        self._run(t)
        log = AutomationLog.objects.get()
        self.assertEqual(log.rule_name, 'Escalate')
        self.assertEqual(log.trigger, 'ticket_created')
        self.assertEqual(log.ticket_ref, t.ticket_ref)


class ReentrancyGuardTest(TestCase):
    """Actions save the ticket, which re-fires post_save. The guard stops that
    recursing — without it a rule whose action re-triggers its own trigger would
    loop until the stack blew."""

    def setUp(self):
        self.tenant = _tenant()

    def tearDown(self):
        from apps.automation import engine
        engine._running.active = False

    def test_a_reentrant_call_is_a_no_op(self):
        from apps.automation import engine
        # Ticket first: a rule present at creation time would already have been
        # applied by the signal, masking what this test checks.
        t = _ticket(self.tenant)
        _rule(self.tenant, actions=[{'type': 'set_priority', 'value': 'critical'}])

        engine._running.active = True            # simulate being mid-run
        run_automation_rules(t, 'ticket_created')
        t.refresh_from_db()
        self.assertEqual(t.priority, 'normal')   # skipped, not applied

    def test_the_guard_is_released_after_a_run(self):
        from apps.automation import engine
        t = _ticket(self.tenant)
        _rule(self.tenant, actions=[{'type': 'set_priority', 'value': 'critical'}])
        engine._running.active = False
        run_automation_rules(t, 'ticket_created')
        self.assertFalse(engine._running.active)

    def test_the_guard_is_released_even_when_a_rule_raises(self):
        from apps.automation import engine
        t = _ticket(self.tenant)
        _rule(self.tenant, actions=[{'type': 'nonexistent_action'}])
        engine._running.active = False
        run_automation_rules(t, 'ticket_created')
        self.assertFalse(engine._running.active)


class SignalIntegrationTest(TestCase):
    """The signal path itself: a rule that exists before the ticket is created
    fires once on creation, with no explicit engine call."""

    def setUp(self):
        self.tenant = _tenant()

    def test_rule_fires_on_ticket_creation_via_the_signal(self):
        _rule(self.tenant, trigger='ticket_created',
              actions=[{'type': 'set_priority', 'value': 'critical'}])
        t = _ticket(self.tenant)
        t.refresh_from_db()
        self.assertEqual(t.priority, 'critical')

    def test_the_signal_run_is_logged_exactly_once(self):
        _rule(self.tenant, trigger='ticket_created',
              actions=[{'type': 'set_priority', 'value': 'critical'}])
        _ticket(self.tenant)
        self.assertEqual(AutomationLog.objects.count(), 1)

    def test_an_action_saving_the_ticket_does_not_loop(self):
        # set_priority saves the ticket, which re-fires post_save. Without the
        # guard this would recurse; it must terminate with a single log row.
        _rule(self.tenant, trigger='ticket_created',
              actions=[{'type': 'set_priority', 'value': 'critical'}])
        _ticket(self.tenant)
        self.assertEqual(AutomationLog.objects.count(), 1)

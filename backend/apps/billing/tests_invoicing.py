"""
Invoice generation — the money arithmetic.

Covers both rate modes, tax, rounding, invoice numbering, tenant isolation and
RBAC. Before these existed the billing app had no tests at all, so an arithmetic
regression would have shipped silently and reached a customer's invoice.

Two of these tests document input-validation gaps rather than correct behaviour;
they are marked and explained inline.
"""
from datetime import date
from decimal import Decimal

from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.tenants.models import Tenant, ClientOrganization
from apps.users.models import User
from apps.tickets.models import Ticket, TimeLog
from apps.billing.models import OrgBillingRate, Invoice


def _tenant(slug='billing-co'):
    return Tenant.objects.create(name='Billing Co', slug=slug, is_active=True)


def _user(tenant, role='msp_owner', email=None):
    return User.objects.create_user(
        email=email or f'{role}@{tenant.slug}.test',
        password='testpass123',
        first_name='Test', last_name=role, role=role, tenant=tenant,
    )


def _client(user):
    c = APIClient()
    c.credentials(HTTP_AUTHORIZATION=f'Bearer {AccessToken.for_user(user)}')
    return c


def _ticket(tenant, org, seq, *, level='', status='solved', subject=None):
    return Ticket.objects.create(
        tenant=tenant, client_org=org,
        ticket_ref=f'T01012026-{seq:04d}', seq=seq,
        subject=subject or f'Ticket {seq}',
        status=status, priority='normal', level=level,
        requester_name='Requester',
    )


@override_settings(DEBUG=True)   # IsTenantUser needs a resolved tenant otherwise
class HourlyInvoiceTest(TestCase):
    """mode='hourly': amount = round(minutes/60 * hourly_rate) per time log."""

    def setUp(self):
        self.tenant = _tenant()
        self.owner  = _user(self.tenant)
        self.org    = ClientOrganization.objects.create(tenant=self.tenant, name='Acme')
        OrgBillingRate.objects.create(
            tenant=self.tenant, org=self.org, mode='hourly',
            currency='USD', hourly_rate=Decimal('90.00'),
        )
        self.ticket = _ticket(self.tenant, self.org, 1)
        self.c = _client(self.owner)

    def _post(self, **over):
        payload = dict(org_id=str(self.org.id), period_from='2026-01-01',
                       period_to='2026-01-31')
        payload.update(over)
        return self.c.post('/api/billing/invoices/', payload, format='json')

    def _log(self, minutes, day=15):
        return TimeLog.objects.create(
            tenant=self.tenant, ticket=self.ticket, agent=self.owner,
            minutes=minutes, date=date(2026, 1, day), description='Work',
        )

    def test_whole_hour(self):
        self._log(60)
        r = self._post()
        self.assertEqual(r.status_code, 201)
        self.assertEqual(Decimal(r.data['subtotal']), Decimal('90.00'))

    def test_partial_hour(self):
        self._log(30)
        r = self._post()
        self.assertEqual(Decimal(r.data['subtotal']), Decimal('45.00'))

    def test_repeating_decimal_is_rounded_half_up(self):
        # 10 min = 1/6 h; 1/6 * 90 = 15 exactly. Use 7 min for a real repeater:
        # 7/60 * 90 = 10.5 -> ROUND_HALF_UP -> 10.50
        self._log(7)
        r = self._post()
        self.assertEqual(Decimal(r.data['subtotal']), Decimal('10.50'))

    def test_rounds_half_up_not_half_even(self):
        # 5 min at 63/h = 5.25 -> 5.25 (no rounding needed); use 1 min at 45/h:
        # 1/60 * 45 = 0.75. Then 1 min at 30/h = 0.50, and 1 min at 15/h = 0.25.
        # The half-up case: 1 min at 90/h = 1.50 exactly. Use 3 min at 25/h:
        # 3/60 * 25 = 1.25 -> quantize(0.01) leaves 1.25. To force a genuine
        # half-cent, 1 min at 0.30/h = 0.005 -> half-up -> 0.01 (half-even -> 0.00).
        OrgBillingRate.objects.filter(org=self.org).update(hourly_rate=Decimal('0.30'))
        self._log(1)
        r = self._post()
        self.assertEqual(Decimal(r.data['subtotal']), Decimal('0.01'))

    def test_each_line_is_rounded_then_summed(self):
        # Per-line rounding is the correct invoicing behaviour: every line is a
        # real charged amount. 3 x (1 min @ 0.30/h) = 3 x 0.01 = 0.03, whereas
        # rounding the sum would give 0.02. This asserts the intended semantics.
        for _ in range(3):
            self._log(1)
        OrgBillingRate.objects.filter(org=self.org).update(hourly_rate=Decimal('0.30'))
        r = self._post()
        self.assertEqual(Decimal(r.data['subtotal']), Decimal('0.03'))
        self.assertEqual(len(r.data['line_items']), 3)

    def test_line_item_carries_minutes_and_agent(self):
        self._log(45)
        r = self._post()
        item = r.data['line_items'][0]
        self.assertEqual(item['minutes'], 45)
        self.assertEqual(Decimal(item['unit_rate']), Decimal('90.00'))
        self.assertEqual(Decimal(item['amount']), Decimal('67.50'))

    def test_logs_outside_the_period_are_excluded(self):
        self._log(60, day=15)              # inside
        self._log(60, day=1)               # inside (boundary)
        TimeLog.objects.create(            # outside
            tenant=self.tenant, ticket=self.ticket, agent=self.owner,
            minutes=600, date=date(2026, 2, 1),
        )
        r = self._post()
        self.assertEqual(Decimal(r.data['subtotal']), Decimal('180.00'))

    def test_period_boundaries_are_inclusive(self):
        self._log(60, day=1)
        self._log(60, day=31)
        r = self._post()
        self.assertEqual(len(r.data['line_items']), 2)

    def test_null_hourly_rate_is_treated_as_zero(self):
        OrgBillingRate.objects.filter(org=self.org).update(hourly_rate=None)
        self._log(60)
        r = self._post()
        self.assertEqual(Decimal(r.data['subtotal']), Decimal('0.00'))

    def test_no_logs_produces_a_zero_invoice(self):
        r = self._post()
        self.assertEqual(r.status_code, 201)
        self.assertEqual(Decimal(r.data['subtotal']), Decimal('0.00'))
        self.assertEqual(len(r.data['line_items']), 0)


@override_settings(DEBUG=True)
class PerTicketInvoiceTest(TestCase):
    """mode='per_ticket': a flat amount per resolved ticket, keyed on its level."""

    def setUp(self):
        self.tenant = _tenant()
        self.owner  = _user(self.tenant)
        self.org    = ClientOrganization.objects.create(tenant=self.tenant, name='Acme')
        OrgBillingRate.objects.create(
            tenant=self.tenant, org=self.org, mode='per_ticket', currency='GBP',
            l1_rate=Decimal('25.00'), l2_rate=Decimal('50.00'), l3_rate=Decimal('100.00'),
        )
        self.c = _client(self.owner)

    def _post(self, **over):
        payload = dict(org_id=str(self.org.id), period_from='2026-01-01',
                       period_to='2026-12-31')
        payload.update(over)
        return self.c.post('/api/billing/invoices/', payload, format='json')

    def test_levels_use_their_own_rate(self):
        _ticket(self.tenant, self.org, 1, level='L1')
        _ticket(self.tenant, self.org, 2, level='L2')
        _ticket(self.tenant, self.org, 3, level='L3')
        r = self._post()
        self.assertEqual(Decimal(r.data['subtotal']), Decimal('175.00'))

    def test_unlevelled_ticket_falls_back_to_l1(self):
        _ticket(self.tenant, self.org, 1, level='')
        r = self._post()
        self.assertEqual(Decimal(r.data['subtotal']), Decimal('25.00'))

    def test_only_solved_and_closed_are_billed(self):
        _ticket(self.tenant, self.org, 1, level='L1', status='solved')
        _ticket(self.tenant, self.org, 2, level='L1', status='closed')
        _ticket(self.tenant, self.org, 3, level='L1', status='open')
        _ticket(self.tenant, self.org, 4, level='L1', status='in_progress')
        r = self._post()
        self.assertEqual(Decimal(r.data['subtotal']), Decimal('50.00'))
        self.assertEqual(len(r.data['line_items']), 2)

    def test_null_level_rate_is_treated_as_zero(self):
        OrgBillingRate.objects.filter(org=self.org).update(l2_rate=None)
        _ticket(self.tenant, self.org, 1, level='L2')
        r = self._post()
        self.assertEqual(Decimal(r.data['subtotal']), Decimal('0.00'))

    def test_currency_comes_from_the_rate(self):
        _ticket(self.tenant, self.org, 1, level='L1')
        r = self._post()
        self.assertEqual(r.data['currency'], 'GBP')


@override_settings(DEBUG=True)
class TaxAndTotalTest(TestCase):
    def setUp(self):
        self.tenant = _tenant()
        self.owner  = _user(self.tenant)
        self.org    = ClientOrganization.objects.create(tenant=self.tenant, name='Acme')
        OrgBillingRate.objects.create(
            tenant=self.tenant, org=self.org, mode='per_ticket',
            l1_rate=Decimal('100.00'),
        )
        _ticket(self.tenant, self.org, 1, level='L1')
        self.c = _client(self.owner)

    def _post(self, tax_rate=None):
        payload = dict(org_id=str(self.org.id), period_from='2026-01-01',
                       period_to='2026-12-31')
        if tax_rate is not None:
            payload['tax_rate'] = tax_rate
        return self.c.post('/api/billing/invoices/', payload, format='json')

    def test_no_tax_rate_means_zero_tax(self):
        r = self._post()
        self.assertEqual(Decimal(r.data['tax_amount']), Decimal('0.00'))
        self.assertEqual(Decimal(r.data['total']), Decimal('100.00'))

    def test_tax_is_a_percentage_of_subtotal(self):
        r = self._post(tax_rate='20')
        self.assertEqual(Decimal(r.data['tax_amount']), Decimal('20.00'))
        self.assertEqual(Decimal(r.data['total']), Decimal('120.00'))

    def test_fractional_tax_rate_rounds_half_up(self):
        # 100 * 17.5 / 100 = 17.50
        r = self._post(tax_rate='17.5')
        self.assertEqual(Decimal(r.data['tax_amount']), Decimal('17.50'))
        self.assertEqual(Decimal(r.data['total']), Decimal('117.50'))

    def test_total_always_equals_subtotal_plus_tax(self):
        r = self._post(tax_rate='7.25')
        sub = Decimal(r.data['subtotal'])
        tax = Decimal(r.data['tax_amount'])
        self.assertEqual(Decimal(r.data['total']), sub + tax)

    def test_tax_rate_is_persisted_on_the_invoice(self):
        r = self._post(tax_rate='20')
        inv = Invoice.objects.get(pk=r.data['id'])
        self.assertEqual(inv.tax_rate, Decimal('20.00'))


@override_settings(DEBUG=True)
class InvoiceNumberingTest(TestCase):
    def setUp(self):
        self.tenant = _tenant()
        self.owner  = _user(self.tenant)
        self.org    = ClientOrganization.objects.create(tenant=self.tenant, name='Acme')
        OrgBillingRate.objects.create(
            tenant=self.tenant, org=self.org, mode='per_ticket', l1_rate=Decimal('10.00'),
        )
        self.c = _client(self.owner)

    def _post(self):
        return self.c.post('/api/billing/invoices/', dict(
            org_id=str(self.org.id), period_from='2026-01-01', period_to='2026-12-31',
        ), format='json')

    def test_numbers_increment(self):
        a = self._post().data['invoice_number']
        b = self._post().data['invoice_number']
        self.assertNotEqual(a, b)
        self.assertEqual(int(b.split('-')[-1]), int(a.split('-')[-1]) + 1)

    def test_number_is_zero_padded_to_four_digits(self):
        # Padding is what makes the ORDER BY invoice_number DESC lookup correct:
        # lexicographic ordering only matches numeric ordering while the width is
        # fixed. This holds to 9999 invoices per tenant per year.
        num = self._post().data['invoice_number']
        self.assertRegex(num, r'^INV-\d{4}-\d{4}$')

    def test_sequence_is_per_tenant(self):
        other        = _tenant('other-co')
        other_owner  = _user(other)
        other_org    = ClientOrganization.objects.create(tenant=other, name='Other')
        OrgBillingRate.objects.create(
            tenant=other, org=other_org, mode='per_ticket', l1_rate=Decimal('10.00'),
        )
        self._post()                      # tenant A -> 0001
        r = _client(other_owner).post('/api/billing/invoices/', dict(
            org_id=str(other_org.id), period_from='2026-01-01', period_to='2026-12-31',
        ), format='json')
        self.assertEqual(int(r.data['invoice_number'].split('-')[-1]), 1)


@override_settings(DEBUG=True)
class InvoiceAccessControlTest(TestCase):
    def setUp(self):
        self.tenant = _tenant()
        self.owner  = _user(self.tenant)
        self.org    = ClientOrganization.objects.create(tenant=self.tenant, name='Acme')
        OrgBillingRate.objects.create(
            tenant=self.tenant, org=self.org, mode='per_ticket', l1_rate=Decimal('10.00'),
        )

    def _post(self, client, org_id=None):
        return client.post('/api/billing/invoices/', dict(
            org_id=str(org_id or self.org.id),
            period_from='2026-01-01', period_to='2026-12-31',
        ), format='json')

    def test_client_user_cannot_create_an_invoice(self):
        end_user = _user(self.tenant, role='end_user')
        self.assertEqual(self._post(_client(end_user)).status_code, 403)

    def test_client_owner_cannot_create_an_invoice(self):
        co = _user(self.tenant, role='client_owner')
        self.assertEqual(self._post(_client(co)).status_code, 403)

    def test_msp_agent_can_create_an_invoice(self):
        agent = _user(self.tenant, role='msp_agent')
        self.assertEqual(self._post(_client(agent)).status_code, 201)

    def test_cannot_invoice_another_tenants_org(self):
        other     = _tenant('other-co')
        other_org = ClientOrganization.objects.create(tenant=other, name='Other')
        r = self._post(_client(self.owner), org_id=other_org.id)
        self.assertEqual(r.status_code, 404)

    def test_unauthenticated_is_rejected(self):
        self.assertIn(self._post(APIClient()).status_code, (401, 403))


@override_settings(DEBUG=True)
class InvoiceValidationTest(TestCase):
    def setUp(self):
        self.tenant = _tenant()
        self.owner  = _user(self.tenant)
        self.org    = ClientOrganization.objects.create(tenant=self.tenant, name='Acme')
        self.c = _client(self.owner)

    def _post(self, **over):
        payload = dict(org_id=str(self.org.id), period_from='2026-01-01',
                       period_to='2026-12-31')
        payload.update(over)
        return self.c.post('/api/billing/invoices/', payload, format='json')

    def test_missing_required_fields_is_400(self):
        r = self.c.post('/api/billing/invoices/', {}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_org_without_a_configured_rate_is_400(self):
        r = self._post()
        self.assertEqual(r.status_code, 400)
        self.assertIn('billing rate', r.data['detail'].lower())

    def test_unknown_org_is_404(self):
        r = self._post(org_id='00000000-0000-0000-0000-000000000000')
        self.assertEqual(r.status_code, 404)

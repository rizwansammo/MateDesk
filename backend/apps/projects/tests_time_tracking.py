"""Phase 6 isolated tests for project staff time and explicit invoice integrity."""
from datetime import timedelta
from decimal import Decimal
from uuid import uuid4

from django.core.exceptions import ValidationError as ModelValidationError
from django.test import TestCase, override_settings
from django.utils import timezone

from apps.billing.models import Invoice, InvoiceLineItem, OrgBillingRate
from apps.tenants.models import Tenant, ClientOrganization
from apps.tickets.models import Ticket, TimeLog
from .models import (
    Project, ProjectMember, WorkItem, ProjectTimeEntry, ProjectTimeRate,
    ProjectTimeInvoiceRun,
)
from .tests_requests import actor, client_for


@override_settings(DEBUG=True, PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class ProjectTimePhase6Tests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Phase6 Tenant', slug='timephase6')
        self.other_tenant = Tenant.objects.create(name='Foreign Phase6', slug='timephase6foreign')
        self.org = ClientOrganization.objects.create(tenant=self.tenant, name='Client A')
        self.other_org = ClientOrganization.objects.create(tenant=self.tenant, name='Client B')
        self.foreign_org = ClientOrganization.objects.create(tenant=self.other_tenant, name='Foreign Client')
        self.owner = actor(self.tenant, 'owner@time6.test', 'msp_owner')
        self.manager = actor(self.tenant, 'manager@time6.test', 'msp_agent')
        self.agent = actor(self.tenant, 'contributor@time6.test', 'msp_agent')
        self.outsider = actor(self.tenant, 'outsider@time6.test', 'msp_agent')
        self.client = actor(self.tenant, 'client@time6.test', 'client_owner', self.org)
        self.foreign = actor(self.other_tenant, 'foreign@time6.test', 'msp_owner')
        self.project = Project.objects.create(
            tenant=self.tenant, client_org=self.org, key='TIME6',
            name='Time Tracking', created_by=self.owner, status='active',
            visibility='client',
        )
        for member, role in [(self.manager, 'manager'), (self.agent, 'contributor'),
                             (self.client, 'client_reviewer')]:
            ProjectMember.objects.create(project=self.project, user=member, role=role)
        self.item = WorkItem.objects.create(
            project=self.project, number=1, title='API Implementation',
            created_by=self.owner, visibility='client',
        )
        self.second = WorkItem.objects.create(
            project=self.project, number=2, title='Code Review',
            created_by=self.owner, visibility='internal',
        )
        self.day = timezone.localdate() - timedelta(days=5)
        self.c_owner = client_for(self.owner)
        self.c_manager = client_for(self.manager)
        self.c_agent = client_for(self.agent)
        self.c_outsider = client_for(self.outsider)
        self.c_client = client_for(self.client)
        self.c_foreign = client_for(self.foreign)
        self.logs = f'/api/projects/{self.project.pk}/time-entries/'
        self.summary = f'/api/projects/{self.project.pk}/time-summary/'
        self.rate = f'/api/projects/{self.project.pk}/time-rate/'
        self.invoices = f'/api/projects/{self.project.pk}/time-invoices/'

    def log(self, api=None, *, work_item_id=None, minutes=60, billable=True,
            description='Build a project feature', spent_on=None, staff_id=None,
            request_id=None):
        payload = dict(
            work_item_id=str(work_item_id or self.item.pk),
            minutes=minutes, billable=billable, description=description,
            spent_on=(spent_on or self.day).isoformat(),
            request_id=str(request_id or uuid4()),
        )
        if staff_id is not None:
            payload['staff_id'] = str(staff_id)
        return (api or self.c_manager).post(self.logs, payload, format='json')

    def set_rate(self, *, rate='90.00', currency='USD', api=None):
        return (api or self.c_manager).put(
            self.rate, dict(hourly_rate=rate, currency=currency), format='json',
        )

    def review(self, pk, *, decision='approved', api=None, note=''):
        return (api or self.c_manager).post(
            f'{self.logs}{pk}/review/', dict(decision=decision, note=note), format='json',
        )

    def invoice(self, *, request_id=None, from_date=None, to_date=None, tax_rate='0',
                api=None):
        return (api or self.c_manager).post(
            self.invoices,
            dict(period_from=(from_date or self.day).isoformat(),
                 period_to=(to_date or self.day).isoformat(),
                 tax_rate=tax_rate, request_id=str(request_id or uuid4())),
            format='json',
        )

    def test_manager_time_is_approved_and_contributor_time_needs_review(self):
        manager_entry = self.log()
        contributor_entry = self.log(self.c_agent)
        self.assertEqual(manager_entry.status_code, 201, manager_entry.data)
        self.assertEqual(contributor_entry.status_code, 201, contributor_entry.data)
        self.assertEqual(manager_entry.data['review_state'], 'approved')
        self.assertEqual(contributor_entry.data['review_state'], 'pending')
        self.assertEqual(ProjectTimeEntry.objects.count(), 2)

    def test_contributor_only_sees_own_entries_and_not_costs(self):
        self.log()
        own = self.log(self.c_agent)
        self.assertEqual(self.c_manager.get(self.logs).data['count'], 2)
        row = self.c_agent.get(self.logs)
        self.assertEqual(row.data['count'], 1)
        self.assertEqual(row.data['results'][0]['id'], own.data['id'])
        summary = self.c_agent.get(self.summary).data
        self.assertEqual(summary['total_minutes'], 60)
        self.assertNotIn('hourly_rate', summary)
        self.assertNotIn('estimated_unbilled_amount', summary)

    def test_client_has_no_access_to_project_time_or_invoices(self):
        for url in (self.logs, self.summary, self.rate, self.invoices):
            self.assertEqual(self.c_client.get(url).status_code, 403)

    def test_agent_without_membership_cannot_access(self):
        self.assertEqual(self.c_outsider.get(self.logs).status_code, 404)
        self.assertEqual(self.log(self.c_outsider).status_code, 404)

    def test_other_tenant_is_isolated(self):
        for url in (self.logs, self.summary, self.rate, self.invoices):
            self.assertEqual(self.c_foreign.get(url).status_code, 404)
        self.assertEqual(self.log(self.c_foreign).status_code, 404)

    def test_contributor_cannot_log_on_behalf_of_another_staff(self):
        self.assertEqual(self.log(self.c_agent, staff_id=self.manager.pk).status_code, 403)

    def test_manager_can_log_on_behalf_of_assigned_staff(self):
        result = self.log(staff_id=self.agent.pk)
        self.assertEqual(result.status_code, 201, result.data)
        self.assertEqual(result.data['staff_id'], str(self.agent.pk))
        self.assertEqual(result.data['review_state'], 'approved')

    def test_logging_for_nonmember_is_blocked(self):
        self.assertEqual(self.log(staff_id=self.outsider.pk).status_code, 400)

    def test_cross_project_item_is_blocked(self):
        other = Project.objects.create(
            tenant=self.tenant, client_org=self.other_org, key='TIMEOTHER',
            name='Other Project', created_by=self.owner,
        )
        item = WorkItem.objects.create(
            project=other, number=1, title='Not our item', created_by=self.owner,
        )
        self.assertEqual(self.log(work_item_id=item.id).status_code, 404)

    def test_invalid_minutes_and_future_dates_are_rejected(self):
        self.assertEqual(self.log(minutes=0).status_code, 400)
        self.assertEqual(self.log(minutes=-5).status_code, 400)
        self.assertEqual(self.log(minutes=1441).status_code, 400)
        self.assertEqual(self.log(spent_on=timezone.localdate()+timedelta(days=1)).status_code, 400)

    def test_time_log_requires_a_description(self):
        self.assertEqual(self.log(description='  ').status_code, 400)

    def test_log_idempotency_and_conflict(self):
        key = uuid4()
        self.assertEqual(self.log(request_id=key).status_code, 201)
        self.assertEqual(self.log(request_id=key).status_code, 200)
        self.assertEqual(self.log(request_id=key, minutes=15).status_code, 400)
        self.assertEqual(ProjectTimeEntry.objects.count(), 1)

    def test_staff_can_edit_own_time_but_requires_reapproval(self):
        result = self.log(self.c_agent)
        self.assertEqual(self.review(result.data['id']).status_code, 200)
        update = self.c_agent.patch(self.logs + result.data['id'] + '/', {
            'minutes': 90,
        }, format='json')
        self.assertEqual(update.status_code, 200, update.data)
        self.assertEqual(update.data['review_state'], 'pending')
        self.assertEqual(update.data['minutes'], 90)

    def test_agent_cannot_edit_manager_entry(self):
        entry = self.log()
        self.assertEqual(self.c_agent.patch(
            self.logs + entry.data['id']+'/', {'minutes': 100}, format='json',
        ).status_code, 404)

    def test_only_manager_can_approve_or_reject(self):
        entry = self.log(self.c_agent)
        self.assertEqual(self.review(entry.data['id'], api=self.c_agent).status_code, 403)
        response = self.review(entry.data['id'], decision='rejected', note='Duplicate')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['review_state'], 'rejected')
        self.assertEqual(response.data['review_note'], 'Duplicate')
        self.assertEqual(self.review(entry.data['id']).status_code, 200)

    def test_nonbillable_time_is_not_invoiced(self):
        self.set_rate()
        self.log(minutes=30, billable=False)
        self.log(minutes=60, billable=True)
        invoice = self.invoice()
        self.assertEqual(invoice.status_code, 201, invoice.data)
        self.assertEqual(len(invoice.data['line_items']), 1)
        self.assertEqual(Decimal(invoice.data['subtotal']), Decimal('90.00'))
        self.assertEqual(ProjectTimeEntry.objects.filter(invoice_line__isnull=True).count(), 1)

    def test_pending_time_is_not_invoiced(self):
        self.set_rate()
        pending = self.log(self.c_agent)
        self.assertEqual(self.invoice().status_code, 400)
        self.review(pending.data['id'])
        self.assertEqual(self.invoice().status_code, 201)

    def test_no_hourly_rate_blocks_invoice(self):
        self.log()
        self.assertEqual(self.invoice().status_code, 400)
        self.assertEqual(Invoice.objects.count(), 0)

    def test_rate_permissions_and_bdt_currency(self):
        self.assertEqual(self.set_rate(api=self.c_agent).status_code, 403)
        self.assertEqual(self.set_rate(rate='0').status_code, 400)
        self.assertEqual(self.set_rate(currency='BDT').status_code, 200)
        self.assertEqual(self.c_manager.get(self.rate).data['currency'], 'BDT')

    def test_rate_preserves_project_specific_pricing(self):
        self.set_rate(rate='110.00')
        OrgBillingRate.objects.create(
            tenant=self.tenant, org=self.org, mode='hourly',
            hourly_rate=Decimal('30.00'), currency='EUR',
        )
        self.log(minutes=60)
        response = self.invoice()
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['currency'], 'USD')
        self.assertEqual(Decimal(response.data['subtotal']), Decimal('110.00'))

    def test_invoice_money_uses_per_line_half_up_rounding(self):
        self.set_rate(rate='0.30')
        self.log(minutes=1)
        self.log(minutes=1, work_item_id=self.second.pk)
        self.log(minutes=1, description='Third minute')
        result = self.invoice(tax_rate='10')
        self.assertEqual(result.status_code, 201, result.data)
        self.assertEqual(Decimal(result.data['subtotal']), Decimal('0.03'))
        self.assertEqual(Decimal(result.data['tax_amount']), Decimal('0.00'))
        self.assertEqual(Decimal(result.data['total']), Decimal('0.03'))
        self.assertEqual(len(result.data['line_items']), 3)

    def test_invoice_tax_snapshot_and_line_audit(self):
        self.set_rate(rate='80.00', currency='BDT')
        self.log(minutes=90, description='Implement BDT checkout')
        result = self.invoice(tax_rate='15')
        self.assertEqual(result.status_code, 201, result.data)
        self.assertEqual(result.data['status'], 'draft')
        self.assertEqual(result.data['currency'], 'BDT')
        self.assertEqual(Decimal(result.data['subtotal']), Decimal('120.00'))
        self.assertEqual(Decimal(result.data['tax_amount']), Decimal('18.00'))
        self.assertEqual(Decimal(result.data['total']), Decimal('138.00'))
        line = result.data['line_items'][0]
        self.assertEqual(line['minutes'], 90)
        self.assertEqual(line['ticket_ref'], '')
        self.assertIn('TIME6', line['description'])
        self.assertEqual(line['log_date'].isoformat() if hasattr(line['log_date'], 'isoformat') else line['log_date'],
                         self.day.isoformat())

    def test_invoice_excludes_logs_outside_date_window(self):
        self.set_rate()
        self.log(minutes=30)
        self.log(minutes=30, spent_on=self.day-timedelta(days=2))
        result = self.invoice()
        self.assertEqual(len(result.data['line_items']), 1)

    def test_invalid_invoice_period_and_tax_are_rejected(self):
        self.set_rate()
        self.log()
        self.assertEqual(self.invoice(from_date=self.day+timedelta(days=1),
                                      to_date=self.day).status_code, 400)
        self.assertEqual(self.invoice(tax_rate='-1').status_code, 400)
        self.assertEqual(self.invoice(tax_rate='120').status_code, 400)
        self.assertEqual(Invoice.objects.count(), 0)

    def test_invoice_idempotent_and_replay_does_not_double_bill(self):
        self.set_rate()
        self.log()
        key = uuid4()
        first = self.invoice(request_id=key)
        second = self.invoice(request_id=key)
        self.assertEqual(first.status_code, 201, first.data)
        self.assertEqual(second.status_code, 200, second.data)
        self.assertEqual(first.data['id'], second.data['id'])
        self.assertEqual(self.invoice(request_id=key, tax_rate='15').status_code, 400)
        self.assertEqual(self.invoice().status_code, 400)
        self.assertEqual(Invoice.objects.count(), 1)
        self.assertEqual(InvoiceLineItem.objects.count(), 1)

    def test_invoiced_time_is_immutable(self):
        self.set_rate()
        entry = self.log()
        self.invoice()
        self.assertEqual(self.c_manager.patch(
            self.logs + entry.data['id']+'/', {'minutes': 20}, format='json',
        ).status_code, 400)
        self.assertEqual(self.review(entry.data['id'], decision='rejected').status_code, 400)
        row = ProjectTimeEntry.objects.get(pk=entry.data['id'])
        row.minutes = 12
        with self.assertRaises(ModelValidationError):
            row.save()

    def test_draft_invoice_delete_requires_project_void(self):
        self.set_rate()
        self.log()
        invoice = self.invoice()
        self.assertEqual(self.c_manager.delete(
            '/api/billing/invoices/'+invoice.data['id']+'/',
        ).status_code, 409)
        url = self.invoices + invoice.data['id'] + '/void/'
        self.assertEqual(self.c_manager.post(url, {}, format='json').status_code, 204)
        self.assertEqual(Invoice.objects.count(), 0)
        self.assertFalse(ProjectTimeEntry.objects.filter(invoice_line__isnull=False).exists())
        self.assertEqual(self.invoice().status_code, 201)

    def test_sent_and_paid_invoices_cannot_be_voided(self):
        self.set_rate()
        self.log()
        inv = self.invoice()
        path = '/api/billing/invoices/' + inv.data['id'] + '/'
        self.assertEqual(self.c_manager.patch(
            path, {'status': 'sent'}, format='json',
        ).status_code, 200)
        self.assertEqual(self.c_manager.post(
            self.invoices + inv.data['id']+'/void/', {}, format='json',
        ).status_code, 400)
        self.assertEqual(self.c_manager.patch(
            path, {'status': 'draft'}, format='json',
        ).status_code, 409)
        self.assertEqual(self.c_manager.patch(
            path, {'status': 'paid'}, format='json',
        ).status_code, 200)
        self.assertEqual(self.c_manager.delete(path).status_code, 409)
        self.assertEqual(self.c_manager.patch(
            path, {'status': 'sent'}, format='json',
        ).status_code, 409)

    def test_billed_time_snapshot_unchanged_after_rate_update(self):
        self.set_rate(rate='90')
        self.log()
        result = self.invoice()
        self.set_rate(rate='180')
        original = Invoice.objects.get(pk=result.data['id'])
        self.assertEqual(original.subtotal, Decimal('90'))
        self.assertEqual(original.line_items.first().unit_rate, Decimal('90'))

    def test_summary_totals_and_billable_flags(self):
        self.log(minutes=30, billable=True)
        self.log(minutes=45, billable=False)
        self.log(self.c_agent, minutes=20, billable=True)
        summary = self.c_manager.get(self.summary).data
        self.assertEqual(summary['entries'], 3)
        self.assertEqual(summary['total_minutes'], 95)
        self.assertEqual(summary['billable_minutes'], 50)
        self.assertEqual(summary['non_billable_minutes'], 45)
        self.assertEqual(summary['pending_minutes'], 20)
        self.assertEqual(summary['approved_minutes'], 75)
        self.assertEqual(summary['ready_minutes'], 30)

    def test_project_completed_still_supports_final_reconciliation(self):
        self.project.status = 'completed'
        self.project.save()
        self.set_rate()
        self.assertEqual(self.log().status_code, 201)
        self.assertEqual(self.invoice().status_code, 201)

    def test_archived_project_rejects_new_or_modified_entries(self):
        result = self.log()
        self.project.status = 'archived'
        self.project.save()
        self.assertEqual(self.log().status_code, 403)
        self.assertEqual(self.c_agent.patch(
            self.logs + result.data['id']+'/', {'minutes': 20}, format='json',
        ).status_code, 404)
        self.assertEqual(self.c_manager.get(self.logs).data['count'], 1)

    def test_work_item_log_pagination(self):
        for i in range(26):
            self.assertEqual(self.log(description=f'Work item {i}').status_code, 201)
        a = self.c_manager.get(self.logs+'?page=1')
        b = self.c_manager.get(self.logs+'?page=2')
        self.assertEqual(a.data['count'], 26)
        self.assertEqual(len(a.data['results']), 25)
        self.assertEqual(len(b.data['results']), 1)

    def test_unauthenticated_time_and_invoice_access_rejected(self):
        from rest_framework.test import APIClient
        c = APIClient()
        for url in (self.logs, self.summary, self.rate, self.invoices):
            self.assertIn(c.get(url).status_code, (401, 403))

    def test_invoice_entry_cannot_cross_tenant_direct_model(self):
        row = ProjectTimeEntry(
            project=self.project, work_item=self.item,
            staff=self.foreign, staff_name='Foreign',
            spent_on=self.day, minutes=60,
            description='Invalid', logged_by=self.manager,
            request_id=uuid4(),
        )
        with self.assertRaises(ModelValidationError):
            row.save()

    def test_project_invoice_and_ticket_invoice_remain_separate(self):
        self.set_rate(rate='100')
        self.log(minutes=60)
        inv = self.invoice()
        self.assertEqual(inv.status_code, 201)
        self.assertEqual(inv.data['line_items'][0]['ticket_ref'], '')
        self.assertEqual(Ticket.objects.count(), 0)
        self.assertEqual(TimeLog.objects.count(), 0)
        self.assertEqual(ProjectTimeInvoiceRun.objects.count(), 1)

    def test_financial_invoice_endpoints_do_not_expose_client_data(self):
        self.set_rate()
        self.log()
        invoice = self.invoice()
        self.assertEqual(self.c_client.get('/api/billing/invoices/').status_code, 403)
        self.assertEqual(self.c_client.get(
            f"/api/billing/invoices/{invoice.data['id']}/pdf/",
        ).status_code, 403)

    def test_unrelated_agent_cannot_view_other_project_financial_invoice(self):
        self.set_rate()
        self.log()
        inv = self.invoice()
        self.assertEqual(inv.status_code, 201)
        listing = self.c_outsider.get('/api/billing/invoices/')
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(len(listing.data), 0)
        inv_path = f"/api/billing/invoices/{inv.data['id']}/"
        self.assertEqual(self.c_outsider.patch(
            inv_path, {'status': 'sent'}, format='json',
        ).status_code, 403)
        self.assertEqual(self.c_outsider.delete(inv_path).status_code, 403)
        self.assertEqual(self.c_outsider.get(inv_path+'pdf/').status_code, 403)

    def test_project_manager_can_see_project_billing_invoice(self):
        self.set_rate()
        self.log()
        inv = self.invoice()
        self.assertEqual(inv.status_code, 201)
        listing = self.c_manager.get('/api/billing/invoices/')
        self.assertEqual(len(listing.data), 1)
        self.assertEqual(listing.data[0]['id'], inv.data['id'])

    def test_historical_deactivated_staff_entry_can_be_approved(self):
        self.log(self.c_agent)
        entry = ProjectTimeEntry.objects.get()
        self.agent.is_active = False
        self.agent.save(update_fields=['is_active'])
        result = self.review(str(entry.pk))
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(result.data['review_state'], 'approved')
        self.assertEqual(result.data['staff_name'], entry.staff_name)

    def test_archived_project_cannot_reprice_or_create_invoice(self):
        self.set_rate()
        self.log()
        self.project.status = 'archived'
        self.project.save()
        self.assertEqual(self.set_rate(rate='200').status_code, 403)
        self.assertEqual(self.invoice().status_code, 403)

    def test_invalid_work_item_filter_and_cross_project_invoice_lookup(self):
        self.assertEqual(self.c_manager.get(
            self.logs+'?work_item_id=bad-id',
        ).status_code, 400)
        self.set_rate()
        self.log()
        inv = self.invoice()
        other = Project.objects.create(
            tenant=self.tenant, client_org=self.other_org, key='OTHER6',
            name='Other project', created_by=self.owner,
        )
        url = f'/api/projects/{other.pk}/time-invoices/{inv.data["id"]}/void/'
        self.assertEqual(self.c_owner.post(url, {}, format='json').status_code, 404)

    def test_project_invoice_pdf_shows_approved_hourly_lines(self):
        self.set_rate(rate='125.00', currency='BDT')
        self.log(minutes=60, description='Review & implementation')
        invoice = self.invoice()
        self.assertEqual(invoice.status_code, 201, invoice.data)
        self.assertEqual(invoice.data['source'], 'project_time')
        result = self.c_manager.get(
            f"/api/billing/invoices/{invoice.data['id']}/pdf/",
        )
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result['Content-Type'], 'application/pdf')
        self.assertTrue(result.content.startswith(b'%PDF-'))

    def test_project_rate_config_does_not_change_ticket_rate(self):
        rate = OrgBillingRate.objects.create(
            tenant=self.tenant, org=self.org, mode='hourly',
            currency='USD', hourly_rate=Decimal('20.00'),
        )
        self.assertEqual(self.set_rate(rate='110.00', currency='BDT').status_code, 200)
        rate.refresh_from_db()
        self.assertEqual(rate.hourly_rate, Decimal('20.00'))
        self.assertEqual(rate.currency, 'USD')

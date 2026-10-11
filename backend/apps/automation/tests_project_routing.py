"""Phase 5: Project routing in the existing Automation Engine."""
import uuid

from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.automation.engine import dry_run_automation_rules, run_automation_rules, _apply_action
from apps.automation.models import AutomationLog, AutomationRule
from apps.projects.models import Project, ProjectMember, TicketProjectAssociation, WorkItem, TicketWorkItemLink
from apps.tenants.models import ClientOrganization, Tenant
from apps.tickets.models import Ticket
from apps.users.models import User


def actor(tenant, role, email):
    return User.objects.create_user(
        tenant=tenant, role=role, email=email, password='secret',
        first_name='User',
    )


def api(user):
    token = AccessToken.for_user(user)
    token['tenant_id'] = str(user.tenant_id)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    client.defaults['SERVER_NAME'] = 'localhost'
    return client


@override_settings(DEBUG=True)
class ProjectAutomationTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Neta MSP', slug='auto-project-msp')
        self.other_tenant = Tenant.objects.create(name='Other MSP', slug='auto-project-foreign')
        self.org = ClientOrganization.objects.create(tenant=self.tenant, name='Acme Ltd', is_active=True)
        self.other_org = ClientOrganization.objects.create(tenant=self.tenant, name='Other Client', is_active=True)
        self.foreign_org = ClientOrganization.objects.create(
            tenant=self.other_tenant, name='Foreign Client', is_active=True,
        )
        self.walk_in_org = ClientOrganization.objects.create(
            tenant=self.tenant, name='Walk-In', is_active=True,
        )
        self.owner = actor(self.tenant, 'msp_owner', 'auto-owner@example.test')
        self.manager = actor(self.tenant, 'msp_agent', 'auto-manager@example.test')
        self.nonmember = actor(self.tenant, 'msp_agent', 'auto-nonmember@example.test')
        self.client_user = actor(self.tenant, 'client_owner', 'auto-client@example.test')
        self.client_user.client_org = self.org
        self.client_user.save()
        self.foreign_owner = actor(self.other_tenant, 'msp_owner', 'auto-foreign@example.test')
        self.project = Project.objects.create(
            tenant=self.tenant, client_org=self.org, key='SHOP', name='Checkout Work',
            created_by=self.owner,
        )
        self.second_project = Project.objects.create(
            tenant=self.tenant, client_org=self.org, key='APP', name='Mobile Checkout',
            created_by=self.owner,
        )
        self.wrong_org_project = Project.objects.create(
            tenant=self.tenant, client_org=self.other_org, key='CLIENTB',
            name='Client B Project', created_by=self.owner,
        )
        self.foreign_project = Project.objects.create(
            tenant=self.other_tenant, client_org=self.foreign_org,
            key='FOREIGN', name='Outside', created_by=self.foreign_owner,
        )
        self.walk_in_project = Project.objects.create(
            tenant=self.tenant, client_org=self.walk_in_org,
            key='WALK', name='Walk In', created_by=self.owner,
        )
        ProjectMember.objects.create(
            project=self.project, user=self.manager, role='manager',
        )
        self.owner_api = api(self.owner)

    def ticket(self, number=1, org=None, subject='Checkout error', body='Payment fails'):
        return Ticket.objects.create(
            tenant=self.tenant, ticket_ref=f'T11102026-{number:04d}', seq=number,
            client_org=org if org is not None else self.org,
            subject=subject, description=body,
        )

    def rule(self, project=None, order=10, name=None, conditions=None, match='all',
             scope='all_orgs', org=None, stop=False, trigger='ticket_created'):
        return AutomationRule.objects.create(
            tenant=self.tenant, name=name or f'Project Rule {order}', trigger=trigger,
            priority_order=order, scope_type=scope, scope_org=org,
            condition_match=match,
            conditions=conditions if conditions is not None else [
                {'field': 'ticket.title', 'operator': 'contains', 'value': 'checkout'},
            ],
            actions=[{
                'type': 'link_to_project',
                'value': str((project or self.project).id),
            }],
            stop_processing=stop,
        )

    def execute(self, ticket, trigger='ticket_created'):
        from apps.automation import engine
        engine._running.active = False
        run_automation_rules(ticket, trigger)

    def test_creates_project_association_with_audit_log(self):
        ticket = self.ticket()
        self.rule()
        self.execute(ticket)
        link = TicketProjectAssociation.objects.get(ticket=ticket)
        self.assertEqual(link.project, self.project)
        self.assertEqual(link.source, 'automation')
        self.assertIsNone(link.linked_by)
        self.assertEqual(AutomationLog.objects.count(), 1)
        self.assertIn('Linked to Project: SHOP', AutomationLog.objects.get().actions_taken[0])
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, 'open')
        self.assertEqual(ticket.description, 'Payment fails')
        self.assertEqual(WorkItem.objects.count(), 0)
        self.assertEqual(TicketWorkItemLink.objects.count(), 0)

    def test_subject_and_body_conditions_require_both_with_and(self):
        good = self.ticket(number=1)
        bad = self.ticket(number=2, subject='Checkout issue', body='Looks fine')
        self.rule(conditions=[
            {'field': 'ticket.title', 'operator': 'contains', 'value': 'CHECKOUT'},
            {'field': 'ticket.description', 'operator': 'contains', 'value': 'payment'},
        ])
        self.execute(good)
        self.execute(bad)
        self.assertTrue(TicketProjectAssociation.objects.filter(ticket=good).exists())
        self.assertFalse(TicketProjectAssociation.objects.filter(ticket=bad).exists())

    def test_subject_or_body_conditions_work_with_any(self):
        ticket = self.ticket(subject='Printer issue', body='Checkout payment error')
        self.rule(match='any', conditions=[
            {'field': 'ticket.title', 'operator': 'contains', 'value': 'checkout'},
            {'field': 'ticket.description', 'operator': 'contains', 'value': 'payment'},
        ])
        self.execute(ticket)
        self.assertTrue(TicketProjectAssociation.objects.filter(ticket=ticket).exists())

    def test_non_matching_ticket_is_not_linked_or_logged(self):
        ticket = self.ticket(subject='Printer issue', body='Needs ink')
        self.rule()
        self.execute(ticket)
        self.assertFalse(TicketProjectAssociation.objects.exists())
        self.assertEqual(AutomationLog.objects.count(), 0)

    def test_foreign_organization_is_never_linked(self):
        ticket = self.ticket(org=self.other_org)
        self.rule()
        self.execute(ticket)
        self.assertFalse(TicketProjectAssociation.objects.exists())

    def test_rules_with_specific_org_scope_do_not_match_other_orgs(self):
        ticket = self.ticket(org=self.other_org)
        self.rule(scope='specific_org', org=self.org)
        self.execute(ticket)
        self.assertFalse(TicketProjectAssociation.objects.exists())

    def test_orgless_ticket_is_never_linked(self):
        ticket = self.ticket()
        Ticket.objects.filter(pk=ticket.pk).update(client_org=None)
        ticket.refresh_from_db()
        self.rule()
        self.execute(ticket)
        self.assertFalse(TicketProjectAssociation.objects.exists())

    def test_walk_in_organization_is_not_eligible(self):
        ticket = self.ticket(org=self.walk_in_org)
        self.rule(project=self.walk_in_project)
        self.execute(ticket)
        self.assertFalse(TicketProjectAssociation.objects.exists())

    def test_manually_linked_project_is_never_overridden(self):
        ticket = self.ticket()
        TicketProjectAssociation.objects.create(
            ticket=ticket, project=self.second_project,
            linked_by=self.owner, source='manual',
        )
        self.rule()
        self.execute(ticket)
        link = TicketProjectAssociation.objects.get(ticket=ticket)
        self.assertEqual(link.project_id, self.second_project.id)
        self.assertEqual(link.source, 'manual')
        self.assertEqual(AutomationLog.objects.count(), 0)

    def test_first_matching_project_rule_wins_by_order(self):
        ticket = self.ticket()
        self.rule(project=self.second_project, order=20, name='Later')
        self.rule(project=self.project, order=5, name='First')
        self.execute(ticket)
        self.assertEqual(TicketProjectAssociation.objects.get().project, self.project)
        self.assertEqual(AutomationLog.objects.count(), 1)

    def test_duplicate_execution_is_idempotent(self):
        ticket = self.ticket()
        self.rule()
        self.execute(ticket)
        self.execute(ticket)
        self.assertEqual(TicketProjectAssociation.objects.count(), 1)
        self.assertEqual(AutomationLog.objects.count(), 1)

    def test_other_actions_still_run_after_first_project_link(self):
        ticket = self.ticket()
        self.rule(order=1)
        AutomationRule.objects.create(
            tenant=self.tenant, name='Priority', trigger='ticket_created',
            actions=[{'type': 'set_priority', 'value': 'high'}], priority_order=2,
        )
        self.execute(ticket)
        ticket.refresh_from_db()
        self.assertEqual(ticket.priority, 'high')
        self.assertEqual(TicketProjectAssociation.objects.count(), 1)

    def test_stop_processing_still_blocks_later_rules(self):
        ticket = self.ticket()
        self.rule(order=1, stop=True)
        self.rule(project=self.second_project, order=2)
        self.execute(ticket)
        self.assertEqual(TicketProjectAssociation.objects.get().project, self.project)
        self.assertEqual(AutomationLog.objects.count(), 1)

    def test_dry_run_does_not_create_a_project_link(self):
        ticket = self.ticket()
        rule = self.rule()
        matches = dry_run_automation_rules(ticket, 'ticket_created')
        self.assertEqual(matches[0]['rule_id'], str(rule.pk))
        self.assertTrue(matches[0]['would_fire'])
        self.assertEqual(matches[0]['actions'][0]['type'], 'link_to_project')
        self.assertEqual(TicketProjectAssociation.objects.count(), 0)

    def test_non_creation_trigger_cannot_link_even_if_directly_configured(self):
        ticket = self.ticket()
        self.rule(trigger='ticket_updated')
        self.execute(ticket, trigger='ticket_updated')
        self.assertFalse(TicketProjectAssociation.objects.exists())
        result = _apply_action(ticket, {
            'type': 'link_to_project', 'value': str(self.project.id),
        }, 'customer_replied')
        self.assertIsNone(result)

    def test_invalid_or_foreign_project_target_never_creates_link(self):
        ticket = self.ticket()
        self.rule()
        self.assertIsNone(_apply_action(ticket, {
            'type': 'link_to_project', 'value': 'not-a-uuid',
        }, 'ticket_created'))
        self.assertIsNone(_apply_action(ticket, {
            'type': 'link_to_project', 'value': str(self.foreign_project.id),
        }, 'ticket_created'))
        self.assertIsNone(_apply_action(ticket, {
            'type': 'link_to_project', 'value': str(self.wrong_org_project.id),
        }, 'ticket_created'))
        self.assertFalse(TicketProjectAssociation.objects.exists())

    def test_created_ticket_signal_runs_automation(self):
        self.rule()
        ticket = self.ticket()
        self.assertEqual(TicketProjectAssociation.objects.get().ticket_id, ticket.id)
        self.assertEqual(AutomationLog.objects.count(), 1)

    def test_project_rule_creation_via_existing_api(self):
        response = self.owner_api.post('/api/automation/rules/', {
            'name': 'Checkout Routing', 'trigger': 'ticket_created',
            'conditions': [{'field': 'ticket.title', 'operator': 'contains', 'value': 'checkout'}],
            'actions': [{'type': 'link_to_project', 'value': str(self.project.id)}],
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(AutomationRule.objects.count(), 1)

    def test_org_scoped_rule_can_match_all_new_tickets_in_organization(self):
        response = self.owner_api.post('/api/automation/rules/', {
            'name': 'Scoped', 'trigger': 'ticket_created',
            'scope_type': 'specific_org', 'scope_org_id': str(self.org.id),
            'actions': [{'type': 'link_to_project', 'value': str(self.project.id)}],
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)

    def test_all_orgs_rule_without_conditions_is_rejected(self):
        response = self.owner_api.post('/api/automation/rules/', {
            'name': 'No filters', 'trigger': 'ticket_created',
            'actions': [{'type': 'link_to_project', 'value': str(self.project.id)}],
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertFalse(AutomationRule.objects.exists())

    def test_org_scope_must_match_project_organization(self):
        response = self.owner_api.post('/api/automation/rules/', {
            'name': 'Wrong org', 'trigger': 'ticket_created',
            'scope_type': 'specific_org', 'scope_org_id': str(self.other_org.id),
            'actions': [{'type': 'link_to_project', 'value': str(self.project.id)}],
        }, format='json')
        self.assertEqual(response.status_code, 400)

    def test_different_tenant_project_cannot_be_selected(self):
        response = self.owner_api.post('/api/automation/rules/', {
            'name': 'Foreign', 'trigger': 'ticket_created',
            'scope_type': 'specific_org', 'scope_org_id': str(self.org.id),
            'actions': [{'type': 'link_to_project', 'value': str(self.foreign_project.id)}],
        }, format='json')
        self.assertEqual(response.status_code, 400)

    def test_project_value_must_be_a_valid_uuid(self):
        response = self.owner_api.post('/api/automation/rules/', {
            'name': 'Malformed', 'trigger': 'ticket_created',
            'scope_type': 'specific_org', 'scope_org_id': str(self.org.id),
            'actions': [{'type': 'link_to_project', 'value': 'wrong'}],
        }, format='json')
        self.assertEqual(response.status_code, 400)

    def test_unknown_client_org_is_rejected_in_scoped_project_rule(self):
        response = self.owner_api.post('/api/automation/rules/', {
            'name': 'Foreign org', 'trigger': 'ticket_created',
            'scope_type': 'specific_org', 'scope_org_id': str(self.foreign_org.id),
            'actions': [{'type': 'link_to_project', 'value': str(self.project.id)}],
        }, format='json')
        self.assertEqual(response.status_code, 400)

    def test_non_manager_agent_cannot_create_project_routing(self):
        response = api(self.nonmember).post('/api/automation/rules/', {
            'name': 'No permission', 'trigger': 'ticket_created',
            'scope_type': 'specific_org', 'scope_org_id': str(self.org.id),
            'actions': [{'type': 'link_to_project', 'value': str(self.project.id)}],
        }, format='json')
        self.assertEqual(response.status_code, 400)

    def test_project_manager_agent_can_create_project_routing(self):
        response = api(self.manager).post('/api/automation/rules/', {
            'name': 'Manager rule', 'trigger': 'ticket_created',
            'scope_type': 'specific_org', 'scope_org_id': str(self.org.id),
            'actions': [{'type': 'link_to_project', 'value': str(self.project.id)}],
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)

    def test_client_cannot_access_rule_editor(self):
        response = api(self.client_user).post('/api/automation/rules/', {
            'name': 'Client route', 'trigger': 'ticket_created',
            'scope_type': 'specific_org', 'scope_org_id': str(self.org.id),
            'actions': [{'type': 'link_to_project', 'value': str(self.project.id)}],
        }, format='json')
        self.assertEqual(response.status_code, 403)

    def test_multiple_project_actions_in_one_rule_rejected(self):
        response = self.owner_api.post('/api/automation/rules/', {
            'name': 'Two projects', 'trigger': 'ticket_created',
            'scope_type': 'specific_org', 'scope_org_id': str(self.org.id),
            'actions': [
                {'type': 'link_to_project', 'value': str(self.project.id)},
                {'type': 'link_to_project', 'value': str(self.second_project.id)},
            ],
        }, format='json')
        self.assertEqual(response.status_code, 400)

    def test_reply_trigger_project_routing_is_rejected_at_creation(self):
        response = self.owner_api.post('/api/automation/rules/', {
            'name': 'No replies', 'trigger': 'reply_added',
            'scope_type': 'specific_org', 'scope_org_id': str(self.org.id),
            'actions': [{'type': 'link_to_project', 'value': str(self.project.id)}],
        }, format='json')
        self.assertEqual(response.status_code, 400)

    def test_partial_update_rejects_invalid_new_trigger(self):
        rule = self.rule()
        response = self.owner_api.patch(
            f'/api/automation/rules/{rule.id}/',
            {'trigger': 'customer_replied'}, format='json',
        )
        self.assertEqual(response.status_code, 400)
        rule.refresh_from_db()
        self.assertEqual(rule.trigger, 'ticket_created')

    def test_partial_update_rejects_scope_mismatch(self):
        rule = self.rule()
        response = self.owner_api.patch(
            f'/api/automation/rules/{rule.id}/',
            {'scope_type': 'specific_org', 'scope_org_id': str(self.other_org.id)},
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        rule.refresh_from_db()
        self.assertEqual(rule.scope_type, 'all_orgs')

    def test_partial_update_active_toggle_retains_project_action(self):
        rule = self.rule()
        response = self.owner_api.patch(
            f'/api/automation/rules/{rule.id}/',
            {'is_active': False}, format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        rule.refresh_from_db()
        self.assertFalse(rule.is_active)

    def test_inactive_rule_does_not_link(self):
        ticket = self.ticket()
        self.rule()
        AutomationRule.objects.update(is_active=False)
        self.execute(ticket)
        self.assertEqual(TicketProjectAssociation.objects.count(), 0)

    def test_archived_project_is_not_eligible_for_new_rules(self):
        self.project.status = 'archived'
        self.project.save()
        response = self.owner_api.post('/api/automation/rules/', {
            'name': 'Archived route', 'trigger': 'ticket_created',
            'scope_type': 'specific_org', 'scope_org_id': str(self.org.id),
            'actions': [{'type': 'link_to_project', 'value': str(self.project.id)}],
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertFalse(AutomationRule.objects.exists())

    def test_existing_rule_skips_archived_project(self):
        ticket = self.ticket()
        self.rule()
        self.project.status = 'archived'
        self.project.save()
        self.execute(ticket)
        self.assertFalse(TicketProjectAssociation.objects.exists())

    def test_equal_order_rules_use_name_as_tie_breaker(self):
        ticket = self.ticket()
        self.rule(project=self.second_project, order=10, name='Z Last')
        self.rule(project=self.project, order=10, name='A First')
        self.execute(ticket)
        self.assertEqual(TicketProjectAssociation.objects.get().project_id, self.project.id)

    def test_project_is_not_created_by_automation(self):
        ticket = self.ticket()
        original_projects = Project.objects.count()
        self.rule()
        self.execute(ticket)
        self.assertEqual(Project.objects.count(), original_projects)

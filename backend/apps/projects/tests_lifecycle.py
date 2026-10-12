"""Phase 1: hybrid progress automation and read-only lifecycle indicators."""
from django.test import TestCase, override_settings

from apps.tenants.models import ClientOrganization, Tenant
from .models import (
    Project, ProjectActivity, ProjectMember, ProjectMilestone,
    WorkItem, ProjectDeliveryReview,
)
from .tests import actor, authenticated


@override_settings(DEBUG=True, PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class HybridProjectLifecycleTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Lifecycle MSP', slug='lifecycle-msp')
        self.org = ClientOrganization.objects.create(tenant=self.tenant, name='Client', is_active=True)
        self.owner = actor(self.tenant, 'msp_owner', 'life-owner@example.test')
        self.agent = actor(self.tenant, 'msp_agent', 'life-agent@example.test')
        self.client_user = actor(self.tenant, 'client_owner', 'life-client@example.test', self.org)
        self.project = Project.objects.create(
            tenant=self.tenant, client_org=self.org, key='LIFE',
            name='Website', status='planned', visibility='client', created_by=self.owner,
        )
        ProjectMember.objects.create(project=self.project, user=self.owner, role='manager')
        ProjectMember.objects.create(project=self.project, user=self.agent, role='contributor')
        ProjectMember.objects.create(project=self.project, user=self.client_user, role='client_reviewer')
        self.api = authenticated(self.owner)
        self.project_url = f'/api/projects/{self.project.id}/'
        self.items_url = self.project_url + 'work-items/'

    def create_item(self, status='todo', api=None, **options):
        result = (api or self.api).post(self.items_url, {
            'title': 'Homepage', 'status': status, **options,
        }, format='json')
        self.assertEqual(result.status_code, 201, result.data)
        return result.data

    def change_item(self, item, **changes):
        return self.api.patch(f"/api/work-items/{item['id']}/", changes, format='json')

    def status(self):
        self.project.refresh_from_db()
        return self.project.status

    def test_first_in_progress_work_item_activates_planned_project(self):
        item = self.create_item('in_progress', visibility='client')
        self.assertEqual(self.status(), 'active')
        event = ProjectActivity.objects.get(project=self.project, kind='project_updated')
        self.assertIn(item['ref'], event.summary)
        self.assertEqual(event.visibility, 'client')

    def test_internal_work_start_activity_is_not_exposed_to_clients(self):
        item = self.create_item('in_progress', visibility='internal')
        event = ProjectActivity.objects.get(project=self.project, kind='project_updated')
        self.assertIn(item['ref'], event.summary)
        self.assertEqual(event.visibility, 'internal')
        result = authenticated(self.client_user).get(self.project_url + 'activity/')
        self.assertEqual(result.status_code, 200, result.data)
        self.assertNotIn(str(event.id), [row['id'] for row in result.data['results']])

    def test_todo_and_backlog_do_not_start_project(self):
        self.create_item('todo')
        self.create_item('backlog')
        self.assertEqual(self.status(), 'planned')
        self.assertEqual(self.project.activities.filter(kind='project_updated').count(), 0)

    def test_changing_work_item_to_in_progress_starts_once(self):
        item = self.create_item()
        result = self.change_item(item, status='in_progress')
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(self.status(), 'active')
        self.assertEqual(self.project.activities.filter(kind='project_updated').count(), 1)
        self.change_item(item, status='in_review')
        self.change_item(item, status='in_progress')
        self.assertEqual(self.project.activities.filter(kind='project_updated').count(), 1)

    def test_non_status_work_item_update_does_not_activate(self):
        item = self.create_item()
        result = self.change_item(item, description='Notes')
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(self.status(), 'planned')

    def test_manual_on_hold_cannot_be_overridden_by_work_start(self):
        response = self.api.patch(self.project_url, {'status': 'on_hold'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        item = self.create_item()
        result = self.change_item(item, status='in_progress')
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(self.status(), 'on_hold')
        self.create_item('in_progress')
        self.assertEqual(self.status(), 'on_hold')

    def test_manager_can_resume_on_hold_explicitly(self):
        self.api.patch(self.project_url, {'status': 'on_hold'}, format='json')
        self.create_item('in_progress')
        self.assertEqual(self.status(), 'on_hold')
        response = self.api.patch(self.project_url, {'status': 'active'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self.status(), 'active')

    def test_work_start_never_completes_project(self):
        item = self.create_item('in_progress')
        self.assertEqual(self.change_item(item, status='done').status_code, 200)
        self.assertEqual(self.status(), 'active')
        self.assertNotEqual(self.api.patch(
            self.project_url, {'status': 'completed'}, format='json',
        ).status_code, 200)
        self.assertEqual(self.status(), 'active')

    def test_unauthorized_client_cannot_start_work(self):
        item = self.create_item()
        result = authenticated(self.client_user).patch(
            f"/api/work-items/{item['id']}/", {'status': 'in_progress'}, format='json',
        )
        self.assertIn(result.status_code, (403, 404))
        self.assertEqual(self.status(), 'planned')

    def test_linked_ticket_creation_respects_on_hold_and_starts_planned(self):
        from apps.tickets.models import Ticket
        from .models import TicketProjectAssociation
        ticket = Ticket.objects.create(
            tenant=self.tenant, client_org=self.org, ticket_ref='T12102026-9001',
            seq=9001, subject='Link request',
        )
        TicketProjectAssociation.objects.create(
            ticket=ticket, project=self.project, linked_by=self.owner,
        )
        result = self.api.post(f'/api/tickets/{ticket.ticket_ref}/project-work-items/create/', {
            'title': 'Work from ticket', 'status': 'in_progress',
        }, format='json')
        self.assertEqual(result.status_code, 201, result.data)
        self.assertEqual(self.status(), 'active')

    def test_indicator_ready_for_delivery_only_after_valid_readiness(self):
        self.assertIsNone(self.api.get(self.project_url).data['status_indicator'])
        item = self.create_item('in_progress')
        self.assertIsNone(self.api.get(self.project_url).data['status_indicator'])
        response = self.change_item(item, status='done')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self.api.get(self.project_url).data['status_indicator'], 'ready_for_delivery')
        self.assertEqual(self.status(), 'active')

    def test_incomplete_milestones_prevent_ready_indicator(self):
        ProjectMilestone.objects.create(project=self.project, name='Delivery milestone')
        item = self.create_item('in_progress')
        self.change_item(item, status='done')
        self.assertIsNone(self.api.get(self.project_url).data['status_indicator'])

    def test_approved_review_does_not_auto_complete(self):
        self.create_item('in_progress')
        ProjectDeliveryReview.objects.create(
            project=self.project, round_number=1,
            summary='Completed work ready for approval', status='approved',
            submitted_by=self.owner, reviewed_by=self.client_user,
        )
        self.assertIsNone(self.api.get(self.project_url).data['status_indicator'])
        self.assertEqual(self.status(), 'active')

    def test_pending_review_indicator_visible_in_project_list(self):
        self.create_item('in_progress')
        ProjectDeliveryReview.objects.create(
            project=self.project, round_number=1,
            summary='Completed work ready for approval', status='pending',
            submitted_by=self.owner,
        )
        result = self.api.get('/api/projects/')
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(result.data[0]['status_indicator'], 'awaiting_client_review')
        client_result = authenticated(self.client_user).get('/api/projects/')
        self.assertEqual(client_result.status_code, 200, client_result.data)
        self.assertEqual(client_result.data[0]['status_indicator'], 'awaiting_client_review')

    def test_changes_requested_indicator_is_read_only(self):
        self.create_item('in_progress')
        ProjectDeliveryReview.objects.create(
            project=self.project, round_number=1,
            summary='Changes requested during review', status='changes_requested',
            submitted_by=self.owner, reviewed_by=self.client_user, feedback='Revision needed',
        )
        data = self.api.get(self.project_url).data
        self.assertEqual(data['status_indicator'], 'changes_requested')
        self.assertEqual(data['status'], 'active')
        self.assertEqual(self.status(), 'active')

    def test_bulk_directory_indicators_match_detail_and_hide_other_clients(self):
        item = self.create_item('in_progress')
        self.change_item(item, status='done')
        owner_rows = self.api.get('/api/projects/').data
        detail = self.api.get(self.project_url).data
        self.assertEqual(owner_rows[0]['status_indicator'], detail['status_indicator'])
        self.assertEqual(detail['status_indicator'], 'ready_for_delivery')
        other_org = ClientOrganization.objects.create(
            tenant=self.tenant, name='Unrelated Organization', is_active=True,
        )
        other_user = actor(self.tenant, 'client_owner', 'unrelated-life@example.test', other_org)
        self.assertEqual(authenticated(other_user).get('/api/projects/').data, [])

    def test_no_indicator_when_on_hold_even_if_review_exists(self):
        self.api.patch(self.project_url, {'status': 'on_hold'}, format='json')
        self.assertIsNone(self.api.get(self.project_url).data['status_indicator'])

    def test_completed_project_requires_reopen_before_work_edit(self):
        item = self.create_item('in_progress')
        Project.objects.filter(pk=self.project.id).update(status='completed')
        result = self.change_item(item, status='done')
        self.assertEqual(result.status_code, 400)
        self.assertEqual(self.status(), 'completed')
        self.assertEqual(WorkItem.objects.get(id=item['id']).status, 'in_progress')

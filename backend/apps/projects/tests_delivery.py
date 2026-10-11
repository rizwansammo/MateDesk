"""Phase 8C: client-verified delivery, completion, reopen and closure regression."""
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.tenants.models import Tenant, ClientOrganization
from apps.tickets.models import Ticket
from .models import (
    Project, ProjectMember, ProjectMilestone, WorkItem,
    ProjectDeliveryReview, ProjectActivity,
)
from .tests_requests import actor, client_for


@override_settings(
    DEBUG=True,
    PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'],
)
class ProjectDeliveryTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Delivery MSP', slug='delivery-msp')
        self.foreign_tenant = Tenant.objects.create(name='Foreign Delivery MSP', slug='delivery-foreign')
        self.org = ClientOrganization.objects.create(tenant=self.tenant, name='Website Client', is_active=True)
        self.other_org = ClientOrganization.objects.create(tenant=self.tenant, name='Other Client', is_active=True)
        foreign_org = ClientOrganization.objects.create(
            tenant=self.foreign_tenant, name='Foreign Client', is_active=True,
        )
        self.owner = actor(self.tenant, 'owner@delivery.test', 'msp_owner')
        self.manager = actor(self.tenant, 'manager@delivery.test', 'msp_manager')
        self.agent = actor(self.tenant, 'agent@delivery.test', 'msp_agent')
        self.unrelated_agent = actor(self.tenant, 'unrelated@delivery.test', 'msp_agent')
        self.reviewer = actor(self.tenant, 'reviewer@delivery.test', 'client_owner', self.org)
        self.other_reviewer = actor(self.tenant, 'reviewer2@delivery.test', 'end_user', self.org)
        self.other_client = actor(self.tenant, 'other@delivery.test', 'client_owner', self.other_org)
        self.foreign_client = actor(self.foreign_tenant, 'foreign@delivery.test', 'client_owner', foreign_org)
        self.project = Project.objects.create(
            tenant=self.tenant, client_org=self.org, key='SITE', name='New Website',
            status='active', visibility='client', created_by=self.owner,
        )
        ProjectMember.objects.create(project=self.project, user=self.owner, role='manager')
        ProjectMember.objects.create(project=self.project, user=self.agent, role='manager')
        ProjectMember.objects.create(project=self.project, user=self.reviewer, role='client_reviewer')
        ProjectMember.objects.create(project=self.project, user=self.other_reviewer, role='client_reviewer')
        self.item = WorkItem.objects.create(
            project=self.project, number=1, title='Website delivery',
            status='done', created_by=self.owner, visibility='client',
        )
        self.milestone = ProjectMilestone.objects.create(
            project=self.project, name='Final Handover', status='completed', visibility='client',
        )
        self.owner_api = client_for(self.owner)
        self.agent_api = client_for(self.agent)
        self.client_api = client_for(self.reviewer)
        self.second_api = client_for(self.other_reviewer)
        self.other_api = client_for(self.other_client)
        self.foreign_api = client_for(self.foreign_client)
        self.project_url = f'/api/projects/{self.project.id}/'
        self.url = self.project_url + 'delivery/'

    def submit(self, api=None, **changes):
        payload = {
            'summary': 'Completed the tested website and handed over the final version.',
            'delivery_url': 'https://preview.example.com',
        }
        payload.update(changes)
        return (api or self.owner_api).post(self.url+'submit/', payload, format='json')

    def review(self, decision='approved', api=None, feedback='Reviewed and accepted.'):
        return (api or self.client_api).post(self.url+'decision/', {
            'decision': decision, 'feedback': feedback,
        }, format='json')

    def complete(self, api=None):
        return (api or self.owner_api).post(self.url+'complete/', {}, format='json')

    def archive(self, api=None):
        return (api or self.owner_api).post(self.url+'archive/', {}, format='json')

    def reopen(self, api=None):
        return (api or self.owner_api).post(self.url+'reopen/', {}, format='json')

    def test_delivery_readiness_is_explicit_and_staff_only(self):
        resp = self.owner_api.get(self.url)
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertTrue(resp.data['readiness']['ready'])
        self.assertEqual(resp.data['readiness']['done'], 1)
        self.assertIsNone(self.client_api.get(self.url).data['readiness'])

    def test_agent_project_manager_can_submit(self):
        resp = self.submit(api=self.agent_api)
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(ProjectDeliveryReview.objects.get().submitted_by, self.agent)

    def test_unassigned_agent_cannot_open_delivery(self):
        self.assertEqual(client_for(self.unrelated_agent).get(self.url).status_code, 404)
        self.assertEqual(self.submit(api=client_for(self.unrelated_agent)).status_code, 404)

    def test_client_cannot_submit_delivery(self):
        self.assertEqual(self.submit(api=self.client_api).status_code, 403)
        self.assertEqual(ProjectDeliveryReview.objects.count(), 0)

    def test_different_client_org_and_tenant_cannot_read_or_approve(self):
        self.submit()
        self.assertEqual(self.other_api.get(self.url).status_code, 404)
        self.assertEqual(self.foreign_api.get(self.url).status_code, 404)
        self.assertEqual(self.review(api=self.other_api).status_code, 404)
        self.assertEqual(self.review(api=self.foreign_api).status_code, 404)

    def test_client_same_org_without_reviewer_membership_cannot_approve(self):
        user = actor(self.tenant, 'unshared@delivery.test', 'end_user', self.org)
        self.submit()
        self.assertEqual(client_for(user).post(self.url+'decision/', {
            'decision': 'approved',
        }, format='json').status_code, 404)

    def test_msp_staff_cannot_impersonate_client_approval(self):
        self.submit()
        self.assertEqual(self.review(api=self.owner_api).status_code, 403)
        self.assertEqual(ProjectDeliveryReview.objects.get().status, 'pending')

    def test_cannot_approve_without_pending_delivery(self):
        self.assertEqual(self.review().status_code, 400)

    def test_must_have_at_least_one_completed_work_item(self):
        self.item.status = 'cancelled'
        self.item.save()
        response = self.submit()
        self.assertEqual(response.status_code, 400)
        self.assertIn('Work Item', str(response.data))

    def test_unfinished_work_blocks_submission(self):
        self.item.status = 'in_progress'
        self.item.save()
        self.assertEqual(self.submit().status_code, 400)

    def test_incomplete_milestone_blocks_submission(self):
        self.milestone.status = 'planned'
        self.milestone.save()
        self.assertEqual(self.submit().status_code, 400)

    def test_open_project_support_ticket_blocks_submission(self):
        from .models import TicketProjectAssociation
        ticket = Ticket.objects.create(
            tenant=self.tenant, seq=112, ticket_ref='T12102026-0112',
            subject='Missing checkout', category='Project Support',
            requester=self.reviewer, client_org=self.org,
        )
        TicketProjectAssociation.objects.create(ticket=ticket, project=self.project)
        self.assertEqual(self.submit().status_code, 400)
        ticket.status = 'solved'
        ticket.save()
        self.assertEqual(self.submit().status_code, 201)

    def test_submission_requires_active_client_reviewer(self):
        ProjectMember.objects.filter(project=self.project, role='client_reviewer').delete()
        self.assertEqual(self.submit().status_code, 400)

    def test_draft_or_on_hold_cannot_submit(self):
        self.project.status = 'planned'
        self.project.save()
        self.assertEqual(self.submit().status_code, 400)
        self.project.status = 'on_hold'
        self.project.save()
        self.assertEqual(self.submit().status_code, 400)

    def test_internal_project_cannot_submit(self):
        self.project.visibility = 'internal'
        self.project.save()
        self.assertEqual(self.submit().status_code, 400)

    def test_invalid_delivery_url_rejected(self):
        self.assertEqual(self.submit(delivery_url='javascript:alert(1)').status_code, 400)
        self.assertEqual(ProjectDeliveryReview.objects.count(), 0)

    def test_delivery_summary_required_and_validated(self):
        self.assertEqual(self.submit(summary='short').status_code, 400)
        self.assertEqual(ProjectDeliveryReview.objects.count(), 0)

    def test_successful_submission_creates_audited_round(self):
        response = self.submit()
        self.assertEqual(response.status_code, 201, response.data)
        row = ProjectDeliveryReview.objects.get()
        self.assertEqual(row.round_number, 1)
        self.assertEqual(row.status, 'pending')
        self.assertIn('Completed', row.summary)
        self.assertEqual(self.project.delivery_reviews.count(), 1)
        self.assertTrue(ProjectActivity.objects.filter(
            project=self.project, kind='delivery_submitted', visibility='client'
        ).exists())

    def test_two_pending_submissions_are_rejected(self):
        self.submit()
        self.assertEqual(self.submit().status_code, 400)
        self.assertEqual(ProjectDeliveryReview.objects.count(), 1)

    def test_client_approve_keeps_project_active_until_staff_completes(self):
        self.submit()
        response = self.review()
        self.assertEqual(response.status_code, 200, response.data)
        self.project.refresh_from_db()
        self.assertEqual(self.project.status, 'active')
        review = ProjectDeliveryReview.objects.get()
        self.assertEqual(review.status, 'approved')
        self.assertEqual(review.reviewed_by, self.reviewer)
        self.assertIsNotNone(review.reviewed_at)

    def test_second_client_reviewer_may_approve(self):
        self.submit()
        self.assertEqual(self.review(api=self.second_api).status_code, 200)

    def test_second_decision_cannot_overwrite_approval(self):
        self.submit()
        self.review()
        self.assertEqual(self.review('changes_requested').status_code, 400)
        self.assertEqual(ProjectDeliveryReview.objects.get().status, 'approved')

    def test_client_must_explain_changes(self):
        self.submit()
        self.assertEqual(self.review('changes_requested', feedback=' ').status_code, 400)
        self.assertEqual(ProjectDeliveryReview.objects.get().status, 'pending')

    def test_requested_changes_allow_another_delivery_round(self):
        self.submit()
        response = self.review('changes_requested', feedback='Fix the footer alignment.')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self.submit().status_code, 201)
        reviews = list(ProjectDeliveryReview.objects.order_by('round_number'))
        self.assertEqual([review.round_number for review in reviews], [1, 2])
        self.assertEqual(reviews[0].status, 'changes_requested')
        self.assertEqual(reviews[0].feedback, 'Fix the footer alignment.')
        self.assertEqual(reviews[1].status, 'pending')

    def test_client_activity_attention_shows_delivery_submission(self):
        self.submit()
        result = self.client_api.get('/api/requests/workspace/?kind=projects&attention=1')
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(result.data['count'], 1)

    def test_agent_attention_shows_client_change_request(self):
        self.submit()
        self.review('changes_requested', feedback='Please test mobile layouts.')
        result = self.agent_api.get('/api/requests/workspace/?kind=projects&attention=1')
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(result.data['count'], 1)

    def test_work_item_and_milestone_changes_are_locked_during_review(self):
        self.submit()
        self.assertEqual(self.owner_api.patch(f'/api/work-items/{self.item.id}/', {
            'title': 'Changed work'
        }, format='json').status_code, 400)
        self.assertEqual(self.owner_api.post(self.project_url+'work-items/', {
            'title': 'New work',
        }, format='json').status_code, 400)
        self.assertEqual(self.owner_api.patch(
            self.project_url+f'milestones/{self.milestone.id}/',
            {'status': 'planned'}, format='json',
        ).status_code, 400)
        self.assertEqual(self.owner_api.post(self.project_url+'milestones/', {
            'name': 'New Milestone',
        }, format='json').status_code, 400)

    def test_work_item_editing_unlocked_after_changes_requested(self):
        self.submit()
        self.review('changes_requested', feedback='Fix issue')
        response = self.owner_api.patch(f'/api/work-items/{self.item.id}/', {
            'title': 'Updated Work'
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)

    def test_project_settings_cannot_bypass_approval(self):
        self.assertEqual(self.owner_api.patch(self.project_url, {
            'status': 'completed',
        }, format='json').status_code, 400)
        self.assertEqual(self.owner_api.patch(self.project_url, {
            'status': 'archived',
        }, format='json').status_code, 400)
        self.assertEqual(self.owner_api.post('/api/projects/', {
            'client_org_id': str(self.org.id), 'key': 'EVIL', 'name': 'Invalid',
            'status': 'completed',
        }, format='json').status_code, 400)
        self.assertEqual(self.owner_api.post('/api/projects/', {
            'client_org_id': str(self.org.id), 'key': 'EVI2', 'name': 'Invalid',
            'status': 'archived',
        }, format='json').status_code, 400)

    def test_cannot_complete_without_client_approval(self):
        self.assertEqual(self.complete().status_code, 400)
        self.submit()
        self.assertEqual(self.complete().status_code, 400)

    def test_only_project_manager_can_complete_after_approval(self):
        self.submit()
        self.review()
        self.assertEqual(self.complete(api=self.client_api).status_code, 403)
        self.assertEqual(self.complete(api=client_for(self.unrelated_agent)).status_code, 404)
        self.assertEqual(self.complete(api=self.agent_api).status_code, 200)

    def test_completion_keeps_client_approval_and_audit(self):
        self.submit()
        self.review()
        response = self.complete()
        self.assertEqual(response.status_code, 200, response.data)
        self.project.refresh_from_db()
        self.assertEqual(self.project.status, 'completed')
        self.assertIsNotNone(self.project.completed_at)
        self.assertEqual(ProjectDeliveryReview.objects.get().status, 'approved')
        self.assertTrue(ProjectActivity.objects.filter(kind='project_completed').exists())
        self.assertEqual(self.complete().status_code, 400)

    def test_unresolved_new_support_after_approval_blocks_completion(self):
        from .models import TicketProjectAssociation
        self.submit()
        self.review()
        ticket = Ticket.objects.create(
            tenant=self.tenant, seq=115, ticket_ref='T12102026-0115',
            subject='Regression', category='Project Support',
            client_org=self.org, requester=self.reviewer,
        )
        TicketProjectAssociation.objects.create(ticket=ticket, project=self.project)
        self.assertEqual(self.complete().status_code, 400)

    def test_changed_work_item_after_client_approval_blocks_completion(self):
        self.submit()
        self.review()
        self.item.title = 'Updated behind approval'
        self.item.save()
        self.assertEqual(self.complete().status_code, 400)

    def test_changed_work_after_approval_can_be_resubmitted_for_client_review(self):
        self.submit()
        self.review()
        self.item.title = 'Updated after approval'
        self.item.save()
        self.assertEqual(self.complete().status_code, 400)
        self.assertTrue(self.owner_api.get(self.url).data['review_requires_resubmission'])
        submitted = self.submit()
        self.assertEqual(submitted.status_code, 201, submitted.data)
        self.assertEqual(submitted.data['round_number'], 2)
        self.assertEqual(self.review().status_code, 200)
        self.assertEqual(self.complete().status_code, 200)

    def test_create_linked_work_item_from_ticket_cannot_bypass_pending_review(self):
        from .models import TicketProjectAssociation
        ticket = Ticket.objects.create(
            tenant=self.tenant, seq=131, ticket_ref='T12102026-0131',
            subject='Delivery linked bug', category='Project Support',
            client_org=self.org, requester=self.reviewer,
        )
        TicketProjectAssociation.objects.create(ticket=ticket, project=self.project)
        ticket.status = 'solved'
        ticket.save(update_fields=['status'])
        self.submit()
        result = self.owner_api.post(
            '/api/tickets/'+ticket.ticket_ref+'/project-work-items/create/',
            {'title': 'New work bypass'}, format='json',
        )
        self.assertEqual(result.status_code, 400)
        self.assertEqual(WorkItem.objects.filter(project=self.project).count(), 1)

    def test_archive_requires_completed_project(self):
        self.assertEqual(self.archive().status_code, 400)
        self.submit()
        self.review()
        self.assertEqual(self.archive().status_code, 400)
        self.complete()
        self.assertEqual(self.archive().status_code, 200)
        self.project.refresh_from_db()
        self.assertEqual(self.project.status, 'archived')
        self.assertIsNotNone(self.project.archived_at)
        self.assertTrue(ProjectActivity.objects.filter(kind='project_archived').exists())

    def test_unresolved_support_ticket_blocks_archive(self):
        from .models import TicketProjectAssociation
        self.submit()
        self.review()
        self.complete()
        ticket = Ticket.objects.create(
            tenant=self.tenant, seq=171, ticket_ref='T12102026-0171',
            subject='Client follow up', category='Project Support',
            requester=self.reviewer, client_org=self.org,
        )
        TicketProjectAssociation.objects.create(ticket=ticket, project=self.project)
        self.assertEqual(self.archive().status_code, 400)
        ticket.status = 'solved'
        ticket.save()
        self.assertEqual(self.archive().status_code, 200)

    def test_legacy_completed_project_without_client_approval_cannot_archive(self):
        self.project.status = 'completed'
        self.project.save()
        self.assertEqual(self.archive().status_code, 400)
        self.assertEqual(self.reopen().status_code, 200)
        self.assertEqual(self.submit().status_code, 201)

    def test_client_cannot_archive_project(self):
        self.submit()
        self.review()
        self.complete()
        self.assertEqual(self.archive(api=self.client_api).status_code, 403)

    def test_reopen_completed_project_requires_fresh_approval(self):
        self.submit()
        self.review()
        self.complete()
        response = self.reopen()
        self.assertEqual(response.status_code, 200, response.data)
        self.project.refresh_from_db()
        self.assertEqual(self.project.status, 'active')
        self.assertIsNone(self.project.completed_at)
        self.assertIsNotNone(self.project.reopened_at)
        self.assertEqual(self.complete().status_code, 400)
        self.assertEqual(self.submit().status_code, 201)
        self.assertEqual(ProjectDeliveryReview.objects.count(), 2)

    def test_reopen_and_second_approval_completes_again(self):
        self.submit()
        self.review()
        self.complete()
        self.reopen()
        self.submit()
        self.review()
        self.assertEqual(self.complete().status_code, 200)
        self.assertEqual(list(ProjectDeliveryReview.objects.order_by('round_number').values_list(
            'round_number', flat=True,
        )), [1, 2])

    def test_archived_project_can_be_reopened_without_losing_history(self):
        self.submit()
        self.review()
        self.complete()
        self.archive()
        self.assertEqual(self.reopen().status_code, 200)
        self.project.refresh_from_db()
        self.assertIsNone(self.project.archived_at)
        self.assertEqual(ProjectDeliveryReview.objects.count(), 1)

    def test_archived_and_completed_projects_reject_work_edits(self):
        self.submit()
        self.review()
        self.complete()
        self.assertEqual(self.owner_api.patch(
            f'/api/work-items/{self.item.id}/', {'title': 'Not Allowed'}, format='json',
        ).status_code, 400)
        self.archive()
        self.assertEqual(self.owner_api.post(
            self.project_url+'milestones/', {'name': 'Not Allowed'}, format='json',
        ).status_code, 400)

    def test_reviewer_revocation_prevents_later_approval(self):
        self.submit()
        ProjectMember.objects.filter(
            project=self.project, user=self.reviewer
        ).delete()
        self.assertEqual(self.review().status_code, 404)

    def test_feedback_is_retained_and_visible_to_only_project_reviewers(self):
        self.submit()
        self.review('changes_requested', feedback='Please fix missing accessibility labels.')
        owner = self.owner_api.get(self.url)
        reviewer = self.client_api.get(self.url)
        self.assertEqual(owner.status_code, 200)
        self.assertEqual(reviewer.status_code, 200)
        self.assertEqual(owner.data['history'][0]['feedback'], 'Please fix missing accessibility labels.')
        self.assertEqual(self.other_api.get(self.url).status_code, 404)
        self.assertEqual(self.foreign_api.get(self.url).status_code, 404)

    def test_repeated_approval_and_completion_cannot_duplicate_history(self):
        self.submit()
        self.review()
        self.assertEqual(self.review().status_code, 400)
        self.complete()
        self.assertEqual(self.complete().status_code, 400)
        self.assertEqual(ProjectActivity.objects.filter(kind='project_completed').count(), 1)

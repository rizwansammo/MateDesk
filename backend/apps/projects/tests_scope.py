"""Phase 3 scope and change approvals: permissions, immutable versions, and lifecycle."""
from decimal import Decimal

from django.test import TestCase, override_settings

from apps.tenants.models import ClientOrganization, Tenant

from .models import (
    Project, ProjectActivity, ProjectDeliveryReview, ProjectMember,
    ProjectScopeChangeRequest, ProjectScopeProposal, ProjectScopeVersion,
)
from .tests import actor, authenticated


@override_settings(DEBUG=True, PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class ProjectScopeManagementTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Scope MSP', slug='scope-msp')
        self.other_tenant = Tenant.objects.create(name='Outside Scope MSP', slug='scope-outside-msp')
        self.org = ClientOrganization.objects.create(tenant=self.tenant, name='Scope Client')
        self.other_org = ClientOrganization.objects.create(tenant=self.tenant, name='Another Client')
        self.owner = actor(self.tenant, 'msp_owner', 'scope-owner@example.test')
        self.agent = actor(self.tenant, 'msp_agent', 'scope-agent@example.test')
        self.client = actor(self.tenant, 'client_owner', 'scope-client@example.test', self.org)
        self.same_org_nonmember = actor(
            self.tenant, 'client_owner', 'scope-nonmember@example.test', self.org,
        )
        self.other_client = actor(
            self.tenant, 'client_owner', 'scope-other@example.test', self.other_org,
        )
        self.foreign_owner = actor(self.other_tenant, 'msp_owner', 'scope-foreign@example.test')
        self.project = Project.objects.create(
            tenant=self.tenant, client_org=self.org, key='SCOP',
            name='Scope Acceptance', description='Existing Request Requirements',
            visibility='client', status='active', created_by=self.owner,
        )
        ProjectMember.objects.create(project=self.project, user=self.owner, role='manager')
        ProjectMember.objects.create(project=self.project, user=self.agent, role='contributor')
        ProjectMember.objects.create(project=self.project, user=self.client, role='client_reviewer')
        self.manager_api = authenticated(self.owner)
        self.agent_api = authenticated(self.agent)
        self.client_api = authenticated(self.client)
        self.url = f'/api/projects/{self.project.pk}/scope/'
        self.proposals_url = self.url + 'proposals/'
        self.requests_url = self.url + 'change-requests/'

    def scope_payload(self, **changes):
        payload = {
            'title': 'Website Scope',
            'requirements': 'Build a responsive accessible website for our client.',
            'deliverables': ['Website pages', 'Deployment documentation'],
            'acceptance_criteria': [
                'All linked pages work on desktop and mobile',
                'Client verifies contact form delivery',
            ],
            'exclusions': 'Ongoing social media management',
            'budget_estimate': '1500.00',
            'budget_currency': 'USD',
            'target_date': '2027-03-12',
        }
        payload.update(changes)
        return payload

    def create_proposal(self, api=None, **changes):
        return (api or self.manager_api).post(
            self.proposals_url, self.scope_payload(**changes), format='json',
        )

    def decide(self, proposal, decision='approved', api=None, feedback=''):
        return (api or self.client_api).post(
            f"{self.proposals_url}{proposal['id']}/decision/",
            {'decision': decision, 'feedback': feedback}, format='json',
        )

    def approve_initial(self):
        draft = self.create_proposal()
        self.assertEqual(draft.status_code, 201, draft.data)
        approved = self.decide(draft.data)
        self.assertEqual(approved.status_code, 200, approved.data)
        return approved.data['approved_version']

    def change_request(self, api=None, **changes):
        payload = {
            'title': 'Add customer portal',
            'requested_changes': 'The client wants a customer portal with authentication.',
            'reason': 'The client business needs secure account access.',
        }
        payload.update(changes)
        return (api or self.client_api).post(self.requests_url, payload, format='json')

    def review_change(self, request_id, decision='under_review', note='', api=None):
        return (api or self.manager_api).post(
            f'{self.requests_url}{request_id}/review/',
            {'decision': decision, 'review_note': note}, format='json',
        )

    def test_manager_proposes_initial_client_approves_version_one(self):
        proposal = self.create_proposal()
        self.assertEqual(proposal.status_code, 201, proposal.data)
        self.assertEqual(proposal.data['status'], 'pending_client')
        self.assertIsNone(self.manager_api.get(self.url).data['current_version'])
        self.assertEqual(self.client_api.get(self.url).data['pending_proposal']['id'], proposal.data['id'])
        result = self.decide(proposal.data)
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(result.data['approved_version']['number'], 1)
        self.assertEqual(result.data['approved_version']['title'], 'Website Scope')
        state = self.client_api.get(self.url).data
        self.assertEqual(state['current_version']['number'], 1)
        self.assertEqual(state['versions'][0]['acceptance_criteria'][0],
                         'All linked pages work on desktop and mobile')
        self.assertEqual(state['proposals'][0]['status'], 'approved')
        self.assertIsNone(state['pending_proposal'])
        self.project.refresh_from_db()
        self.assertEqual(self.project.description, 'Existing Request Requirements')
        self.assertEqual(self.project.status, 'active')

    def test_versions_record_reviewer_budget_and_date_without_invoicing(self):
        current = self.approve_initial()
        self.assertEqual(current['approved_by'], self.client.full_name)
        self.assertEqual(current['budget_estimate'], '1500.00')
        self.assertEqual(current['budget_currency'], 'USD')
        self.assertEqual(str(current['target_date']), '2027-03-12')
        self.assertEqual(ProjectScopeVersion.objects.count(), 1)

    def test_client_may_request_revisions_to_initial_proposal(self):
        draft = self.create_proposal().data
        decision = self.decide(
            draft, 'changes_requested', feedback='Please add accessibility testing.',
        )
        self.assertEqual(decision.status_code, 200, decision.data)
        self.assertEqual(ProjectScopeVersion.objects.count(), 0)
        self.assertEqual(self.manager_api.get(self.url).data['proposals'][0]['status'],
                         'changes_requested')
        revised = self.create_proposal(
            acceptance_criteria=['Accessibility verified with keyboard navigation'],
        )
        self.assertEqual(revised.status_code, 201, revised.data)
        approved = self.decide(revised.data)
        self.assertEqual(approved.status_code, 200, approved.data)
        self.assertEqual(approved.data['approved_version']['number'], 1)
        self.assertEqual(ProjectScopeProposal.objects.count(), 2)

    def test_proposal_cannot_be_approved_twice(self):
        draft = self.create_proposal().data
        self.assertEqual(self.decide(draft).status_code, 200)
        self.assertEqual(self.decide(draft).status_code, 400)
        self.assertEqual(ProjectScopeVersion.objects.count(), 1)

    def test_manager_cannot_approve_own_scope(self):
        proposal = self.create_proposal().data
        self.assertEqual(self.decide(proposal, api=self.manager_api).status_code, 403)
        self.assertEqual(ProjectScopeVersion.objects.count(), 0)
        self.assertEqual(ProjectScopeProposal.objects.get().status, 'pending_client')

    def test_contributor_cannot_submit_client_scope(self):
        result = self.create_proposal(api=self.agent_api)
        self.assertEqual(result.status_code, 403)
        self.assertEqual(ProjectScopeProposal.objects.count(), 0)

    def test_only_one_pending_scope_proposal(self):
        self.assertEqual(self.create_proposal().status_code, 201)
        self.assertEqual(self.create_proposal().status_code, 400)
        self.assertEqual(ProjectScopeProposal.objects.count(), 1)

    def test_client_request_before_scope_approval_rejected(self):
        result = self.change_request()
        self.assertEqual(result.status_code, 400)
        self.assertEqual(ProjectScopeChangeRequest.objects.count(), 0)

    def test_client_creates_change_request_manager_reviews_before_proposal(self):
        self.approve_initial()
        change = self.change_request()
        self.assertEqual(change.status_code, 201, change.data)
        self.assertEqual(change.data['status'], 'submitted')
        rejected = self.create_proposal(
            change_request_id=change.data['id'], cost_impact='250.00',
        )
        self.assertEqual(rejected.status_code, 400)
        review = self.review_change(change.data['id'])
        self.assertEqual(review.status_code, 200, review.data)
        self.assertEqual(review.data['status'], 'under_review')
        proposal = self.create_proposal(
            change_request_id=change.data['id'], cost_impact='250.00',
            title='Website Scope with customer portal',
        )
        self.assertEqual(proposal.status_code, 201, proposal.data)
        self.assertEqual(proposal.data['cost_impact'], '250.00')
        self.assertEqual(
            ProjectScopeChangeRequest.objects.get(id=change.data['id']).status,
            'awaiting_client',
        )

    def test_client_approval_creates_new_immutable_scope_version(self):
        first = self.approve_initial()
        change = self.change_request().data
        self.review_change(change['id'])
        draft = self.create_proposal(
            change_request_id=change['id'], cost_impact='250.00',
            title='Website with customer portal',
            requirements='Build website pages, customer login, and basic user dashboard.',
            deliverables=['Website pages', 'Customer login', 'Deployment docs'],
        )
        self.assertEqual(draft.status_code, 201, draft.data)
        accepted = self.decide(draft.data)
        self.assertEqual(accepted.status_code, 200, accepted.data)
        self.assertEqual(accepted.data['approved_version']['number'], 2)
        self.assertEqual(accepted.data['approved_version']['cost_impact'], '250.00')
        scope = self.client_api.get(self.url).data
        self.assertEqual([v['number'] for v in scope['versions']], [2, 1])
        self.assertEqual(scope['versions'][1]['title'], first['title'])
        self.assertEqual(scope['versions'][0]['title'], 'Website with customer portal')
        self.assertEqual(scope['change_requests'][0]['status'], 'approved')
        self.assertEqual(self.project.status, 'active')

    def test_change_requires_estimated_cost_impact_including_zero(self):
        self.approve_initial()
        change = self.change_request().data
        self.review_change(change['id'])
        self.assertEqual(
            self.create_proposal(change_request_id=change['id']).status_code, 400,
        )
        proposal = self.create_proposal(
            change_request_id=change['id'], cost_impact='0.00',
        )
        self.assertEqual(proposal.status_code, 201, proposal.data)
        self.assertEqual(proposal.data['cost_impact'], '0.00')

    def test_change_rejection_requires_reason_and_cannot_be_approved(self):
        self.approve_initial()
        change = self.change_request().data
        self.assertEqual(self.review_change(change['id'], 'rejected').status_code, 400)
        reviewed = self.review_change(change['id'], 'rejected', note='Out of agreed delivery scope')
        self.assertEqual(reviewed.status_code, 200, reviewed.data)
        self.assertEqual(reviewed.data['status'], 'rejected')
        self.assertEqual(self.client_api.get(self.url).data['change_requests'][0]['review_note'],
                         'Out of agreed delivery scope')
        self.assertEqual(
            self.create_proposal(change_request_id=change['id'], cost_impact='0').status_code,
            400,
        )

    def test_client_can_request_changes_from_scope_proposal_and_manager_resubmit(self):
        self.approve_initial()
        change = self.change_request().data
        self.review_change(change['id'])
        first = self.create_proposal(change_request_id=change['id'], cost_impact='500.00').data
        review = self.decide(first, 'changes_requested', feedback='Please reduce the cost estimate.')
        self.assertEqual(review.status_code, 200, review.data)
        self.assertEqual(self.client_api.get(self.url).data['change_requests'][0]['status'],
                         'changes_requested')
        revised = self.create_proposal(change_request_id=change['id'], cost_impact='350.00')
        self.assertEqual(revised.status_code, 201, revised.data)
        self.assertEqual(self.decide(revised.data).data['approved_version']['number'], 2)
        self.assertEqual(ProjectScopeProposal.objects.count(), 3)
        self.assertEqual(ProjectScopeVersion.objects.count(), 2)

    def test_client_rejects_proposed_scope_change_without_mutating_baseline(self):
        self.approve_initial()
        change = self.change_request().data
        self.review_change(change['id'])
        proposal = self.create_proposal(change_request_id=change['id'], cost_impact='400.00').data
        rejection = self.decide(proposal, 'rejected', feedback='Cost is not approved.')
        self.assertEqual(rejection.status_code, 200)
        self.assertIsNone(rejection.data['approved_version'])
        self.assertEqual(ProjectScopeVersion.objects.count(), 1)
        self.assertEqual(self.client_api.get(self.url).data['current_version']['number'], 1)
        self.assertEqual(ProjectScopeChangeRequest.objects.get(pk=change['id']).status, 'rejected')

    def test_staff_change_request_cannot_be_auto_approved(self):
        self.approve_initial()
        change = self.change_request(api=self.agent_api)
        self.assertEqual(change.status_code, 201, change.data)
        self.assertEqual(self.decide({'id': '00000000-0000-0000-0000-000000000000'}, api=self.manager_api).status_code, 403)

    def test_project_scope_initial_approval_cannot_be_changed_without_change_request(self):
        self.approve_initial()
        self.assertEqual(self.create_proposal().status_code, 400)
        self.assertEqual(ProjectScopeVersion.objects.count(), 1)

    def test_cross_tenant_cross_org_and_unassigned_reviewers_blocked(self):
        proposal = self.create_proposal().data
        for user in (self.foreign_owner, self.other_client, self.same_org_nonmember):
            api = authenticated(user)
            self.assertEqual(api.get(self.url).status_code, 404)
            self.assertEqual(self.decide(proposal, api=api).status_code, 404)
        self.assertEqual(ProjectScopeVersion.objects.count(), 0)

    def test_client_cannot_submit_scope_proposal_or_review_change(self):
        self.approve_initial()
        change = self.change_request().data
        self.assertEqual(self.create_proposal(api=self.client_api).status_code, 403)
        self.assertEqual(
            self.review_change(change['id'], api=self.client_api).status_code, 403,
        )

    def test_change_request_for_other_project_cannot_be_reused(self):
        self.approve_initial()
        other = Project.objects.create(
            tenant=self.tenant, client_org=self.org, key='EXT2',
            name='Different Scope', visibility='client', status='active', created_by=self.owner,
        )
        wrong = ProjectScopeChangeRequest.objects.create(
            project=other, requested_by=self.owner, title='Outside change',
            requested_changes='Move to a different project dashboard permanently.',
            status='under_review',
        )
        result = self.create_proposal(change_request_id=str(wrong.pk), cost_impact='0.00')
        self.assertEqual(result.status_code, 404)

    def test_private_project_cannot_send_client_scope_proposal(self):
        Project.objects.filter(pk=self.project.pk).update(visibility='internal')
        result = self.create_proposal()
        self.assertEqual(result.status_code, 400, result.data)
        self.assertEqual(ProjectScopeProposal.objects.count(), 0)

    def test_initial_scope_requires_reviewers(self):
        self.project.members.filter(user=self.client).delete()
        result = self.create_proposal()
        self.assertEqual(result.status_code, 400)
        self.assertEqual(ProjectScopeProposal.objects.count(), 0)

    def test_requires_real_acceptance_criteria_and_valid_budget(self):
        for changes in (
            {'acceptance_criteria': []},
            {'deliverables': []},
            {'requirements': 'short'},
            {'budget_estimate': '-200.00'},
            {'budget_currency': 'INVALID'},
        ):
            with self.subTest(changes=changes):
                result = self.create_proposal(**changes)
                self.assertEqual(result.status_code, 400, result.data)
        self.assertEqual(ProjectScopeProposal.objects.count(), 0)

    def test_scope_proposal_decision_requires_feedback_for_rejection(self):
        proposed = self.create_proposal().data
        self.assertEqual(self.decide(proposed, 'rejected').status_code, 400)
        self.assertEqual(self.decide(proposed, 'changes_requested').status_code, 400)
        self.assertEqual(self.client_api.get(self.url).data['pending_proposal']['id'], proposed['id'])

    def test_pending_delivery_prevents_scope_change_mutations(self):
        self.approve_initial()
        ProjectDeliveryReview.objects.create(
            project=self.project, round_number=1, summary='We are ready for approval',
            status='pending', submitted_by=self.owner,
        )
        self.assertEqual(self.change_request().status_code, 400)
        self.assertEqual(self.create_proposal().status_code, 400)

    def test_completed_project_requires_reopen_before_change(self):
        self.approve_initial()
        Project.objects.filter(pk=self.project.pk).update(status='completed')
        self.assertEqual(self.change_request().status_code, 400)

    def test_manager_hold_does_not_block_client_scope_approval(self):
        proposal = self.create_proposal().data
        Project.objects.filter(pk=self.project.pk).update(status='on_hold')
        outcome = self.decide(proposal)
        self.assertEqual(outcome.status_code, 200, outcome.data)
        self.project.refresh_from_db()
        self.assertEqual(self.project.status, 'on_hold')

    def test_scope_activity_log_records_generic_non_sensitive_events(self):
        proposal = self.create_proposal().data
        self.decide(proposal)
        activities = ProjectActivity.objects.filter(project=self.project, kind__startswith='scope_')
        self.assertEqual(activities.count(), 2)
        self.assertTrue(all(event.visibility == 'client' for event in activities))
        self.assertTrue(all('1500' not in event.summary for event in activities))

    def test_model_rejects_cross_project_scope_proposal_reference(self):
        self.approve_initial()
        other = Project.objects.create(
            tenant=self.tenant, client_org=self.org, key='OTHR',
            name='Other Project', visibility='client', created_by=self.owner,
        )
        change = ProjectScopeChangeRequest.objects.create(
            project=other, title='Change from elsewhere',
            requested_changes='New client dashboard with sign in authentication.',
            requested_by=self.owner,
        )
        from django.core.exceptions import ValidationError as DjangoValidationError
        with self.assertRaises(DjangoValidationError):
            ProjectScopeProposal.objects.create(
                project=self.project, change_request=change,
                proposed_by=self.owner, title='Wrong link',
                requirements='Build an updated project with these extra features.',
                deliverables=['Updated dashboard'],
                acceptance_criteria=['Client agrees on the result'],
            )

    def test_multiple_client_reviewers_only_actual_member_can_approve(self):
        proposal = self.create_proposal().data
        outsider = authenticated(self.same_org_nonmember)
        self.assertEqual(
            outsider.post(f"{self.proposals_url}{proposal['id']}/decision/", {
                'decision': 'approved',
            }, format='json').status_code,
            404,
        )
        self.assertEqual(self.decide(proposal).status_code, 200)

    def test_failed_client_decision_does_not_mutate_version(self):
        proposal = self.create_proposal().data
        result = self.client_api.post(
            f"{self.proposals_url}{proposal['id']}/decision/",
            {'decision': 'unknown'}, format='json',
        )
        self.assertEqual(result.status_code, 400)
        self.assertEqual(ProjectScopeVersion.objects.count(), 0)

    def test_client_visible_scope_status_and_cost_are_separate_from_invoices(self):
        initial = self.approve_initial()
        self.assertEqual(initial['budget_estimate'], '1500.00')
        self.assertIsNone(initial['cost_impact'])
        self.assertEqual(self.client_api.get(self.url).data['current_version']['number'], 1)
        self.assertEqual(ProjectScopeChangeRequest.objects.count(), 0)

    def test_approved_version_cannot_be_edited_even_with_model_save(self):
        self.approve_initial()
        version = ProjectScopeVersion.objects.get()
        version.requirements = 'A very different and unauthorized scope.'
        from django.core.exceptions import ValidationError as DjangoValidationError
        with self.assertRaises(DjangoValidationError):
            version.save()
        self.assertNotEqual(
            ProjectScopeVersion.objects.get().requirements,
            'A very different and unauthorized scope.',
        )

    def test_scope_proposal_payload_is_immutable_after_submission(self):
        self.create_proposal()
        proposal = ProjectScopeProposal.objects.get()
        proposal.budget_estimate = Decimal('1.00')
        from django.core.exceptions import ValidationError as DjangoValidationError
        with self.assertRaises(DjangoValidationError):
            proposal.save()
        self.assertEqual(ProjectScopeProposal.objects.get().budget_estimate, Decimal('1500.00'))

    def test_change_request_original_text_cannot_be_rewritten(self):
        self.approve_initial()
        change = self.change_request().data
        row = ProjectScopeChangeRequest.objects.get(pk=change['id'])
        row.requested_changes = 'Changed without client consent.'
        from django.core.exceptions import ValidationError as DjangoValidationError
        with self.assertRaises(DjangoValidationError):
            row.save()

    def test_direct_staff_scope_approval_is_rejected_at_model_boundary(self):
        self.create_proposal()
        proposal = ProjectScopeProposal.objects.get()
        proposal.status = 'approved'
        proposal.decided_by = self.owner
        from django.core.exceptions import ValidationError as DjangoValidationError
        with self.assertRaises(DjangoValidationError):
            proposal.save()
        self.assertEqual(ProjectScopeProposal.objects.get().status, 'pending_client')

    def test_resubmit_after_rejected_initial_scope_is_allowed(self):
        proposal = self.create_proposal().data
        rejection = self.decide(proposal, 'rejected', feedback='Not our agreed requirements.')
        self.assertEqual(rejection.status_code, 200)
        self.assertEqual(ProjectScopeVersion.objects.count(), 0)
        revised = self.create_proposal(title='Revised initial website scope')
        self.assertEqual(revised.status_code, 201, revised.data)
        self.assertEqual(self.decide(revised.data).data['approved_version']['number'], 1)

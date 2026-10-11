"""Phase 7: project client portal, reviewer onboarding and isolation tests."""
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.tenants.models import Tenant, ClientOrganization
from apps.users.models import User
from .models import Project, ProjectMember, ProjectMilestone, WorkItem, WorkItemComment


def make_user(tenant, email, role, org=None, active=True):
    return User.objects.create_user(
        tenant=tenant, email=email, password='test-secret',
        role=role, client_org=org, first_name=email.split('@')[0],
        is_active=active,
    )


def api_for(user):
    token = AccessToken.for_user(user)
    token['tenant_id'] = str(user.tenant_id)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    client.defaults['SERVER_NAME'] = 'localhost'
    return client


@override_settings(DEBUG=True)
class ClientProjectPortalTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Portal Workspace', slug='portal-workspace')
        self.foreign_tenant = Tenant.objects.create(name='Foreign Workspace', slug='foreign-workspace')
        self.org = ClientOrganization.objects.create(
            tenant=self.tenant, name='Acme Design', is_active=True)
        self.org_b = ClientOrganization.objects.create(
            tenant=self.tenant, name='Other Client', is_active=True)
        self.foreign_org = ClientOrganization.objects.create(
            tenant=self.foreign_tenant, name='Foreign Client', is_active=True)
        self.owner = make_user(self.tenant, 'owner@portal.test', 'msp_owner')
        self.agent = make_user(self.tenant, 'agent@portal.test', 'msp_agent')
        self.manager_agent = make_user(self.tenant, 'manager@portal.test', 'msp_agent')
        self.reviewer = make_user(self.tenant, 'reviewer@acme.test', 'client_owner', self.org)
        self.available = make_user(self.tenant, 'candidate@acme.test', 'end_user', self.org)
        self.inactive = make_user(self.tenant, 'inactive@acme.test', 'end_user', self.org, active=False)
        self.other_client = make_user(self.tenant, 'other@elsewhere.test', 'client_owner', self.org_b)
        self.foreign_client = make_user(
            self.foreign_tenant, 'foreign@another.test', 'client_owner', self.foreign_org)
        self.project = Project.objects.create(
            tenant=self.tenant, client_org=self.org, created_by=self.owner,
            key='PORTAL', name='Customer Project', visibility='client',
            description='Project details shared with customer',
        )
        self.internal_project = Project.objects.create(
            tenant=self.tenant, client_org=self.org, created_by=self.owner,
            key='SECRET', name='Internal Project', visibility='internal',
        )
        self.other_project = Project.objects.create(
            tenant=self.tenant, client_org=self.org_b, created_by=self.owner,
            key='OTHER', name='Other customer project', visibility='client',
        )
        ProjectMember.objects.create(project=self.project, user=self.owner, role='manager')
        ProjectMember.objects.create(project=self.project, user=self.manager_agent, role='manager')
        ProjectMember.objects.create(project=self.project, user=self.reviewer, role='client_reviewer')
        ProjectMember.objects.create(project=self.internal_project, user=self.reviewer, role='client_reviewer')
        ProjectMember.objects.create(project=self.other_project, user=self.other_client, role='client_reviewer')
        self.milestone = ProjectMilestone.objects.create(
            project=self.project, name='Launch', description='Expected delivery',
            visibility='client',
        )
        self.public_item = WorkItem.objects.create(
            project=self.project, number=1, title='Public ticket fix',
            visibility='client', milestone=self.milestone, created_by=self.owner,
        )
        self.internal_item = WorkItem.objects.create(
            project=self.project, number=2, title='Internal infrastructure details',
            visibility='internal', created_by=self.owner,
        )
        self.public_note = WorkItemComment.objects.create(
            work_item=self.public_item, author=self.owner,
            visibility='client', body='This update is visible.',
        )
        self.internal_note = WorkItemComment.objects.create(
            work_item=self.public_item, author=self.owner,
            visibility='internal', body='Secret implementation notes.',
        )
        self.owner_api = api_for(self.owner)
        self.client_api = api_for(self.reviewer)
        self.project_url = f'/api/projects/{self.project.id}/'
        self.candidates_url = f'{self.project_url}reviewer-candidates/'
        self.members_url = f'{self.project_url}members/'
        self.items_url = f'{self.project_url}work-items/'
        self.public_url = f'/api/work-items/{self.public_item.id}/'
        self.internal_url = f'/api/work-items/{self.internal_item.id}/'

    def test_client_sees_only_explicitly_shared_project(self):
        result = self.client_api.get('/api/projects/')
        self.assertEqual(result.status_code, 200)
        self.assertEqual([p['id'] for p in result.data], [str(self.project.id)])
        self.assertEqual(result.data[0]['my_role'], 'client_reviewer')
        self.assertFalse(result.data[0]['can_edit'])
        self.assertFalse(result.data[0]['can_manage'])

    def test_client_cannot_open_internal_project(self):
        self.assertEqual(
            self.client_api.get(f'/api/projects/{self.internal_project.id}/').status_code, 404)

    def test_client_cannot_open_other_organization_project(self):
        self.assertEqual(
            self.client_api.get(f'/api/projects/{self.other_project.id}/').status_code, 404)

    def test_client_cannot_open_other_tenant_project(self):
        foreign_project = Project.objects.create(
            tenant=self.foreign_tenant, client_org=self.foreign_org, key='FOREIGN',
            name='Foreign', visibility='client',
        )
        ProjectMember.objects.create(
            project=foreign_project, user=self.foreign_client, role='client_reviewer')
        self.assertEqual(self.client_api.get(f'/api/projects/{foreign_project.id}/').status_code, 404)

    def test_client_cannot_see_unpublished_work_items(self):
        response = self.client_api.get(self.items_url)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual([item['id'] for item in response.data], [str(self.public_item.id)])
        self.assertNotIn('Internal infrastructure', str(response.data))

    def test_internal_milestones_are_hidden_from_client(self):
        ProjectMilestone.objects.create(
            project=self.project, name='Sensitive architecture',
            description='Private infrastructure change', visibility='internal',
        )
        response = self.client_api.get(f'{self.project_url}milestones/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertNotIn('Sensitive architecture', str(response.data))
        self.assertNotIn('Private infrastructure', str(response.data))

    def test_staff_can_publish_specific_milestone(self):
        milestone = ProjectMilestone.objects.create(
            project=self.project, name='Second Milestone',
            description='Shared release', visibility='internal',
        )
        before = self.client_api.get(f'{self.project_url}milestones/').data
        self.assertEqual(len(before), 1)
        response = self.owner_api.patch(
            f'{self.project_url}milestones/{milestone.id}/',
            {'visibility': 'client'}, format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        after = self.client_api.get(f'{self.project_url}milestones/').data
        self.assertEqual(len(after), 2)

    def test_client_cannot_publish_internal_milestone(self):
        internal = ProjectMilestone.objects.create(
            project=self.project, name='Confidential release', visibility='internal',
        )
        response = self.client_api.patch(
            f'{self.project_url}milestones/{internal.id}/',
            {'visibility': 'client'}, format='json',
        )
        self.assertEqual(response.status_code, 403)

    def test_client_can_see_published_work_item_and_milestones(self):
        self.assertEqual(self.client_api.get(self.public_url).status_code, 200)
        r = self.client_api.get(f'{self.project_url}milestones/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data[0]['name'], 'Launch')

    def test_internal_work_item_direct_link_is_forbidden(self):
        self.assertEqual(self.client_api.get(self.internal_url).status_code, 403)

    def test_client_sees_only_client_visible_comments(self):
        r = self.client_api.get(f'{self.public_url}comments/')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(len(r.data), 1)
        self.assertIn('visible', r.data[0]['body'])
        self.assertNotIn('Secret', str(r.data))

    def test_client_can_post_feedback_without_mutating_status(self):
        before_status = self.public_item.status
        r = self.client_api.post(f'{self.public_url}comments/', {
            'body': 'Can you move the save button?', 'visibility': 'client',
        }, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        comment = WorkItemComment.objects.get(pk=r.data['id'])
        self.assertEqual(comment.author, self.reviewer)
        self.assertEqual(comment.visibility, 'client')
        self.public_item.refresh_from_db()
        self.assertEqual(self.public_item.status, before_status)

    def test_client_cannot_publish_internal_comment(self):
        r = self.client_api.post(f'{self.public_url}comments/', {
            'body': 'Try secret flag', 'visibility': 'internal',
        }, format='json')
        self.assertEqual(r.status_code, 403)

    def test_client_cannot_comment_on_unpublished_item(self):
        self.assertEqual(self.client_api.post(
            f'{self.internal_url}comments/',
            {'body': 'Unpublished'}, format='json',
        ).status_code, 403)

    def test_client_cannot_create_work_item_or_change_status(self):
        self.assertEqual(self.client_api.post(
            self.items_url, {'title': 'Unauthorized task'}, format='json',
        ).status_code, 403)
        self.assertEqual(self.client_api.patch(
            self.public_url, {'status': 'done'}, format='json',
        ).status_code, 403)

    def test_client_cannot_manage_project_or_members(self):
        self.assertEqual(self.client_api.patch(
            self.project_url, {'status': 'completed'}, format='json',
        ).status_code, 403)
        self.assertEqual(self.client_api.get(self.members_url).status_code, 403)
        self.assertEqual(self.client_api.get(self.candidates_url).status_code, 403)

    def test_candidate_list_is_scoped_to_active_users_in_this_org(self):
        r = self.owner_api.get(self.candidates_url)
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual([u['email'] for u in r.data], [self.available.email])
        self.assertNotIn(self.inactive.email, str(r.data))
        self.assertNotIn(self.other_client.email, str(r.data))

    def test_project_manager_agent_can_list_reviewers(self):
        r = api_for(self.manager_agent).get(self.candidates_url)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data), 1)

    def test_agent_without_membership_cannot_enumerate_client_users(self):
        self.assertEqual(api_for(self.agent).get(self.candidates_url).status_code, 404)

    def test_foreign_staff_cannot_enumerate_project_users(self):
        foreign_owner = make_user(
            self.foreign_tenant, 'foreignowner@another.test', 'msp_owner')
        self.assertEqual(api_for(foreign_owner).get(self.candidates_url).status_code, 404)

    def test_reviewer_cannot_use_another_org_user_identifier(self):
        r = self.owner_api.post(self.members_url, {
            'user_id': str(self.other_client.id), 'role': 'client_reviewer',
        }, format='json')
        self.assertEqual(r.status_code, 400)

    def test_client_candidate_can_be_granted_reviewer_membership(self):
        r = self.owner_api.post(self.members_url, {
            'user_id': str(self.available.id), 'role': 'client_reviewer',
        }, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data['role'], 'client_reviewer')
        self.assertEqual(api_for(self.available).get(self.project_url).status_code, 200)
        candidate_ids = [
            user['id'] for user in self.owner_api.get(self.candidates_url).data
        ]
        self.assertNotIn(str(self.available.id), candidate_ids)

    def test_inactive_client_user_cannot_be_added(self):
        r = self.owner_api.post(self.members_url, {
            'user_id': str(self.inactive.id), 'role': 'client_reviewer',
        }, format='json')
        self.assertEqual(r.status_code, 404)

    def test_staff_cannot_be_granted_reviewer_role(self):
        r = self.owner_api.post(self.members_url, {
            'user_id': str(self.agent.id), 'role': 'client_reviewer',
        }, format='json')
        self.assertEqual(r.status_code, 400)

    def test_reviewer_cannot_be_granted_staff_role(self):
        r = self.owner_api.post(self.members_url, {
            'user_id': str(self.available.id), 'role': 'manager',
        }, format='json')
        self.assertEqual(r.status_code, 400)

    def test_revoke_stops_project_access_and_feedback_immediately(self):
        membership = ProjectMember.objects.get(project=self.project, user=self.reviewer)
        r = self.owner_api.delete(f'{self.members_url}{membership.id}/')
        self.assertEqual(r.status_code, 204)
        self.assertEqual(self.client_api.get(self.project_url).status_code, 404)
        self.assertEqual(self.client_api.get(f'{self.public_url}comments/').status_code, 404)
        self.assertEqual(self.client_api.post(f'{self.public_url}comments/', {
            'body': 'after revocation',
        }, format='json').status_code, 404)
        self.assertEqual(WorkItemComment.objects.count(), 2)

    def test_inactive_org_blocks_direct_reviewer_assignment(self):
        self.org.is_active = False
        self.org.save()
        response = self.owner_api.post(self.members_url, {
            'user_id': str(self.available.id), 'role': 'client_reviewer',
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.owner_api.get(self.candidates_url).data, [])

    def test_inactive_client_org_is_hidden_from_portal(self):
        self.org.is_active = False
        self.org.save()
        self.assertEqual(self.client_api.get('/api/projects/').data, [])
        self.assertEqual(self.client_api.get(self.project_url).status_code, 404)

    def test_duplicate_reviewer_membership_rejected(self):
        r = self.owner_api.post(self.members_url, {
            'user_id': str(self.reviewer.id), 'role': 'client_reviewer',
        }, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(ProjectMember.objects.filter(
            project=self.project, user=self.reviewer).count(), 1)

    def test_client_cannot_send_email_notifications(self):
        r = self.client_api.get(f'{self.public_url}email-notifications/')
        self.assertEqual(r.status_code, 403)

    def test_revoked_user_cannot_view_other_shared_project_without_membership(self):
        second = Project.objects.create(
            tenant=self.tenant, client_org=self.org, key='SECOND',
            name='Second public project', visibility='client',
            created_by=self.owner,
        )
        self.assertEqual(self.client_api.get(f'/api/projects/{second.id}/').status_code, 404)

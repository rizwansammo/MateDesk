"""Project backend regression tests including organization and tenant boundaries."""
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.tenants.models import ClientOrganization, Tenant
from apps.users.models import User

from .models import Project, ProjectMember, ProjectMilestone, WorkItem


def actor(tenant, role, email, org=None):
    user = User.objects.create_user(
        tenant=tenant, email=email, password='test-password',
        first_name=role, role=role,
    )
    if org:
        user.client_org = org
        user.save()
    return user


def authenticated(user):
    token = AccessToken.for_user(user)
    token['tenant_id'] = str(user.tenant_id)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    client.defaults['SERVER_NAME'] = 'localhost'
    return client


@override_settings(DEBUG=True)
class ProjectBackendAPITest(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='MSP One', slug='projects-msp-one')
        self.other_tenant = Tenant.objects.create(name='MSP Two', slug='projects-msp-two')
        self.org = ClientOrganization.objects.create(tenant=self.tenant, name='Client A')
        self.other_org = ClientOrganization.objects.create(tenant=self.tenant, name='Client B')
        self.foreign_org = ClientOrganization.objects.create(tenant=self.other_tenant, name='Foreign Client')
        self.owner = actor(self.tenant, 'msp_owner', 'owner@example.test')
        self.agent = actor(self.tenant, 'msp_agent', 'agent@example.test')
        self.nonmember_agent = actor(self.tenant, 'msp_agent', 'nonmember@example.test')
        self.client_user = actor(self.tenant, 'client_owner', 'customer@example.test', self.org)
        self.other_client = actor(self.tenant, 'client_owner', 'other@example.test', self.other_org)
        self.foreign_owner = actor(self.other_tenant, 'msp_owner', 'foreign@example.test')
        self.owner_api = authenticated(self.owner)
        self.project = Project.objects.create(
            tenant=self.tenant, client_org=self.org, created_by=self.owner,
            key='SHOP', name='Shop Website', visibility='client',
        )
        ProjectMember.objects.create(project=self.project, user=self.owner, role='manager')

    def project_url(self):
        return f'/api/projects/{self.project.id}/'

    def test_owner_creates_project_with_manager_membership(self):
        r = self.owner_api.post('/api/projects/', {
            'client_org_id': str(self.org.id), 'key': 'second', 'name': 'Second Project',
        }, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        p = Project.objects.get(pk=r.data['id'])
        self.assertEqual(p.key, 'SECOND')
        self.assertTrue(p.members.filter(user=self.owner, role='manager').exists())
        self.assertEqual(p.client_org, self.org)

    def test_create_requires_staff_manager(self):
        r = authenticated(self.agent).post('/api/projects/', {
            'client_org_id': str(self.org.id), 'key': 'AGENT', 'name': 'Not Allowed',
        }, format='json')
        self.assertEqual(r.status_code, 403)
        r = authenticated(self.client_user).post('/api/projects/', {
            'client_org_id': str(self.org.id), 'key': 'CLIENT', 'name': 'Not Allowed',
        }, format='json')
        self.assertEqual(r.status_code, 403)

    def test_create_rejects_other_tenant_org(self):
        r = self.owner_api.post('/api/projects/', {
            'client_org_id': str(self.foreign_org.id), 'key': 'FOREIGN', 'name': 'No',
        }, format='json')
        self.assertEqual(r.status_code, 404)

    def test_key_unique_per_tenant(self):
        r = self.owner_api.post('/api/projects/', {
            'client_org_id': str(self.org.id), 'key': 'shop', 'name': 'Duplicate',
        }, format='json')
        self.assertEqual(r.status_code, 400)

    def test_client_org_and_key_are_immutable(self):
        r = self.owner_api.patch(self.project_url(), {'client_org_id': str(self.other_org.id)}, format='json')
        self.assertEqual(r.status_code, 400)
        r = self.owner_api.patch(self.project_url(), {'key': 'EVIL'}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_permissions_exposed_for_current_user(self):
        owner = self.owner_api.get(self.project_url()).data
        self.assertTrue(owner['can_manage'])
        self.assertTrue(owner['can_edit'])
        self.assertEqual(owner['my_role'], 'manager')

        member = ProjectMember.objects.create(
            project=self.project, user=self.agent, role='contributor',
        )
        contributor = authenticated(self.agent).get(self.project_url()).data
        self.assertFalse(contributor['can_manage'])
        self.assertTrue(contributor['can_edit'])
        self.assertEqual(contributor['my_role'], 'contributor')

        member.role = 'manager'
        member.save()
        manager = authenticated(self.agent).get(self.project_url()).data
        self.assertTrue(manager['can_manage'])
        self.assertTrue(manager['can_edit'])

        member.role = 'viewer'
        member.save()
        viewer = authenticated(self.agent).get(self.project_url()).data
        self.assertFalse(viewer['can_manage'])
        self.assertFalse(viewer['can_edit'])

    def test_client_visibility_requires_membership(self):
        api = authenticated(self.client_user)
        self.assertEqual(api.get('/api/projects/').data, [])
        self.assertEqual(api.get(self.project_url()).status_code, 404)
        ProjectMember.objects.create(project=self.project, user=self.client_user, role='client_reviewer')
        self.assertEqual(len(api.get('/api/projects/').data), 1)
        self.assertEqual(api.get(self.project_url()).status_code, 200)
        self.project.visibility = 'internal'
        self.project.save()
        self.assertEqual(api.get('/api/projects/').data, [])

    def test_other_client_never_sees_project(self):
        ProjectMember.objects.create(project=self.project, user=self.client_user, role='client_reviewer')
        api = authenticated(self.other_client)
        self.assertEqual(api.get(self.project_url()).status_code, 404)
        self.assertEqual(api.get('/api/projects/').data, [])

    def test_cross_tenant_account_sees_no_projects(self):
        api = authenticated(self.foreign_owner)
        self.assertEqual(api.get(self.project_url()).status_code, 404)
        self.assertEqual(api.get('/api/projects/').data, [])

    def test_staff_agent_requires_membership(self):
        api = authenticated(self.agent)
        self.assertEqual(api.get(self.project_url()).status_code, 404)
        ProjectMember.objects.create(project=self.project, user=self.agent, role='contributor')
        self.assertEqual(api.get(self.project_url()).status_code, 200)
        self.assertEqual(authenticated(self.nonmember_agent).get(self.project_url()).status_code, 404)

    def test_member_cannot_belong_to_different_organization(self):
        r = self.owner_api.post(f'{self.project_url()}members/', {
            'user_id': str(self.other_client.id), 'role': 'client_reviewer',
        }, format='json')
        self.assertEqual(r.status_code, 400)
        r = self.owner_api.post(f'{self.project_url()}members/', {
            'user_id': str(self.foreign_owner.id), 'role': 'manager',
        }, format='json')
        self.assertEqual(r.status_code, 404)

    def test_only_managers_can_manage_members(self):
        r = authenticated(self.agent).get(f'{self.project_url()}members/')
        self.assertEqual(r.status_code, 404)
        r = authenticated(self.client_user).get(f'{self.project_url()}members/')
        self.assertEqual(r.status_code, 404)
        self.assertEqual(self.owner_api.get(f'{self.project_url()}members/').status_code, 200)

    def test_milestones_create_and_update(self):
        r = self.owner_api.post(f'{self.project_url()}milestones/', {
            'name': 'Design', 'status': 'planned',
        }, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        u = self.owner_api.patch(f'{self.project_url()}milestones/{r.data["id"]}/', {
            'status': 'completed',
        }, format='json')
        self.assertEqual(u.status_code, 200)
        self.assertEqual(u.data['status'], 'completed')

    def test_milestone_cannot_be_used_across_projects(self):
        another = Project.objects.create(
            tenant=self.tenant, client_org=self.other_org,
            created_by=self.owner, key='OTHER', name='Other',
        )
        foreign_milestone = ProjectMilestone.objects.create(project=another, name='Private')
        r = self.owner_api.post(f'{self.project_url()}work-items/', {
            'title': 'Invalid', 'milestone_id': str(foreign_milestone.id),
        }, format='json')
        self.assertEqual(r.status_code, 404)

    def test_work_items_get_stable_numbers_and_refs(self):
        first = self.owner_api.post(f'{self.project_url()}work-items/', {
            'title': 'Homepage', 'kind': 'feature',
        }, format='json')
        second = self.owner_api.post(f'{self.project_url()}work-items/', {
            'title': 'Checkout', 'kind': 'bug',
        }, format='json')
        self.assertEqual(first.status_code, 201, first.data)
        self.assertEqual(second.status_code, 201, second.data)
        self.assertEqual(first.data['ref'], 'SHOP-1')
        self.assertEqual(second.data['ref'], 'SHOP-2')
        self.assertEqual(self.owner_api.get(f'/api/work-items/{first.data["id"]}/').status_code, 200)

    def test_assignee_must_be_a_staff_project_member(self):
        r = self.owner_api.post(f'{self.project_url()}work-items/', {
            'title': 'Bug', 'assignee_id': str(self.nonmember_agent.id),
        }, format='json')
        self.assertEqual(r.status_code, 404)
        ProjectMember.objects.create(project=self.project, user=self.agent, role='contributor')
        r = self.owner_api.post(f'{self.project_url()}work-items/', {
            'title': 'Bug', 'assignee_id': str(self.agent.id),
        }, format='json')
        self.assertEqual(r.status_code, 201, r.data)

    def test_contributor_can_create_internal_but_cannot_publish(self):
        ProjectMember.objects.create(project=self.project, user=self.agent, role='contributor')
        api = authenticated(self.agent)
        r = api.post(f'{self.project_url()}work-items/', {'title': 'Internal task'}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        r = api.post(f'{self.project_url()}work-items/', {
            'title': 'Exposed', 'visibility': 'client',
        }, format='json')
        self.assertEqual(r.status_code, 403)

    def test_client_sees_only_published_work_items(self):
        ProjectMember.objects.create(project=self.project, user=self.client_user, role='client_reviewer')
        secret = WorkItem.objects.create(
            project=self.project, number=1, title='Private developer task', created_by=self.owner,
        )
        published = WorkItem.objects.create(
            project=self.project, number=2, title='Ready for Review', visibility='client', created_by=self.owner,
        )
        api = authenticated(self.client_user)
        r = api.get(f'{self.project_url()}work-items/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual([i['id'] for i in r.data], [str(published.id)])
        self.assertEqual(api.get(f'/api/work-items/{secret.id}/').status_code, 403)

    def test_client_can_comment_but_cannot_change_work(self):
        ProjectMember.objects.create(project=self.project, user=self.client_user, role='client_reviewer')
        item = WorkItem.objects.create(
            project=self.project, number=1, title='Design', visibility='client', created_by=self.owner,
        )
        api = authenticated(self.client_user)
        r = api.post(f'/api/work-items/{item.id}/comments/', {
            'body': 'Please make the header blue.',
        }, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data['visibility'], 'client')
        self.assertEqual(api.patch(f'/api/work-items/{item.id}/', {'status': 'done'}, format='json').status_code, 403)
        self.assertEqual(api.post(f'/api/work-items/{item.id}/comments/', {
            'body': 'Hidden edit', 'visibility': 'internal',
        }, format='json').status_code, 403)

    def test_client_does_not_see_internal_comments(self):
        ProjectMember.objects.create(project=self.project, user=self.client_user, role='client_reviewer')
        item = WorkItem.objects.create(
            project=self.project, number=1, title='UI', visibility='client', created_by=self.owner,
        )
        self.owner_api.post(f'/api/work-items/{item.id}/comments/', {
            'body': 'Internal engineering note',
        }, format='json')
        self.owner_api.post(f'/api/work-items/{item.id}/comments/', {
            'body': 'Public update', 'visibility': 'client',
        }, format='json')
        response = authenticated(self.client_user).get(f'/api/work-items/{item.id}/comments/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual([c['body'] for c in response.data], ['Public update'])

    def test_member_removal_rejects_assigned_work(self):
        member = ProjectMember.objects.create(project=self.project, user=self.agent, role='contributor')
        WorkItem.objects.create(
            project=self.project, number=1, title='Assigned', created_by=self.owner, assignee=self.agent,
        )
        r = self.owner_api.delete(f'{self.project_url()}members/{member.id}/')
        self.assertEqual(r.status_code, 400)
        self.assertTrue(ProjectMember.objects.filter(pk=member.id).exists())

    def test_client_cannot_edit_milestones_or_members(self):
        ProjectMember.objects.create(project=self.project, user=self.client_user, role='client_reviewer')
        api = authenticated(self.client_user)
        self.assertEqual(api.post(f'{self.project_url()}milestones/', {
            'name': 'Fake milestone',
        }, format='json').status_code, 403)
        self.assertEqual(api.post(f'{self.project_url()}members/', {
            'user_id': str(self.other_client.id), 'role': 'client_reviewer',
        }, format='json').status_code, 403)

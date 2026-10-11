"""Phase 4: Ticket Project Association safety and lifecycle tests."""
from django.core.exceptions import ValidationError as DjangoValidationError
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.tenants.models import ClientOrganization, Tenant
from apps.tickets.models import Ticket
from apps.users.models import User
from .models import Project, ProjectMember, TicketProjectAssociation, TicketWorkItemLink, WorkItem


def make_user(tenant, role, address, org=None):
    user = User.objects.create_user(
        email=address, password='test-secret',
        first_name='Example', last_name=role, role=role, tenant=tenant,
    )
    if org:
        user.client_org = org
        user.save()
    return user


def client_for(user):
    token = AccessToken.for_user(user)
    token['tenant_id'] = str(user.tenant_id)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {str(token)}')
    client.defaults['SERVER_NAME'] = 'localhost'
    return client


@override_settings(DEBUG=True)
class TicketProjectAssociationTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Alpha', slug='phase4-alpha')
        self.other_tenant = Tenant.objects.create(name='Beta', slug='phase4-beta')
        self.org_a = ClientOrganization.objects.create(
            tenant=self.tenant, name='Client A', is_active=True,
        )
        self.org_b = ClientOrganization.objects.create(
            tenant=self.tenant, name='Client B', is_active=True,
        )
        self.foreign_org = ClientOrganization.objects.create(
            tenant=self.other_tenant, name='Foreign Client', is_active=True,
        )
        self.walk_in = ClientOrganization.objects.create(
            tenant=self.tenant, name='Walk-In', is_active=True,
        )
        self.owner = make_user(self.tenant, 'msp_owner', 'phase4-owner@example.test')
        self.agent = make_user(self.tenant, 'msp_agent', 'phase4-agent@example.test')
        self.other_agent = make_user(self.tenant, 'msp_agent', 'phase4-otheragent@example.test')
        self.viewer = make_user(self.tenant, 'msp_agent', 'phase4-viewer@example.test')
        self.client = make_user(self.tenant, 'client_owner', 'phase4-client@example.test', self.org_a)
        self.foreign_owner = make_user(
            self.other_tenant, 'msp_owner', 'phase4-foreignowner@example.test',
        )
        self.project = Project.objects.create(
            tenant=self.tenant, client_org=self.org_a,
            key='SHOP', name='Shop Website', created_by=self.owner,
        )
        self.project_b = Project.objects.create(
            tenant=self.tenant, client_org=self.org_b,
            key='CRM', name='Client B Portal', created_by=self.owner,
        )
        self.foreign_project = Project.objects.create(
            tenant=self.other_tenant, client_org=self.foreign_org,
            key='OUTSIDE', name='Foreign', created_by=self.foreign_owner,
        )
        self.owner_api = client_for(self.owner)
        self.ticket = Ticket.objects.create(
            tenant=self.tenant, ticket_ref='T11102026-0001',
            seq=1, client_org=self.org_a,
            subject='Checkout issue', description='Checkout fails',
        )
        self.ticket_b = Ticket.objects.create(
            tenant=self.tenant, ticket_ref='T11102026-0002',
            seq=2, client_org=self.org_b,
            subject='Separate customer issue',
        )
        self.work = WorkItem.objects.create(
            project=self.project, number=1,
            kind='bug', title='Checkout bug', created_by=self.owner,
        )
        self.other_work = WorkItem.objects.create(
            project=self.project_b, number=1,
            kind='bug', title='Not the same client', created_by=self.owner,
        )
        # Existing work items normally advance this counter through the API.
        self.project.next_item_number = 2
        self.project.save()
        ProjectMember.objects.create(project=self.project, user=self.agent, role='contributor')
        ProjectMember.objects.create(project=self.project, user=self.viewer, role='viewer')

    def endpoint(self, ticket=None):
        return f'/api/tickets/{(ticket or self.ticket).ticket_ref}/project-association/'

    def work_endpoint(self, ticket=None):
        return f'/api/tickets/{(ticket or self.ticket).ticket_ref}/project-work-items/'

    def link_project(self, project=None):
        return self.owner_api.put(
            self.endpoint(), {'project_id': str((project or self.project).id)},
            format='json',
        )

    def test_unlinked_state_is_explicit_and_has_no_work_items(self):
        response = self.owner_api.get(self.endpoint())
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['linked'])
        self.assertEqual(response.data['work_items'], [])
        self.assertFalse(TicketProjectAssociation.objects.exists())

    def test_staff_can_manually_link_project_without_creating_work_item(self):
        response = self.link_project()
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['project']['id'], str(self.project.id))
        self.assertEqual(response.data['source'], 'manual')
        self.assertEqual(response.data['work_items'], [])
        self.assertEqual(WorkItem.objects.count(), 2)
        self.assertEqual(TicketWorkItemLink.objects.count(), 0)
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.status, 'open')
        self.assertEqual(self.ticket.description, 'Checkout fails')

    def test_linking_project_again_is_idempotent(self):
        self.link_project()
        self.link_project()
        self.assertEqual(TicketProjectAssociation.objects.count(), 1)

    def test_staff_contributor_can_link_if_member(self):
        response = client_for(self.agent).put(
            self.endpoint(), {'project_id': str(self.project.id)}, format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)

    def test_project_viewer_cannot_create_link(self):
        response = client_for(self.viewer).put(
            self.endpoint(), {'project_id': str(self.project.id)}, format='json',
        )
        self.assertEqual(response.status_code, 403)

    def test_other_agent_cannot_link_inaccessible_project(self):
        response = client_for(self.other_agent).put(
            self.endpoint(), {'project_id': str(self.project.id)}, format='json',
        )
        self.assertEqual(response.status_code, 404)

    def test_client_has_no_access_to_staff_association_endpoints(self):
        self.link_project()
        client = client_for(self.client)
        self.assertEqual(client.get(self.endpoint()).status_code, 403)
        self.assertEqual(client.put(self.endpoint(), {
            'project_id': str(self.project.id),
        }, format='json').status_code, 403)
        self.assertEqual(client.post(self.work_endpoint(), {
            'work_item_id': str(self.work.id),
        }, format='json').status_code, 403)
        self.assertEqual(client.delete(self.endpoint()).status_code, 403)

    def test_other_tenant_user_cannot_discover_ticket(self):
        response = client_for(self.foreign_owner).get(self.endpoint())
        self.assertEqual(response.status_code, 404)

    def test_ticket_cannot_link_another_tenant_project(self):
        response = self.owner_api.put(self.endpoint(), {
            'project_id': str(self.foreign_project.id),
        }, format='json')
        self.assertEqual(response.status_code, 404)

    def test_ticket_cannot_link_another_client_project(self):
        response = self.owner_api.put(self.endpoint(), {
            'project_id': str(self.project_b.id),
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertFalse(TicketProjectAssociation.objects.exists())

    def test_orgless_ticket_cannot_link_project(self):
        ticket = Ticket.objects.create(
            tenant=self.tenant, ticket_ref='T11102026-0003',
            seq=3, subject='Unknown customer',
        )
        response = self.owner_api.put(self.endpoint(ticket), {
            'project_id': str(self.project.id),
        }, format='json')
        self.assertEqual(response.status_code, 400)

    def test_walk_in_ticket_requires_verified_client_org(self):
        ticket = Ticket.objects.create(
            tenant=self.tenant, ticket_ref='T11102026-0004',
            seq=4, subject='Unverified sender', client_org=self.walk_in,
        )
        walk_project = Project.objects.create(
            tenant=self.tenant, client_org=self.walk_in,
            key='WALK', name='Walk In Work', created_by=self.owner,
        )
        response = self.owner_api.put(self.endpoint(ticket), {
            'project_id': str(walk_project.id),
        }, format='json')
        self.assertEqual(response.status_code, 400)

    def test_manual_link_to_existing_work_item(self):
        self.link_project()
        response = self.owner_api.post(self.work_endpoint(), {
            'work_item_id': str(self.work.id),
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['work_items'][0]['ref'], 'SHOP-1')
        self.assertTrue(TicketWorkItemLink.objects.filter(
            ticket=self.ticket, work_item=self.work,
        ).exists())
        self.assertEqual(self.owner_api.get(
            f'/api/work-items/{self.work.id}/support-tickets/',
        ).data[0]['ref'], self.ticket.ticket_ref)

    def test_work_item_link_duplicate_is_idempotent(self):
        self.link_project()
        for _ in range(2):
            response = self.owner_api.post(self.work_endpoint(), {
                'work_item_id': str(self.work.id),
            }, format='json')
            self.assertEqual(response.status_code, 200)
        self.assertEqual(TicketWorkItemLink.objects.count(), 1)

    def test_wrong_project_work_item_rejected(self):
        self.link_project()
        response = self.owner_api.post(self.work_endpoint(), {
            'work_item_id': str(self.other_work.id),
        }, format='json')
        self.assertEqual(response.status_code, 404)

    def test_work_item_cannot_be_linked_before_project(self):
        response = self.owner_api.post(self.work_endpoint(), {
            'work_item_id': str(self.work.id),
        }, format='json')
        self.assertEqual(response.status_code, 400)

    def test_project_change_rejected_until_work_items_unlinked(self):
        self.link_project()
        self.owner_api.post(self.work_endpoint(), {'work_item_id': str(self.work.id)}, format='json')
        second = Project.objects.create(
            tenant=self.tenant, client_org=self.org_a, key='APP',
            name='Mobile App', created_by=self.owner,
        )
        response = self.owner_api.put(self.endpoint(), {
            'project_id': str(second.id),
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.project_association.project_id, self.project.id)
        self.assertEqual(TicketWorkItemLink.objects.count(), 1)
        self.assertEqual(self.owner_api.delete(self.endpoint()).status_code, 400)
        self.assertEqual(self.owner_api.delete(
            f'{self.work_endpoint()}{self.work.id}/',
        ).status_code, 204)
        response = self.owner_api.put(self.endpoint(), {
            'project_id': str(second.id),
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['project']['id'], str(second.id))

    def test_project_unlink_requires_no_work_items(self):
        self.link_project()
        self.assertEqual(self.owner_api.delete(self.endpoint()).status_code, 204)
        self.assertFalse(TicketProjectAssociation.objects.exists())
        self.assertEqual(self.owner_api.get(self.endpoint()).data['work_items'], [])

    def test_linked_work_item_creation_is_atomic_and_saves_reference(self):
        self.link_project()
        response = self.owner_api.post(
            f'{self.work_endpoint()}create/',
            {'title': 'Fix checkout', 'kind': 'bug', 'status': 'todo'},
            format='json',
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['ref'], 'SHOP-2')
        created = WorkItem.objects.get(pk=response.data['id'])
        self.assertEqual(created.kind, 'bug')
        self.assertEqual(created.status, 'todo')
        self.assertTrue(TicketWorkItemLink.objects.filter(
            ticket=self.ticket, work_item=created,
        ).exists())
        self.project.refresh_from_db()
        self.assertEqual(self.project.next_item_number, 3)

    def test_failed_work_item_create_does_not_increment_project_counter(self):
        self.link_project()
        initial_number = self.project.next_item_number
        response = self.owner_api.post(f'{self.work_endpoint()}create/', {
            'title': 'Invalid milestone', 'milestone_id': str(self.foreign_project.id),
        }, format='json')
        self.assertEqual(response.status_code, 404)
        self.project.refresh_from_db()
        self.assertEqual(self.project.next_item_number, initial_number)
        self.assertEqual(TicketWorkItemLink.objects.count(), 0)

    def test_contributor_creates_internal_bug_but_cannot_publish(self):
        self.link_project()
        api = client_for(self.agent)
        create = api.post(f'{self.work_endpoint()}create/', {
            'title': 'Internal fix', 'kind': 'bug',
        }, format='json')
        self.assertEqual(create.status_code, 201, create.data)
        forbidden = api.post(f'{self.work_endpoint()}create/', {
            'title': 'Public bug', 'visibility': 'client',
        }, format='json')
        self.assertEqual(forbidden.status_code, 403)

    def test_client_organization_change_blocked_while_linked(self):
        self.link_project()
        response = self.owner_api.patch(
            f'/api/tickets/{self.ticket.ticket_ref}/',
            {'client_org_id': str(self.org_b.id)}, format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.client_org_id, self.org_a.id)

    def test_ticket_org_change_allowed_after_unlink(self):
        self.link_project()
        self.assertEqual(self.owner_api.delete(self.endpoint()).status_code, 204)
        response = self.owner_api.patch(
            f'/api/tickets/{self.ticket.ticket_ref}/',
            {'client_org_id': str(self.org_b.id)}, format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.client_org_id, self.org_b.id)

    def test_unlink_same_project_does_not_change_ticket_status(self):
        self.link_project()
        self.owner_api.delete(self.endpoint())
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.status, 'open')

    def test_inaccessible_project_association_does_not_leak_project(self):
        self.link_project()
        response = client_for(self.other_agent).get(self.endpoint())
        self.assertEqual(response.status_code, 403)
        self.assertNotIn(self.project.name, str(response.data))

    def test_readonly_project_member_cannot_unlink_or_add_work_item(self):
        self.link_project()
        api = client_for(self.viewer)
        self.assertEqual(api.get(self.endpoint()).status_code, 200)
        self.assertFalse(api.get(self.endpoint()).data['can_edit'])
        self.assertEqual(api.delete(self.endpoint()).status_code, 403)
        self.assertEqual(api.post(self.work_endpoint(), {
            'work_item_id': str(self.work.id),
        }, format='json').status_code, 403)

    def test_model_validation_blocks_cross_client_org_manual_link(self):
        with self.assertRaises(DjangoValidationError):
            TicketProjectAssociation.objects.create(
                ticket=self.ticket_b, project=self.project, linked_by=self.owner,
            )

    def test_model_validation_blocks_cross_project_work_item(self):
        self.link_project()
        with self.assertRaises(DjangoValidationError):
            TicketWorkItemLink.objects.create(
                ticket=self.ticket, work_item=self.other_work, linked_by=self.owner,
            )

    def test_merged_secondary_ticket_cannot_be_linked(self):
        self.ticket.merge_status = 'secondary'
        self.ticket.merged_into = self.ticket_b
        self.ticket.save()
        response = self.link_project()
        self.assertEqual(response.status_code, 400)

    def test_work_item_reverse_ticket_links_are_staff_only(self):
        self.link_project()
        self.owner_api.post(self.work_endpoint(), {'work_item_id': str(self.work.id)}, format='json')
        url = f'/api/work-items/{self.work.id}/support-tickets/'
        self.assertEqual(len(self.owner_api.get(url).data), 1)
        self.assertEqual(client_for(self.client).get(url).status_code, 403)
        self.assertEqual(client_for(self.foreign_owner).get(url).status_code, 404)

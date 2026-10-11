"""Phase 8A regression: unified requests, project intake, permissions and conversion."""
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.tenants.models import Tenant, ClientOrganization
from apps.tickets.models import Ticket, Reply
from apps.users.models import User
from .models import Project, ProjectMember, ProjectRequest, ProjectAgentPermission, TicketProjectAssociation


def actor(tenant, email, role, org=None):
    return User.objects.create_user(
        tenant=tenant, email=email, password='test-secret',
        first_name=email.split('@')[0], role=role, client_org=org,
    )


def client_for(user):
    token = AccessToken.for_user(user)
    token['tenant_id'] = str(user.tenant_id)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION='Bearer ' + str(token))
    client.defaults['SERVER_NAME'] = 'localhost'
    return client


@override_settings(
    DEBUG=True,
    PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'],
)
class ProjectRequestPhase8ATests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Projects Beta', slug='phase8a-tenant')
        self.other_tenant = Tenant.objects.create(name='Different MSP', slug='phase8a-other')
        self.org = ClientOrganization.objects.create(tenant=self.tenant, name='Web Client', is_active=True)
        self.other_org = ClientOrganization.objects.create(tenant=self.tenant, name='Private Client', is_active=True)
        self.foreign_org = ClientOrganization.objects.create(
            tenant=self.other_tenant, name='Foreign Client', is_active=True,
        )
        self.owner = actor(self.tenant, 'owner@beta.test', 'msp_owner')
        self.manager = actor(self.tenant, 'manager@beta.test', 'msp_manager')
        self.agent = actor(self.tenant, 'agent@beta.test', 'msp_agent')
        self.other_agent = actor(self.tenant, 'agent2@beta.test', 'msp_agent')
        self.client_owner = actor(self.tenant, 'client@web.test', 'client_owner', self.org)
        self.end_user = actor(self.tenant, 'enduser@web.test', 'end_user', self.org)
        self.second_end_user = actor(self.tenant, 'second@web.test', 'end_user', self.org)
        self.other_client = actor(self.tenant, 'other@private.test', 'client_owner', self.other_org)
        self.foreign_client = actor(
            self.other_tenant, 'foreign@client.test', 'client_owner', self.foreign_org,
        )
        self.owner_api = client_for(self.owner)
        self.manager_api = client_for(self.manager)
        self.agent_api = client_for(self.agent)
        self.client_api = client_for(self.client_owner)
        self.end_api = client_for(self.end_user)
        self.other_client_api = client_for(self.other_client)
        self.foreign_api = client_for(self.foreign_client)

    def request_payload(self, name='New Website'):
        return {
            'name': name, 'kind': 'web_development',
            'description': 'A reliable new website for our company.',
            'requirements': 'Customer portal and catalog',
            'budget': '1500.00', 'budget_currency': 'USD',
            'expected_date': '2026-12-20',
        }

    def submit(self, api=None, name='New Website'):
        response = (api or self.client_api).post(
            '/api/project-requests/', self.request_payload(name), format='json',
        )
        self.assertEqual(response.status_code, 201, response.data)
        return response.data

    def claim(self, request_id, api=None):
        return (api or self.agent_api).post(
            f'/api/project-requests/{request_id}/claim/', {}, format='json',
        )

    def review(self, request_id, status='approved', api=None, note='Reviewed and approved.'):
        return (api or self.agent_api).patch(
            f'/api/project-requests/{request_id}/',
            {'status': status, 'note': note}, format='json',
        )

    def grant(self, allow=True, user=None, api=None):
        user = user or self.agent
        return (api or self.owner_api).put(
            f'/api/projects/agent-permissions/{user.id}/',
            {'can_create_projects': allow}, format='json',
        )

    def convert(self, request_id, api=None, key='WEBDEV'):
        return (api or self.agent_api).post(
            f'/api/project-requests/{request_id}/convert/',
            {'key': key}, format='json',
        )

    def test_client_owner_can_submit_with_original_ticket(self):
        data = self.submit()
        row = ProjectRequest.objects.get(pk=data['id'])
        self.assertEqual(row.tenant, self.tenant)
        self.assertEqual(row.client_org, self.org)
        self.assertEqual(row.requested_by, self.client_owner)
        self.assertEqual(row.ticket.client_org, self.org)
        self.assertEqual(row.ticket.category, 'Project Request')
        self.assertEqual(row.ticket.requester, self.client_owner)
        self.assertEqual(row.budget, 1500)
        self.assertEqual(row.status, 'submitted')
        self.assertTrue(row.ticket.replies.exists())

    def test_end_user_can_submit_request(self):
        row = self.submit(self.end_api)
        self.assertEqual(ProjectRequest.objects.get(pk=row['id']).requested_by, self.end_user)

    def test_staff_cannot_submit_client_project_request(self):
        response = self.owner_api.post('/api/project-requests/', self.request_payload(), format='json')
        self.assertEqual(response.status_code, 403)
        self.assertEqual(ProjectRequest.objects.count(), 0)

    def test_submission_requires_name_and_description(self):
        payload = self.request_payload()
        payload['description'] = '   '
        r = self.client_api.post('/api/project-requests/', payload, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(Ticket.objects.count(), 0)

    def test_rejects_invalid_kind_and_budget(self):
        payload = self.request_payload()
        payload['kind'] = 'invalid'
        self.assertEqual(self.client_api.post('/api/project-requests/', payload, format='json').status_code, 400)
        payload['kind'] = 'web_development'
        payload['budget'] = '-40.00'
        self.assertEqual(self.client_api.post('/api/project-requests/', payload, format='json').status_code, 400)

    def test_request_is_visible_to_requester_and_organization_owner(self):
        row = self.submit(self.end_api)
        self.assertEqual(self.end_api.get(f"/api/project-requests/{row['id']}/").status_code, 200)
        self.assertEqual(self.client_api.get(f"/api/project-requests/{row['id']}/").status_code, 200)

    def test_end_user_does_not_see_other_users_request(self):
        row = self.submit(self.client_api)
        self.assertEqual(self.end_api.get(f"/api/project-requests/{row['id']}/").status_code, 404)
        self.assertEqual(self.end_api.get('/api/project-requests/').data, [])

    def test_other_organization_cannot_read_request(self):
        row = self.submit()
        self.assertEqual(self.other_client_api.get(f"/api/project-requests/{row['id']}/").status_code, 404)
        self.assertEqual(self.other_client_api.get('/api/project-requests/').data, [])

    def test_cross_tenant_client_cannot_read_or_claim_request(self):
        row = self.submit()
        self.assertEqual(self.foreign_api.get(f"/api/project-requests/{row['id']}/").status_code, 404)
        self.assertEqual(self.foreign_api.post(f"/api/project-requests/{row['id']}/claim/").status_code, 403)

    def test_client_cannot_claim_review_or_convert(self):
        row = self.submit()
        self.assertEqual(self.client_api.post(f"/api/project-requests/{row['id']}/claim/").status_code, 403)
        self.assertEqual(self.review(row['id'], api=self.client_api).status_code, 403)
        self.assertEqual(self.convert(row['id'], api=self.client_api).status_code, 403)

    def test_agent_claims_unassigned_request(self):
        row = self.submit()
        r = self.claim(row['id'])
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['assigned_agent_id'], str(self.agent.id))
        self.assertEqual(self.claim(row['id']).status_code, 200)

    def test_second_agent_cannot_claim_assigned_request(self):
        row = self.submit()
        self.claim(row['id'])
        r = self.claim(row['id'], client_for(self.other_agent))
        self.assertEqual(r.status_code, 400)

    def test_unassigned_agent_cannot_review_request(self):
        row = self.submit()
        self.assertEqual(self.review(row['id']).status_code, 403)

    def test_assigned_agent_can_review_and_approve(self):
        row = self.submit()
        self.claim(row['id'])
        reviewed = self.review(row['id'])
        self.assertEqual(reviewed.status_code, 200, reviewed.data)
        self.assertEqual(reviewed.data['status'], 'approved')
        self.assertEqual(Ticket.objects.get(ticket_ref=row['ticket_ref']).status, 'in_progress')
        self.assertTrue(Reply.objects.filter(body='Reviewed and approved.').exists())

    def test_manager_can_review_unassigned_request(self):
        row = self.submit()
        r = self.review(row['id'], api=self.manager_api)
        self.assertEqual(r.status_code, 200, r.data)

    def test_rejection_requires_explanation(self):
        row = self.submit()
        self.claim(row['id'])
        self.assertEqual(self.review(row['id'], 'rejected', note='').status_code, 400)
        self.assertEqual(ProjectRequest.objects.get(pk=row['id']).status, 'submitted')

    def test_rejected_request_cannot_be_reopened(self):
        row = self.submit()
        self.claim(row['id'])
        self.assertEqual(self.review(row['id'], 'rejected').status_code, 200)
        self.assertEqual(self.review(row['id'], 'under_review').status_code, 400)

    def test_conversion_requires_approval(self):
        row = self.submit()
        self.claim(row['id'])
        self.grant()
        self.assertEqual(self.convert(row['id']).status_code, 400)
        self.assertEqual(Project.objects.count(), 0)

    def test_agent_creation_denied_until_granted(self):
        response = self.agent_api.post('/api/projects/', {
            'client_org_id': str(self.org.id), 'key': 'UNGRANTED', 'name': 'Not permitted',
        }, format='json')
        self.assertEqual(response.status_code, 403)
        self.assertFalse(self.agent_api.get('/api/projects/capabilities/').data['can_create_projects'])

    def test_manager_can_grant_agent_project_create(self):
        self.assertEqual(self.grant().status_code, 200)
        self.assertTrue(self.agent_api.get('/api/projects/capabilities/').data['can_create_projects'])
        response = self.agent_api.post('/api/projects/', {
            'client_org_id': str(self.org.id), 'key': 'GRANTED', 'name': 'Agent Created',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertTrue(ProjectMember.objects.filter(project_id=response.data['id'], user=self.agent, role='manager').exists())

    def test_other_agent_cannot_review_even_if_granted(self):
        row = self.submit()
        self.claim(row['id'])
        self.grant(user=self.other_agent)
        self.assertEqual(self.review(row['id'], api=client_for(self.other_agent)).status_code, 403)

    def test_client_cannot_grant_agent_permission(self):
        self.assertEqual(self.grant(api=self.client_api).status_code, 403)
        self.assertEqual(ProjectAgentPermission.objects.count(), 0)

    def test_cannot_grant_foreign_tenant_user(self):
        self.assertEqual(self.grant(user=self.foreign_client).status_code, 404)

    def test_cannot_grant_permission_to_client_user(self):
        self.assertEqual(self.grant(user=self.client_owner).status_code, 404)

    def test_agent_permission_can_be_revoked(self):
        self.grant()
        self.grant(allow=False)
        self.assertFalse(self.agent_api.get('/api/projects/capabilities/').data['can_create_projects'])

    def test_conversion_preserves_original_ticket_and_creates_client_project(self):
        row = self.submit()
        self.claim(row['id'])
        self.review(row['id'])
        self.grant()
        converted = self.convert(row['id'])
        self.assertEqual(converted.status_code, 201, converted.data)
        project = Project.objects.get(pk=converted.data['converted_project_id'])
        self.assertEqual(project.visibility, 'client')
        self.assertEqual(project.client_org, self.org)
        self.assertEqual(project.key, 'WEBDEV')
        self.assertIn('Customer portal', project.description)
        self.assertTrue(ProjectMember.objects.filter(project=project, user=self.agent, role='manager').exists())
        self.assertTrue(ProjectMember.objects.filter(project=project, user=self.client_owner, role='client_reviewer').exists())
        self.assertTrue(TicketProjectAssociation.objects.filter(project=project, ticket__ticket_ref=row['ticket_ref']).exists())
        self.assertTrue(Ticket.objects.filter(ticket_ref=row['ticket_ref']).exists())
        self.assertEqual(self.client_api.get('/api/projects/').data[0]['id'], str(project.id))

    def test_conversion_is_idempotent(self):
        row = self.submit()
        self.claim(row['id'])
        self.review(row['id'])
        self.grant()
        one = self.convert(row['id'])
        two = self.convert(row['id'])
        self.assertEqual(one.status_code, 201, one.data)
        self.assertEqual(two.status_code, 200, two.data)
        self.assertEqual(Project.objects.count(), 1)

    def test_unrelated_agent_cannot_convert_granted_request(self):
        row = self.submit()
        self.claim(row['id'])
        self.review(row['id'])
        self.grant(user=self.other_agent)
        self.assertEqual(self.convert(row['id'], api=client_for(self.other_agent)).status_code, 403)

    def test_conversion_detects_project_key_conflict(self):
        row = self.submit()
        self.claim(row['id'])
        self.review(row['id'])
        self.grant()
        Project.objects.create(
            tenant=self.tenant, client_org=self.org, key='WEBDEV', name='Existing', created_by=self.owner,
        )
        self.assertEqual(self.convert(row['id']).status_code, 400)
        self.assertEqual(ProjectRequest.objects.get(pk=row['id']).status, 'approved')

    def test_unified_queue_has_one_project_row_after_conversion(self):
        row = self.submit()
        before = self.agent_api.get('/api/requests/workspace/')
        self.assertEqual(before.status_code, 200)
        self.assertEqual([item['kind'] for item in before.data['results']], ['project_request'])
        self.claim(row['id'])
        self.review(row['id'])
        self.grant()
        self.convert(row['id'])
        after = self.agent_api.get('/api/requests/workspace/')
        self.assertEqual(after.status_code, 200, after.data)
        self.assertEqual([item['kind'] for item in after.data['results']], ['project'])
        self.assertEqual(after.data['count'], 1)
        self.assertTrue(self.agent_api.get('/api/tickets/').status_code == 200)

    def test_new_request_visible_in_client_unified_queue(self):
        row = self.submit()
        result = self.client_api.get('/api/requests/workspace/')
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.data['results'][0]['kind'], 'project_request')
        self.assertIn(row['id'], result.data['results'][0]['href'])

    def test_other_org_and_tenant_not_in_queue(self):
        self.submit()
        self.assertEqual(self.other_client_api.get('/api/requests/workspace/').data['count'], 0)
        self.assertEqual(self.foreign_api.get('/api/requests/workspace/').data['count'], 0)

    def test_internal_ticket_visible_to_staff_not_clients(self):
        Ticket.objects.create(
            tenant=self.tenant, ticket_ref='T10112026-9000', seq=9000, subject='Internal ticket',
            is_internal=True,
        )
        self.assertEqual(self.owner_api.get('/api/requests/workspace/?kind=tickets').data['count'], 1)
        self.assertEqual(self.client_api.get('/api/requests/workspace/?kind=tickets').data['count'], 0)

    def test_original_project_request_ticket_cannot_be_deleted(self):
        row = self.submit()
        response = self.owner_api.post('/api/tickets/bulk/', {
            'refs': [row['ticket_ref']], 'action': 'delete',
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertTrue(Ticket.objects.filter(ticket_ref=row['ticket_ref']).exists())

    def test_original_request_cannot_be_merged(self):
        row = self.submit()
        ticket2 = Ticket.objects.create(
            tenant=self.tenant, ticket_ref='T10112026-9001', seq=9001, subject='Second',
        )
        response = self.owner_api.post(
            f"/api/tickets/{row['ticket_ref']}/merge/",
            {'target_ref': ticket2.ticket_ref}, format='json',
        )
        self.assertEqual(response.status_code, 400)

    def test_inactive_client_org_request_is_not_retrievable(self):
        row = self.submit()
        self.org.is_active = False
        self.org.save()
        self.assertEqual(self.client_api.get(f"/api/project-requests/{row['id']}/").status_code, 404)

    def test_cross_org_project_creation_rejected_for_agent(self):
        self.grant()
        r = self.agent_api.post('/api/projects/', {
            'client_org_id': str(self.foreign_org.id),
            'key': 'EVIL', 'name': 'Foreign',
        }, format='json')
        self.assertEqual(r.status_code, 404)

    def test_project_request_limits_file_extensions(self):
        payload = self.request_payload()
        payload['attachments'] = SimpleUploadedFile('evil.html', b'<script></script>', content_type='text/html')
        response = self.client_api.post('/api/project-requests/', payload, format='multipart')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(ProjectRequest.objects.count(), 0)

    def test_review_history_does_not_rewrite_ticket_message(self):
        row = self.submit()
        self.claim(row['id'])
        self.review(row['id'], status='awaiting_details', note='Please send page designs.')
        ticket = Ticket.objects.get(ticket_ref=row['ticket_ref'])
        self.assertEqual(ticket.status, 'waiting_on_customer')
        self.assertTrue(ticket.replies.filter(body='Please send page designs.').exists())
        self.assertEqual(ticket.description, 'A reliable new website for our company.')


    def test_valid_pdf_attachment_is_downloadable_only_by_authorized_users(self):
        from tempfile import TemporaryDirectory
        from django.test import override_settings
        from apps.tickets.models import Attachment
        with TemporaryDirectory() as folder, override_settings(MEDIA_ROOT=folder):
            payload = self.request_payload()
            payload['attachments'] = SimpleUploadedFile(
                'brief.pdf', b'%PDF-1.4\nProject brief\n%%EOF',
                content_type='application/pdf',
            )
            response = self.client_api.post('/api/project-requests/', payload, format='multipart')
            self.assertEqual(response.status_code, 201, response.data)
            ticket = Ticket.objects.get(ticket_ref=response.data['ticket_ref'])
            attachment = Attachment.objects.get(ticket=ticket)
            url = f'/api/files/{attachment.id}/'
            owner_read = self.client_api.get(url)
            self.assertEqual(owner_read.status_code, 200)
            self.assertIn('attachment', owner_read['Content-Disposition'])
            self.assertEqual(self.owner_api.get(url).status_code, 200)
            self.assertEqual(self.other_client_api.get(url).status_code, 404)
            self.assertEqual(self.end_api.get(url).status_code, 404)
            self.assertEqual(self.foreign_api.get(url).status_code, 404)

    def test_internal_note_attachment_hidden_from_client(self):
        from tempfile import TemporaryDirectory
        from django.test import override_settings
        from apps.tickets.models import Attachment
        with TemporaryDirectory() as folder, override_settings(MEDIA_ROOT=folder):
            data = self.submit()
            ticket = Ticket.objects.get(ticket_ref=data['ticket_ref'])
            note = Reply.objects.create(
                ticket=ticket, author=self.owner, type='internal_note',
                body='Internal pricing discussion',
            )
            attachment = Attachment.objects.create(
                tenant=self.tenant, reply=note,
                file=SimpleUploadedFile('internal.png', b'\x89PNG\r\n\x1a\n', content_type='image/png'),
                filename='internal.png', size=8,
            )
            url = f'/api/files/{attachment.id}/'
            self.assertEqual(self.client_api.get(url).status_code, 404)
            self.assertEqual(self.owner_api.get(url).status_code, 200)

    def test_request_owner_list_retains_converted_history(self):
        data = self.submit()
        self.claim(data['id'])
        self.review(data['id'])
        self.grant()
        self.convert(data['id'])
        list_data = self.client_api.get('/api/project-requests/').data
        self.assertEqual(len(list_data), 1)
        self.assertEqual(list_data[0]['status'], 'converted')
        self.assertEqual(list_data[0]['ticket_ref'], data['ticket_ref'])


    def test_ticket_created_automation_cannot_preconvert_project_request(self):
        from apps.automation.models import AutomationRule
        project = Project.objects.create(
            tenant=self.tenant, client_org=self.org, key='AUTOLINK',
            name='Existing Website', created_by=self.owner,
        )
        AutomationRule.objects.create(
            tenant=self.tenant, name='Route All New Tickets', trigger='ticket_created',
            priority_order=1, scope_type='specific_org', scope_org=self.org,
            actions=[{'type': 'link_to_project', 'value': str(project.id)}],
        )
        row = self.submit()
        self.assertFalse(TicketProjectAssociation.objects.filter(
            ticket__ticket_ref=row['ticket_ref'],
        ).exists())
        self.assertEqual(ProjectRequest.objects.get(pk=row['id']).status, 'submitted')

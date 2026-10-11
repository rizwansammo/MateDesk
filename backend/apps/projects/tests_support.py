"""Phase 8B: Project support, activity timeline and unified attention isolation tests."""
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.automation.models import AutomationRule
from apps.tenants.models import Tenant, ClientOrganization
from apps.tickets.models import Ticket, Reply
from apps.users.models import User
from .models import (
    Project, ProjectMember, WorkItem, WorkItemComment,
    ProjectActivity, ProjectActivityRead, ProjectMilestone,
    TicketProjectAssociation, TicketWorkItemLink,
)
from .tests_requests import actor, client_for


@override_settings(
    DEBUG=True,
    PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'],
)
class ProjectSupportPhase8BTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Phase 8B MSP', slug='phase8b')
        self.foreign_tenant = Tenant.objects.create(name='Different MSP', slug='phase8b-foreign')
        self.org = ClientOrganization.objects.create(
            tenant=self.tenant, name='Acme Web Development', is_active=True,
        )
        self.other_org = ClientOrganization.objects.create(
            tenant=self.tenant, name='Different Client', is_active=True,
        )
        self.foreign_org = ClientOrganization.objects.create(
            tenant=self.foreign_tenant, name='Foreign Client', is_active=True,
        )
        self.owner = actor(self.tenant, 'owner@phase8b.test', 'msp_owner')
        self.agent = actor(self.tenant, 'agent@phase8b.test', 'msp_agent')
        self.unrelated_agent = actor(self.tenant, 'other-agent@phase8b.test', 'msp_agent')
        self.client_owner = actor(self.tenant, 'client-owner@phase8b.test', 'client_owner', self.org)
        self.end_user = actor(self.tenant, 'end-user@phase8b.test', 'end_user', self.org)
        self.second_user = actor(self.tenant, 'end-user2@phase8b.test', 'end_user', self.org)
        self.other_client = actor(self.tenant, 'other-client@phase8b.test', 'client_owner', self.other_org)
        self.foreign_client = actor(
            self.foreign_tenant, 'foreign-client@phase8b.test', 'client_owner', self.foreign_org,
        )
        self.project = Project.objects.create(
            tenant=self.tenant, client_org=self.org,
            key='SHOP', name='Ecommerce Website',
            created_by=self.owner, visibility='client',
            status='active',
        )
        ProjectMember.objects.create(project=self.project, user=self.owner, role='manager')
        ProjectMember.objects.create(project=self.project, user=self.agent, role='contributor')
        ProjectMember.objects.create(project=self.project, user=self.client_owner, role='client_reviewer')
        ProjectMember.objects.create(project=self.project, user=self.end_user, role='client_reviewer')
        ProjectMember.objects.create(project=self.project, user=self.second_user, role='client_reviewer')
        self.public_item = WorkItem.objects.create(
            project=self.project, number=1, title='Checkout',
            created_by=self.owner, visibility='client',
        )
        self.internal_item = WorkItem.objects.create(
            project=self.project, number=2, title='Private Configuration',
            created_by=self.owner, visibility='internal',
        )
        self.owner_api = client_for(self.owner)
        self.agent_api = client_for(self.agent)
        self.client_api = client_for(self.client_owner)
        self.end_api = client_for(self.end_user)
        self.second_api = client_for(self.second_user)
        self.other_api = client_for(self.other_client)
        self.foreign_api = client_for(self.foreign_client)
        self.support_url = f'/api/projects/{self.project.id}/support-tickets/'
        self.activity_url = f'/api/projects/{self.project.id}/activity/'
        self.queue_url = '/api/requests/workspace/'

    def create_support(self, api=None, **changes):
        payload = {
            'subject': 'Cart checkout not working',
            'description': 'Checkout gives 500 after payment.',
            'priority': 'high',
        }
        payload.update(changes)
        return (api or self.client_api).post(self.support_url, payload, format='json')

    def client_feedback(self, author=None, item=None, visibility='client'):
        return WorkItemComment.objects.create(
            work_item=item or self.public_item,
            author=author or self.client_owner,
            body='This checkout needs another revision.',
            visibility=visibility,
        )

    def test_project_support_ticket_can_be_created_by_reviewer(self):
        result = self.create_support()
        self.assertEqual(result.status_code, 201, result.data)
        ticket = Ticket.objects.get(ticket_ref=result.data['ref'])
        self.assertEqual(ticket.requester, self.client_owner)
        self.assertEqual(ticket.client_org, self.org)
        self.assertEqual(ticket.category, 'Project Support')
        self.assertEqual(ticket.priority, 'high')
        self.assertEqual(ticket.status, 'open')
        self.assertEqual(ticket.project_association.project, self.project)
        self.assertTrue(ticket.replies.filter(type='system_event').exists())

    def test_client_end_user_can_create_project_support_ticket(self):
        result = self.create_support(api=self.end_api)
        self.assertEqual(result.status_code, 201, result.data)
        self.assertEqual(Ticket.objects.get(pk=result.data['id']).requester, self.end_user)

    def test_cross_tenant_user_cannot_submit(self):
        self.assertEqual(self.create_support(api=self.foreign_api).status_code, 404)
        self.assertEqual(Ticket.objects.count(), 0)

    def test_other_organization_cannot_submit(self):
        self.assertEqual(self.create_support(api=self.other_api).status_code, 404)
        self.assertEqual(Ticket.objects.count(), 0)

    def test_unshared_client_cannot_submit_even_in_same_organization(self):
        outsider = actor(self.tenant, 'no-access@phase8b.test', 'end_user', self.org)
        self.assertEqual(self.create_support(api=client_for(outsider)).status_code, 404)

    def test_unrelated_agent_cannot_read_project_support(self):
        self.assertEqual(client_for(self.unrelated_agent).get(self.support_url).status_code, 404)

    def test_msp_agent_cannot_use_client_only_create_endpoint(self):
        self.assertEqual(self.create_support(api=self.agent_api).status_code, 403)

    def test_client_cannot_use_internal_project_for_support(self):
        self.project.visibility = 'internal'
        self.project.save()
        self.assertEqual(self.create_support().status_code, 404)

    def test_cannot_create_in_archived_project(self):
        self.project.status = 'archived'
        self.project.save()
        self.assertEqual(self.create_support().status_code, 403)

    def test_completed_project_still_accepts_follow_up_support(self):
        self.project.status = 'completed'
        self.project.save()
        self.assertEqual(self.create_support().status_code, 201)

    def test_inactive_client_org_blocks_submit_and_listing(self):
        self.org.is_active = False
        self.org.save()
        self.assertEqual(self.create_support().status_code, 404)
        self.assertEqual(self.client_api.get(self.support_url).status_code, 404)

    def test_support_requires_valid_subject_and_description(self):
        self.assertEqual(self.create_support(subject=' ').status_code, 400)
        self.assertEqual(self.create_support(description=' ').status_code, 400)
        self.assertEqual(Ticket.objects.count(), 0)

    def test_support_rejects_invalid_priority(self):
        self.assertEqual(self.create_support(priority='super_critical').status_code, 400)

    def test_support_rejects_cross_project_work_item(self):
        other_project = Project.objects.create(
            tenant=self.tenant, client_org=self.other_org,
            key='OTHER', name='Other', created_by=self.owner, visibility='client',
        )
        work = WorkItem.objects.create(
            project=other_project, number=1, created_by=self.owner,
            title='Hidden', visibility='client',
        )
        r = self.create_support(work_item_id=str(work.id))
        self.assertEqual(r.status_code, 404)
        self.assertEqual(Ticket.objects.count(), 0)

    def test_support_rejects_internal_work_item_link(self):
        self.assertEqual(self.create_support(work_item_id=str(self.internal_item.id)).status_code, 404)

    def test_can_link_public_work_item_to_new_ticket(self):
        r = self.create_support(work_item_id=str(self.public_item.id))
        self.assertEqual(r.status_code, 201, r.data)
        self.assertTrue(TicketWorkItemLink.objects.filter(
            ticket_id=r.data['id'], work_item=self.public_item,
        ).exists())

    def test_support_attachment_rejects_unsupported_type(self):
        payload = {'subject': 'Help', 'description': 'Need help',
                   'images': SimpleUploadedFile('attack.html', b'<script></script>', content_type='text/html')}
        self.assertEqual(self.client_api.post(self.support_url, payload, format='multipart').status_code, 400)
        self.assertEqual(Ticket.objects.count(), 0)

    def test_support_attachment_rejects_fake_image_extension(self):
        payload = {'subject': 'Help', 'description': 'Need help',
                   'images': SimpleUploadedFile('attack.html', b'<script></script>', content_type='image/png')}
        response = self.client_api.post(self.support_url, payload, format='multipart')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Ticket.objects.count(), 0)

    def test_normal_unified_list_marks_latest_client_reply_for_assigned_agent(self):
        created = self.create_support()
        ticket = Ticket.objects.get(ticket_ref=created.data['ref'])
        ticket.assignee = self.agent
        ticket.save(update_fields=['assignee'])
        Reply.objects.create(ticket=ticket, author=self.client_owner,
                             type='public_reply', body='Please review this!')
        normal = self.agent_api.get(self.queue_url+'?kind=tickets')
        self.assertEqual(normal.status_code, 200, normal.data)
        self.assertTrue(normal.data['results'][0]['needs_attention'])
        self.assertEqual(normal.data['results'][0]['project_key'], 'SHOP')


    def test_client_support_ticket_list_and_scope(self):
        self.create_support(api=self.end_api)
        self.create_support(api=self.second_api, subject='Second user issue')
        owner = self.client_api.get(self.support_url)
        self.assertEqual(owner.status_code, 200, owner.data)
        self.assertEqual(owner.data['count'], 2)
        self.assertEqual(self.end_api.get(self.support_url).data['count'], 1)
        self.assertEqual(self.second_api.get(self.support_url).data['count'], 1)
        self.assertEqual(self.owner_api.get(self.support_url).data['count'], 2)
        self.assertEqual(self.agent_api.get(self.support_url).data['count'], 2)
        self.assertEqual(self.other_api.get(self.support_url).status_code, 404)

    def test_original_project_request_not_listed_as_support_ticket(self):
        original = Ticket.objects.create(
            tenant=self.tenant, seq=1000, ticket_ref='T11102026-1000',
            subject='Original project request', requester=self.client_owner, client_org=self.org,
        )
        from .models import ProjectRequest
        ProjectRequest.objects.create(
            tenant=self.tenant, client_org=self.org,
            ticket=original, requested_by=self.client_owner, name='Website',
            converted_project=self.project, status='converted',
        )
        TicketProjectAssociation.objects.create(ticket=original, project=self.project)
        self.assertEqual(self.client_api.get(self.support_url).data['count'], 0)

    def test_project_support_category_bypasses_automatic_project_reassociation(self):
        other_project = Project.objects.create(
            tenant=self.tenant, client_org=self.org, key='OTHER',
            name='Old Work', created_by=self.owner,
        )
        AutomationRule.objects.create(
            tenant=self.tenant, name='Automatic Link', trigger='ticket_created',
            scope_type='specific_org', scope_org=self.org,
            actions=[{'type': 'link_to_project', 'value': str(other_project.id)}],
        )
        created = self.create_support()
        self.assertEqual(created.status_code, 201, created.data)
        ticket = Ticket.objects.get(ticket_ref=created.data['ref'])
        self.assertEqual(ticket.project_association.project, self.project)

    def test_project_support_ticket_has_activity_event(self):
        previous = self.project.updated_at
        created = self.create_support()
        self.assertEqual(created.status_code, 201, created.data)
        activity = ProjectActivity.objects.get(kind='support_ticket_created')
        self.assertEqual(activity.ticket.ticket_ref, created.data['ref'])
        self.assertEqual(activity.visibility, 'client')
        self.assertGreater(Project.objects.get(pk=self.project.id).updated_at, previous)

    def test_feedback_produces_activity_and_stores_actor(self):
        comment = self.client_feedback()
        event = ProjectActivity.objects.get(kind='client_feedback')
        self.assertEqual(event.actor, self.client_owner)
        self.assertEqual(event.work_item, self.public_item)
        self.assertEqual(event.visibility, 'client')

    def test_support_ticket_reply_generates_activity_and_attention(self):
        created = self.create_support(api=self.end_api)
        ticket = Ticket.objects.get(ticket_ref=created.data['ref'])
        Reply.objects.create(
            ticket=ticket, author=self.end_user,
            type='public_reply', body='Still broken!',
        )
        self.assertTrue(ProjectActivity.objects.filter(kind='client_ticket_reply').exists())
        result = self.agent_api.get(self.queue_url+'?kind=projects&attention=1')
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(result.data['results'][0]['kind'], 'project')
        self.assertTrue(result.data['results'][0]['needs_attention'])

    def test_client_feedback_shows_in_agent_attention_queue(self):
        self.client_feedback()
        r = self.agent_api.get(self.queue_url+'?attention=1')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual([item['kind'] for item in r.data['results']], ['project'])
        self.assertTrue(r.data['results'][0]['needs_attention'])

    def test_activity_read_marker_clears_project_attention(self):
        self.client_feedback()
        first = self.agent_api.get(self.queue_url+'?kind=projects&attention=1')
        self.assertEqual(first.data['count'], 1)
        seen = self.agent_api.post(self.activity_url+'read/')
        self.assertEqual(seen.status_code, 200, seen.data)
        self.assertEqual(self.agent_api.get(self.queue_url+'?kind=projects&attention=1').data['count'], 0)
        self.client_feedback()
        self.assertEqual(self.agent_api.get(self.queue_url+'?kind=projects&attention=1').data['count'], 1)

    def test_read_marker_is_individual_to_each_agent(self):
        self.client_feedback()
        self.agent_api.post(self.activity_url+'read/')
        self.assertEqual(self.agent_api.get(self.queue_url+'?kind=projects&attention=1').data['count'], 0)
        self.assertEqual(self.owner_api.get(self.queue_url+'?kind=projects&attention=1').data['count'], 1)

    def test_activity_get_does_not_mark_read(self):
        self.client_feedback()
        r = self.agent_api.get(self.activity_url)
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['unread_count'], 1)
        self.assertEqual(ProjectActivityRead.objects.count(), 0)

    def test_client_sees_published_feedback_not_internal_comments(self):
        self.client_feedback()
        WorkItemComment.objects.create(
            work_item=self.internal_item, author=self.owner,
            body='Internal credentials', visibility='internal',
        )
        r = self.client_api.get(self.activity_url)
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(len(r.data['results']), 1)
        self.assertNotIn('credentials', str(r.data))
        self.assertEqual(self.owner_api.get(self.activity_url).data['results'].__len__(), 2)

    def test_public_activity_is_rehidden_after_work_item_becomes_internal(self):
        self.client_feedback()
        self.public_item.visibility = 'internal'
        self.public_item.save()
        self.assertEqual(self.client_api.get(self.activity_url).data['results'], [])
        self.assertEqual(len(self.owner_api.get(self.activity_url).data['results']), 1)

    def test_client_cannot_read_internal_milestone_activity(self):
        milestone = ProjectMilestone.objects.create(
            project=self.project, name='Secret Server Move',
            visibility='internal',
        )
        self.owner_api.patch(
            f'/api/projects/{self.project.id}/milestones/{milestone.id}/',
            {'status': 'in_progress'}, format='json',
        )
        self.assertEqual(self.client_api.get(self.activity_url).data['results'], [])
        self.assertEqual(len(self.owner_api.get(self.activity_url).data['results']), 1)

    def test_client_cannot_read_ticket_activity_for_another_end_user(self):
        created = self.create_support(api=self.second_api)
        ticket = Ticket.objects.get(ticket_ref=created.data['ref'])
        Reply.objects.create(ticket=ticket, author=self.owner,
                             type='public_reply', body='Second user only.')
        r = self.end_api.get(self.activity_url)
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['results'], [])
        r_owner = self.client_api.get(self.activity_url)
        self.assertEqual(len(r_owner.data['results']), 2)

    def test_internal_ticket_note_hidden_from_clients(self):
        created = self.create_support()
        ticket = Ticket.objects.get(ticket_ref=created.data['ref'])
        Reply.objects.create(ticket=ticket, author=self.owner,
                             type='internal_note', body='Internal budget')
        r = self.client_api.get(self.activity_url)
        self.assertEqual(len(r.data['results']), 1)
        self.assertNotIn('Internal budget', str(r.data))
        self.assertEqual(len(self.owner_api.get(self.activity_url).data['results']), 2)

    def test_client_cannot_mark_activity_read_for_other_org(self):
        self.assertEqual(self.other_api.post(self.activity_url+'read/').status_code, 404)
        self.assertEqual(self.foreign_api.get(self.activity_url).status_code, 404)

    def test_nonmember_staff_agent_cannot_access_activity(self):
        self.assertEqual(client_for(self.unrelated_agent).get(self.activity_url).status_code, 404)

    def test_unassigned_project_ticket_is_in_attention_queue(self):
        created = self.create_support()
        r = self.agent_api.get(self.queue_url+'?kind=tickets&attention=1')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['count'], 1)
        self.assertEqual(r.data['results'][0]['ref'], created.data['ref'])
        self.assertEqual(r.data['results'][0]['project_key'], 'SHOP')

    def test_assigned_ticket_requiring_reply_is_in_attention_queue(self):
        created = self.create_support()
        ticket = Ticket.objects.get(ticket_ref=created.data['ref'])
        ticket.assignee = self.agent
        ticket.save(update_fields=['assignee'])
        Reply.objects.create(
            ticket=ticket, author=self.owner,
            type='public_reply', body='We are investigating.',
        )
        self.assertEqual(
            self.agent_api.get(self.queue_url+'?kind=tickets&attention=1').data['count'], 0,
        )
        Reply.objects.create(
            ticket=ticket, author=self.client_owner,
            type='public_reply', body='Any update?',
        )
        self.assertEqual(
            self.agent_api.get(self.queue_url+'?kind=tickets&attention=1').data['count'], 1,
        )
        Reply.objects.create(
            ticket=ticket, author=self.agent,
            type='public_reply', body='Update sent.',
        )
        self.assertEqual(
            self.agent_api.get(self.queue_url+'?kind=tickets&attention=1').data['count'], 0,
        )

    def test_work_item_api_generates_audited_updates(self):
        self.project.next_item_number = 3
        self.project.save(update_fields=['next_item_number'])
        result = self.owner_api.post(f'/api/projects/{self.project.id}/work-items/', {
            'title': 'Build frontend', 'visibility': 'client',
        }, format='json')
        self.assertEqual(result.status_code, 201, result.data)
        self.assertEqual(ProjectActivity.objects.filter(kind='work_item_created').count(), 1)
        updated = self.owner_api.patch(
            f"/api/work-items/{result.data['id']}/",
            {'status': 'in_progress'}, format='json',
        )
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(ProjectActivity.objects.filter(kind='work_item_updated').count(), 1)

    def test_project_activity_pagination_returns_maximum_one_hundred(self):
        for i in range(103):
            ProjectActivity.objects.create(
                project=self.project, kind='work_item_created', visibility='internal',
                summary='Test activity %03d' % i,
            )
        resp = self.owner_api.get(self.activity_url)
        self.assertEqual(len(resp.data['results']), 25)
        self.assertEqual(resp.data['count'], 103)
        self.assertTrue(resp.data['has_more'])
        self.assertEqual(len(self.owner_api.get(self.activity_url+'?page=5').data['results']), 3)

    def test_deleted_project_reviewer_cannot_read_activity(self):
        self.client_feedback()
        ProjectMember.objects.filter(project=self.project, user=self.client_owner).delete()
        self.assertEqual(self.client_api.get(self.activity_url).status_code, 404)
        self.assertEqual(self.client_api.post(self.activity_url+'read/').status_code, 404)

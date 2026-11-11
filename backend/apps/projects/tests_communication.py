"""Phase 5 isolated regression: project conversation, inbox and access boundaries."""
from uuid import uuid4

from django.core.exceptions import ValidationError as ModelValidationError
from django.test import TestCase, override_settings

from apps.tenants.models import Tenant, ClientOrganization
from apps.users.models import User
from .models import (
    Project, ProjectActivity, ProjectActivityRead, ProjectMember, ProjectMessage,
    WorkItem, WorkItemComment,
)
from .tests_requests import actor, client_for


@override_settings(
    DEBUG=True, PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'],
)
class ProjectCommunicationPhase5Tests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Phase 5 MSP', slug='phase5-msp')
        self.foreign_tenant = Tenant.objects.create(name='Other MSP', slug='phase5-foreign')
        self.org = ClientOrganization.objects.create(
            tenant=self.tenant, name='Acme', is_active=True,
        )
        self.org_other = ClientOrganization.objects.create(
            tenant=self.tenant, name='Other', is_active=True,
        )
        self.foreign_org = ClientOrganization.objects.create(
            tenant=self.foreign_tenant, name='Foreign', is_active=True,
        )
        self.owner = actor(self.tenant, 'owner@phase5.test', 'msp_owner')
        self.agent = actor(self.tenant, 'agent@phase5.test', 'msp_agent')
        self.unassigned = actor(self.tenant, 'unassigned@phase5.test', 'msp_agent')
        self.client = actor(self.tenant, 'client@phase5.test', 'client_owner', self.org)
        self.other_client = actor(self.tenant, 'other@phase5.test', 'client_owner', self.org_other)
        self.foreign_client = actor(
            self.foreign_tenant, 'foreign@phase5.test', 'client_owner', self.foreign_org,
        )
        self.project = Project.objects.create(
            tenant=self.tenant, client_org=self.org, key='PHASE5',
            name='Phase Five Project', status='active', visibility='client',
            created_by=self.owner,
        )
        for user, role in [
            (self.owner, 'manager'), (self.agent, 'contributor'),
            (self.client, 'client_reviewer'),
        ]:
            ProjectMember.objects.create(project=self.project, user=user, role=role)
        self.owner_api = client_for(self.owner)
        self.agent_api = client_for(self.agent)
        self.client_api = client_for(self.client)
        self.unassigned_api = client_for(self.unassigned)
        self.other_api = client_for(self.other_client)
        self.foreign_api = client_for(self.foreign_client)
        self.conversation = f'/api/projects/{self.project.id}/conversation/'
        self.inbox = '/api/projects/notifications/'
        self.activity = f'/api/projects/{self.project.id}/activity/'
        self.read = f'/api/projects/{self.project.id}/activity/read/'

    def post(self, api=None, *, visibility='client', body='Please review progress', request_id=None):
        return (api or self.owner_api).post(self.conversation, {
            'body': body, 'visibility': visibility,
            'request_id': str(request_id or uuid4()),
        }, format='json')

    def test_manager_can_publish_client_project_update(self):
        response = self.post()
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(ProjectMessage.objects.count(), 1)
        self.assertEqual(ProjectActivity.objects.filter(
            kind='project_message_staff', visibility='client',
        ).count(), 1)
        self.assertEqual(self.client_api.get(self.conversation).data['count'], 1)

    def test_manager_can_post_internal_message_hidden_from_client(self):
        self.assertEqual(self.post(visibility='internal').status_code, 201)
        self.assertEqual(self.client_api.get(self.conversation).data['count'], 0)
        self.assertEqual(self.owner_api.get(self.conversation).data['count'], 1)
        self.assertEqual(self.client_api.get(self.activity).data['count'], 0)

    def test_client_shared_message_notifies_staff(self):
        result = self.post(self.client_api)
        self.assertEqual(result.status_code, 201, result.data)
        self.assertEqual(ProjectActivity.objects.filter(kind='project_message_client').count(), 1)
        inbox = self.owner_api.get(self.inbox)
        self.assertEqual(inbox.status_code, 200, inbox.data)
        self.assertEqual(inbox.data['unread_count'], 1)
        self.assertEqual(inbox.data['results'][0]['project_id'], str(self.project.id))

    def test_client_cannot_post_internal_message(self):
        self.assertEqual(self.post(self.client_api, visibility='internal').status_code, 403)
        self.assertEqual(ProjectMessage.objects.count(), 0)

    def test_contributor_can_post_internal_but_cannot_publish(self):
        self.assertEqual(self.post(self.agent_api, visibility='internal').status_code, 201)
        self.assertEqual(self.post(self.agent_api).status_code, 403)

    def test_unassigned_agent_cannot_read_or_post(self):
        self.assertEqual(self.unassigned_api.get(self.conversation).status_code, 404)
        self.assertEqual(self.post(self.unassigned_api).status_code, 404)

    def test_cross_tenant_and_client_organization_are_isolated(self):
        for api in (self.foreign_api, self.other_api):
            self.assertEqual(api.get(self.conversation).status_code, 404)
            self.assertEqual(self.post(api).status_code, 404)
            self.assertEqual(api.get(self.activity).status_code, 404)
            self.assertEqual(api.get(self.inbox).data['count'], 0)

    def test_unassigned_same_org_client_cannot_read(self):
        outsider = actor(self.tenant, 'outsider@phase5.test', 'end_user', self.org)
        api = client_for(outsider)
        self.assertEqual(api.get(self.conversation).status_code, 404)

    def test_client_visibility_revocation_hides_messages_and_inbox(self):
        self.assertEqual(self.post().status_code, 201)
        self.project.visibility = 'internal'
        self.project.save()
        self.assertEqual(self.client_api.get(self.conversation).status_code, 404)
        self.assertEqual(self.client_api.get(self.inbox).data['count'], 0)
        self.assertEqual(self.owner_api.get(self.conversation).data['count'], 1)

    def test_archived_is_read_only(self):
        self.assertEqual(self.post().status_code, 201)
        self.project.status = 'archived'
        self.project.save()
        self.assertEqual(self.post().status_code, 403)
        self.assertEqual(self.client_api.get(self.conversation).data['count'], 1)

    def test_messages_are_idempotent_and_different_payload_rejected(self):
        key = uuid4()
        self.assertEqual(self.post(request_id=key).status_code, 201)
        self.assertEqual(self.post(request_id=key).status_code, 200)
        self.assertEqual(self.post(body='Different', request_id=key).status_code, 400)
        self.assertEqual(ProjectMessage.objects.count(), 1)
        self.assertEqual(ProjectActivity.objects.count(), 1)

    def test_model_rejects_cross_tenant_author(self):
        msg = ProjectMessage(
            project=self.project, author=self.foreign_client,
            body='Unauthorized', visibility='client', request_id=uuid4(),
        )
        with self.assertRaises(ModelValidationError):
            msg.save()

    def test_model_rejects_mutating_published_message(self):
        self.assertEqual(self.post().status_code, 201)
        msg = ProjectMessage.objects.first()
        msg.body = 'Changed message'
        with self.assertRaises(ModelValidationError):
            msg.save()

    def test_blank_or_oversized_message_rejected(self):
        self.assertEqual(self.post(body='  ').status_code, 400)
        self.assertEqual(self.post(body='x' * 5001).status_code, 400)
        self.assertEqual(ProjectMessage.objects.count(), 0)

    def test_notification_cursor_read_is_project_scoped(self):
        self.assertEqual(self.post(self.client_api).status_code, 201)
        before = self.owner_api.get(self.inbox)
        self.assertEqual(before.data['unread_count'], 1)
        self.assertTrue(before.data['results'][0]['is_unread'])
        self.assertEqual(self.owner_api.post(self.read, {}, format='json').status_code, 200)
        after = self.owner_api.get(self.inbox)
        self.assertEqual(after.data['unread_count'], 0)
        self.assertFalse(after.data['results'][0]['is_unread'])
        self.assertTrue(ProjectActivityRead.objects.filter(user=self.owner, project=self.project).exists())
        self.assertEqual(self.post(self.client_api, body='Next update').status_code, 201)
        self.assertEqual(self.owner_api.get(self.inbox).data['unread_count'], 1)

    def test_self_authored_events_not_in_own_inbox(self):
        self.assertEqual(self.post().status_code, 201)
        self.assertEqual(self.owner_api.get(self.inbox).data['count'], 0)
        self.assertEqual(self.client_api.get(self.inbox).data['unread_count'], 1)

    def test_internal_message_does_not_leak_to_client_notifications(self):
        self.assertEqual(self.post(self.agent_api, visibility='internal').status_code, 201)
        self.assertEqual(self.client_api.get(self.inbox).data['count'], 0)

    def test_new_messages_do_not_change_approval_or_task_status(self):
        item = WorkItem.objects.create(
            project=self.project, number=1, title='Testing',
            created_by=self.owner, visibility='client',
        )
        self.assertEqual(self.post(self.client_api).status_code, 201)
        item.refresh_from_db()
        self.project.refresh_from_db()
        self.assertEqual(item.status, 'backlog')
        self.assertEqual(self.project.status, 'active')

    def test_revoke_client_membership_removes_inbox_access(self):
        self.assertEqual(self.post().status_code, 201)
        self.assertEqual(self.client_api.get(self.inbox).data['unread_count'], 1)
        ProjectMember.objects.filter(user=self.client, project=self.project).delete()
        self.assertEqual(self.client_api.get(self.inbox).data['unread_count'], 0)
        self.assertEqual(self.client_api.get(self.conversation).status_code, 404)

    def test_existing_comment_notifications_still_work(self):
        item = WorkItem.objects.create(
            project=self.project, number=1, title='Testing',
            created_by=self.owner, visibility='client',
        )
        WorkItemComment.objects.create(
            work_item=item, author=self.client, body='Please check', visibility='client',
        )
        response = self.owner_api.get(self.inbox)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(any(row['kind'] == 'client_feedback' for row in response.data['results']))

    def test_messages_are_paginated(self):
        for i in range(27):
            self.assertEqual(self.post(body=f'Message {i}').status_code, 201)
        first = self.owner_api.get(self.conversation)
        second = self.owner_api.get(self.conversation + '?page=2')
        self.assertEqual(first.data['count'], 27)
        self.assertEqual(len(first.data['results']), 25)
        self.assertEqual(len(second.data['results']), 2)
        self.assertTrue(first.data['has_more'])
        self.assertFalse(second.data['has_more'])

    def test_invalid_page_rejected(self):
        self.assertEqual(self.owner_api.get(self.conversation + '?page=-2').status_code, 400)
        self.assertEqual(self.owner_api.get(self.inbox + '?page=not-a-number').status_code, 400)

    def test_client_inbox_rechecks_work_item_visibility(self):
        item = WorkItem.objects.create(
            project=self.project, number=1, title='Shared Task',
            created_by=self.owner, visibility='client',
        )
        WorkItemComment.objects.create(
            work_item=item, author=self.agent, body='Please review', visibility='client',
        )
        self.assertEqual(self.client_api.get(self.inbox).data['unread_count'], 1)
        item.visibility = 'internal'
        item.save()
        self.assertEqual(self.client_api.get(self.inbox).data['unread_count'], 0)

    def test_client_inbox_rechecks_milestone_visibility(self):
        from .activity import record_activity
        from .models import ProjectMilestone
        milestone = ProjectMilestone.objects.create(
            project=self.project, name='Private Launch',
            visibility='internal',
        )
        record_activity(
            self.project, actor=self.agent, kind='staff_feedback',
            summary='Secret milestone update', visibility='client',
            milestone=milestone,
        )
        self.assertEqual(self.client_api.get(self.inbox).data['count'], 0)

    def test_marking_one_project_does_not_mark_other_project(self):
        other_project = Project.objects.create(
            tenant=self.tenant, client_org=self.org, key='SECOND',
            name='Second Project', status='active', visibility='client',
            created_by=self.owner,
        )
        ProjectMember.objects.create(
            project=other_project, user=self.client, role='client_reviewer',
        )
        self.assertEqual(self.post(self.client_api).status_code, 201)
        result = self.client_api.post(
            f'/api/projects/{other_project.id}/conversation/',
            {'body': 'Second project message', 'visibility': 'client',
             'request_id': str(uuid4())}, format='json',
        )
        self.assertEqual(result.status_code, 201, result.data)
        self.assertEqual(self.owner_api.get(self.inbox).data['unread_count'], 2)
        self.assertEqual(self.owner_api.post(self.read, {}, format='json').status_code, 200)
        self.assertEqual(self.owner_api.get(self.inbox).data['unread_count'], 1)

"""Phase 6 email notification, tenant isolation and inbound reply regression."""
from email import message_from_string
from unittest.mock import patch
import uuid

from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.email_ingestion.models import TenantEmailSettings, AUTH_METHOD_MATEMAIL, ProcessedEmail
from apps.email_ingestion.services import _process_email
from apps.projects.email_notifications import send_project_notification
from apps.projects.models import (
    Project, ProjectMember, WorkItem, WorkItemComment,
    ProjectEmailNotification, ProjectEmailReply,
)
from apps.tenants.models import Tenant, ClientOrganization
from apps.tickets.models import Ticket, Reply
from apps.users.models import User


def _user(tenant, email, role, org=None):
    return User.objects.create_user(
        tenant=tenant, email=email, password='secret', role=role, client_org=org,
        first_name='Demo', last_name='Reviewer',
    )


def _api(user):
    token = AccessToken.for_user(user)
    token['tenant_id'] = str(user.tenant_id)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    client.defaults['HTTP_HOST'] = f'{user.tenant.slug}.matedesk.pro'
    return client


def _message(sender, reference='', mid='<incoming@client.test>',
             subject='Re: Project update', body='Please adjust the layout.',
             references='', additional=''):
    headers = [
        f'From: {sender}', f'Subject: {subject}', f'Message-ID: {mid}',
    ]
    if reference:
        headers.append(f'In-Reply-To: {reference}')
    if references:
        headers.append(f'References: {references}')
    if additional:
        headers.append(additional)
    return message_from_string('\n'.join(headers) + '\n\n' + body + '\n')


@override_settings(
    DEBUG=True, APP_DOMAIN='matedesk.pro', DEPLOYMENT_MODE='multi_tenant',
    ALLOWED_HOSTS=['.matedesk.pro', 'localhost', 'testserver'],
)
class ProjectNotificationTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Phase Six', slug='phase6-test')
        self.foreign_tenant = Tenant.objects.create(name='Foreign', slug='phase6-foreign')
        self.org = ClientOrganization.objects.create(
            tenant=self.tenant, name='Customer', is_active=True,
        )
        self.foreign_org = ClientOrganization.objects.create(
            tenant=self.foreign_tenant, name='Other Customer', is_active=True,
        )
        self.staff = _user(self.tenant, 'manager@helpdesk.test', 'msp_owner')
        self.agent = _user(self.tenant, 'staff@helpdesk.test', 'msp_agent')
        self.reviewer = _user(self.tenant, 'reviewer@customer.test', 'client_owner', self.org)
        self.stranger = _user(self.tenant, 'stranger@customer.test', 'end_user', self.org)
        self.other_staff = _user(self.foreign_tenant, 'other@helpdesk.test', 'msp_owner')
        self.project = Project.objects.create(
            tenant=self.tenant, client_org=self.org, key='CHECKOUT',
            name='Checkout Improvements', visibility='client', created_by=self.staff,
        )
        self.item = WorkItem.objects.create(
            project=self.project, number=1, title='Improve checkout',
            visibility='client', status='in_review', created_by=self.staff,
        )
        ProjectMember.objects.create(
            project=self.project, user=self.reviewer, role='client_reviewer',
        )
        self.api = _api(self.staff)
        self.mail = TenantEmailSettings.objects.create(
            tenant=self.tenant, smtp_enabled=True, smtp_host='smtp.example.test',
            smtp_from_email='support@example.test', smtp_from_name='MateDesk Projects',
            smtp_username='support@example.test', smtp_password='pw',
        )

    @property
    def url(self):
        return f'/api/work-items/{self.item.id}/email-notifications/'

    def sent_record(self, mid='<mdproj.sample@example.test>'):
        return ProjectEmailNotification.objects.create(
            tenant=self.tenant, work_item=self.item, recipient=self.reviewer,
            sent_by=self.staff, idempotency_key=uuid.uuid4(),
            subject='Project update: [CHECKOUT-1]', status='sent', message_id=mid,
        )

    def test_notification_lists_only_project_reviewers(self):
        response = self.api.get(self.url)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(len(response.data['reviewers']), 1)
        self.assertEqual(response.data['reviewers'][0]['email'], self.reviewer.email)

    @patch('apps.email_ingestion.services._smtp_connect')
    def test_email_send_uses_configured_smtp_and_stores_real_message_id(self, mock_connect):
        response = self.api.post(self.url, {
            'recipient_id': str(self.reviewer.id), 'idempotency_key': str(uuid.uuid4()),
            'note': 'Can you review the new form?',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        notice = ProjectEmailNotification.objects.get()
        self.assertEqual(notice.status, 'sent')
        self.assertTrue(notice.message_id.startswith('<mdproj.'))
        args = mock_connect.return_value.sendmail.call_args.args
        self.assertEqual(args[0], 'support@example.test')
        self.assertEqual(args[1], ['reviewer@customer.test'])
        self.assertIn(notice.message_id, args[2])
        self.assertIn('Can you review the new form?', args[2])
        self.assertIn('phase6-test.matedesk.pro/projects/', args[2])
        self.assertEqual(WorkItemComment.objects.count(), 0)

    @patch('apps.email_ingestion.services._smtp_connect')
    def test_idempotent_repeat_does_not_send_second_email(self, mock_connect):
        key = str(uuid.uuid4())
        payload = {'recipient_id': str(self.reviewer.id), 'idempotency_key': key}
        self.assertEqual(self.api.post(self.url, payload, format='json').status_code, 201)
        self.assertEqual(self.api.post(self.url, payload, format='json').status_code, 200)
        self.assertEqual(ProjectEmailNotification.objects.count(), 1)
        self.assertEqual(mock_connect.return_value.sendmail.call_count, 1)

    @patch('apps.email_ingestion.services._smtp_connect')
    def test_email_failure_is_recorded_without_pretending_success(self, mock_connect):
        mock_connect.return_value.sendmail.side_effect = RuntimeError('SMTP down')
        response = self.api.post(self.url, {
            'recipient_id': str(self.reviewer.id), 'idempotency_key': str(uuid.uuid4()),
        }, format='json')
        self.assertEqual(response.status_code, 503)
        self.assertEqual(ProjectEmailNotification.objects.get().status, 'failed')

    @patch('apps.email_ingestion.matemail.send_message')
    def test_matemail_uses_actual_provider_message_id(self, mock_send):
        self.mail.auth_method = AUTH_METHOD_MATEMAIL
        self.mail.matemail_tenant_id = 'tenant123'
        self.mail.matemail_mailbox_email = 'support@example.test'
        self.mail.matemail_access_token = 'secret-token'
        self.mail.save()
        mock_send.return_value = {'sent': True, 'message_id': '<actual-matemail-id@example.test>'}
        response = self.api.post(self.url, {
            'recipient_id': str(self.reviewer.id), 'idempotency_key': str(uuid.uuid4()),
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(ProjectEmailNotification.objects.get().message_id,
                         '<actual-matemail-id@example.test>')
        self.assertTrue(mock_send.call_args.kwargs['payload']['idempotency_key'].startswith('matedesk-project-'))

    def test_nonmember_agent_cannot_discover_or_send_project_notification(self):
        response = _api(self.agent).post(self.url, {
            'recipient_id': str(self.reviewer.id), 'idempotency_key': str(uuid.uuid4()),
        }, format='json')
        self.assertEqual(response.status_code, 404)

    def test_notification_requires_client_reviewer(self):
        response = self.api.post(self.url, {
            'recipient_id': str(self.stranger.id), 'idempotency_key': str(uuid.uuid4()),
        }, format='json')
        self.assertEqual(response.status_code, 404)

    def test_client_cannot_send_project_notification(self):
        response = _api(self.reviewer).get(self.url)
        self.assertEqual(response.status_code, 403)

    def test_foreign_tenant_cannot_see_project_notification(self):
        response = _api(self.other_staff).get(self.url)
        self.assertEqual(response.status_code, 404)

    def test_internal_work_item_is_not_emailed(self):
        self.item.visibility = 'internal'
        self.item.save()
        response = self.api.post(self.url, {
            'recipient_id': str(self.reviewer.id), 'idempotency_key': str(uuid.uuid4()),
        }, format='json')
        self.assertEqual(response.status_code, 400)

    def test_internal_project_is_not_emailed(self):
        self.project.visibility = 'internal'
        self.project.save()
        self.assertEqual(self.api.get(self.url).status_code, 400)

    def test_valid_reply_is_client_visible_comment_not_ticket(self):
        notice = self.sent_record()
        _process_email(self.tenant, _message(self.reviewer.email, notice.message_id))
        comment = WorkItemComment.objects.get()
        self.assertEqual(comment.author, self.reviewer)
        self.assertEqual(comment.visibility, 'client')
        self.assertIn('adjust the layout', comment.body)
        self.assertEqual(ProjectEmailReply.objects.get().notification, notice)
        self.assertEqual(Ticket.objects.count(), 0)
        self.assertEqual(ProcessedEmail.objects.count(), 1)

    def test_references_header_routes_without_in_reply_to(self):
        notice = self.sent_record()
        _process_email(self.tenant, _message(
            self.reviewer.email, references=f'<older@other.test> {notice.message_id}',
        ))
        self.assertEqual(WorkItemComment.objects.count(), 1)
        self.assertEqual(Ticket.objects.count(), 0)

    def test_duplicate_reply_does_not_create_duplicate_comment(self):
        notice = self.sent_record()
        msg = _message(self.reviewer.email, reference=notice.message_id)
        _process_email(self.tenant, msg)
        _process_email(self.tenant, msg)
        self.assertEqual(WorkItemComment.objects.count(), 1)
        self.assertEqual(ProjectEmailReply.objects.count(), 1)

    def test_unknown_sender_cannot_comment_or_create_ticket(self):
        notice = self.sent_record()
        _process_email(self.tenant, _message('bad@attacker.test', reference=notice.message_id))
        self.assertEqual(WorkItemComment.objects.count(), 0)
        self.assertEqual(Ticket.objects.count(), 0)
        self.assertEqual(ProcessedEmail.objects.count(), 1)

    def test_other_client_user_cannot_reply_without_notification(self):
        notice = self.sent_record()
        _process_email(self.tenant, _message(self.stranger.email, reference=notice.message_id))
        self.assertEqual(WorkItemComment.objects.count(), 0)
        self.assertEqual(Ticket.objects.count(), 0)

    def test_removed_project_reviewer_cannot_reply(self):
        notice = self.sent_record()
        ProjectMember.objects.filter(project=self.project, user=self.reviewer).delete()
        _process_email(self.tenant, _message(self.reviewer.email, reference=notice.message_id))
        self.assertEqual(WorkItemComment.objects.count(), 0)

    def test_disabled_reviewer_cannot_reply(self):
        notice = self.sent_record()
        self.reviewer.is_active = False
        self.reviewer.save()
        _process_email(self.tenant, _message(self.reviewer.email, reference=notice.message_id))
        self.assertEqual(WorkItemComment.objects.count(), 0)

    def test_internal_visibility_revokes_reply_access(self):
        notice = self.sent_record()
        self.item.visibility = 'internal'
        self.item.save()
        _process_email(self.tenant, _message(self.reviewer.email, reference=notice.message_id))
        self.assertEqual(WorkItemComment.objects.count(), 0)

    def test_autoresponder_does_not_post_a_comment(self):
        notice = self.sent_record()
        _process_email(self.tenant, _message(
            self.reviewer.email, reference=notice.message_id, additional='Auto-Submitted: auto-replied',
        ))
        self.assertEqual(WorkItemComment.objects.count(), 0)

    def test_multiple_notification_roots_are_not_routed_ambiguously(self):
        first = self.sent_record()
        second = self.sent_record(mid='<mdproj.other@example.test>')
        _process_email(self.tenant, _message(
            self.reviewer.email, reference=first.message_id,
            references=second.message_id,
        ))
        self.assertEqual(WorkItemComment.objects.count(), 0)

    def test_ticket_reference_in_subject_does_not_override_project_reply(self):
        ticket = Ticket.objects.create(
            tenant=self.tenant, ticket_ref='T11102026-0001', seq=1,
            subject='Checkout Help', client_org=self.org,
        )
        notice = self.sent_record()
        _process_email(self.tenant, _message(
            self.reviewer.email, reference=notice.message_id,
            subject='Re: [T11102026-0001] Checkout Help',
        ))
        self.assertEqual(WorkItemComment.objects.count(), 1)
        self.assertEqual(Reply.objects.filter(ticket=ticket, type='public_reply').count(), 0)
        self.assertEqual(Ticket.objects.count(), 1)

    def test_plain_support_email_remains_a_normal_ticket(self):
        _process_email(self.tenant, _message(
            self.reviewer.email, reference='', subject='Printer stopped',
        ))
        self.assertEqual(Ticket.objects.count(), 1)
        self.assertEqual(WorkItemComment.objects.count(), 0)

    def test_unknown_project_smtp_marker_fails_closed(self):
        _process_email(self.tenant, _message(
            self.reviewer.email, reference='<mdproj.not-real@other.test>',
        ))
        self.assertEqual(Ticket.objects.count(), 0)
        self.assertEqual(WorkItemComment.objects.count(), 0)

    def test_notified_client_reply_never_solves_ticket_or_approves_work(self):
        ticket = Ticket.objects.create(
            tenant=self.tenant, ticket_ref='T11102026-0002', seq=2,
            subject='Review', status='open', client_org=self.org,
        )
        notice = self.sent_record()
        _process_email(self.tenant, _message(self.reviewer.email, reference=notice.message_id))
        ticket.refresh_from_db()
        self.item.refresh_from_db()
        self.assertEqual(ticket.status, 'open')
        self.assertEqual(self.item.status, 'in_review')

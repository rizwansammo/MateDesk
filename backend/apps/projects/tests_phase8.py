"""Phase 8 release gates: API confidentiality, tenant isolation and lifecycle safety."""
import tempfile
from datetime import timedelta
from uuid import uuid4

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.tenants.models import ClientOrganization, Tenant
from .models import (
    Project, ProjectActivity, ProjectDeliveryReview, ProjectDocument,
    ProjectMember, ProjectMilestone, ProjectTimeEntry, WorkItem,
    WorkItemChecklistEntry, WorkItemComment, WorkItemDependency,
)
from .tests_requests import actor, client_for


@override_settings(DEBUG=True, PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class ProjectPhase8SecurityAcceptanceTests(TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.media_tmp = tempfile.TemporaryDirectory(prefix='matedesk-p8-files-')
        cls.media_override = override_settings(MEDIA_ROOT=cls.media_tmp.name)
        cls.media_override.enable()

    @classmethod
    def tearDownClass(cls):
        cls.media_override.disable()
        cls.media_tmp.cleanup()
        super().tearDownClass()

    def setUp(self):
        self.tenant = Tenant.objects.create(name='P8 Security MSP', slug='p8security')
        self.foreign_tenant = Tenant.objects.create(name='P8 Other MSP', slug='p8other')
        self.org = ClientOrganization.objects.create(tenant=self.tenant, name='Client A')
        self.other_org = ClientOrganization.objects.create(tenant=self.tenant, name='Client B')
        self.owner = actor(self.tenant, 'owner@p8.test', 'msp_owner')
        self.manager = actor(self.tenant, 'manager@p8.test', 'msp_manager')
        self.agent = actor(self.tenant, 'agent@p8.test', 'msp_agent')
        self.outsider = actor(self.tenant, 'outsider@p8.test', 'msp_agent')
        self.client = actor(self.tenant, 'client@p8.test', 'client_owner', self.org)
        self.client_other = actor(self.tenant, 'clientother@p8.test', 'client_owner', self.other_org)
        self.nonmember = actor(self.tenant, 'nonmember@p8.test', 'client_owner', self.org)
        self.foreign = actor(self.foreign_tenant, 'foreign@p8.test', 'msp_owner')
        self.project = Project.objects.create(
            tenant=self.tenant, client_org=self.org,
            created_by=self.owner, name='Phase 8 Audit', key='EIGHT',
            status='active', visibility='client',
            start_date=timezone.localdate()-timedelta(days=12),
        )
        for person, role in ((self.agent, 'contributor'), (self.client, 'client_reviewer')):
            ProjectMember.objects.create(project=self.project, user=person, role=role)
        self.private_ms = ProjectMilestone.objects.create(
            project=self.project, name='Confidential Finance Research', visibility='internal',
        )
        self.public_ms = ProjectMilestone.objects.create(
            project=self.project, name='Public Rollout', visibility='client',
        )
        self.private = WorkItem.objects.create(
            project=self.project, number=1, created_by=self.owner,
            title='Private Security Budget', visibility='internal',
            milestone=self.private_ms, estimated_minutes=12000,
        )
        self.shared_hidden_ms = WorkItem.objects.create(
            project=self.project, number=2, created_by=self.owner,
            title='Shared Work with Hidden Milestone', visibility='client',
            milestone=self.private_ms, estimated_minutes=540,
        )
        self.shared = WorkItem.objects.create(
            project=self.project, number=3, created_by=self.owner,
            title='Client Visible Feature', visibility='client',
            milestone=self.public_ms, estimated_minutes=60,
        )
        WorkItemDependency.objects.create(
            work_item=self.shared, prerequisite=self.private, created_by=self.owner,
        )
        WorkItemChecklistEntry.objects.create(
            work_item=self.shared, title='Private QA Checklist',
            visibility='internal', created_by=self.owner, position=1,
        )
        WorkItemChecklistEntry.objects.create(
            work_item=self.shared, title='Public QA Checklist',
            visibility='client', created_by=self.owner, position=2,
        )
        self.c_owner = client_for(self.owner)
        self.c_manager = client_for(self.manager)
        self.c_agent = client_for(self.agent)
        self.c_outsider = client_for(self.outsider)
        self.c_client = client_for(self.client)
        self.c_other = client_for(self.client_other)
        self.c_nonmember = client_for(self.nonmember)
        self.c_foreign = client_for(self.foreign)
        self.prefix = f'/api/projects/{self.project.id}/'
        self.shared_url = f'/api/work-items/{self.shared.id}/'

    def test_client_list_must_not_leak_internal_milestone_uuid_or_estimate(self):
        response = self.c_client.get(self.prefix+'work-items/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 2)
        hidden = next(x for x in response.data if x['id'] == str(self.shared_hidden_ms.id))
        self.assertIsNone(hidden['milestone_id'])
        self.assertIsNone(hidden['estimated_minutes'])
        self.assertNotIn(str(self.private_ms.pk), str(response.data))
        self.assertNotIn('Private Security Budget', str(response.data))

    def test_client_work_detail_must_hide_private_milestone_and_effort(self):
        response = self.c_client.get(f'/api/work-items/{self.shared_hidden_ms.id}/')
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data['milestone_id'])
        self.assertIsNone(response.data['estimated_minutes'])

    def test_staff_work_detail_preserves_full_estimate_and_milestone(self):
        response = self.c_agent.get(f'/api/work-items/{self.shared_hidden_ms.id}/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['milestone_id'], str(self.private_ms.pk))
        self.assertEqual(response.data['estimated_minutes'], 540)

    def test_public_milestone_reference_still_visible_to_clients(self):
        response = self.c_client.get(self.shared_url)
        self.assertEqual(response.data['milestone_id'], str(self.public_ms.pk))
        self.assertIsNone(response.data['estimated_minutes'])

    def test_milestone_visibility_change_revokes_client_uuid_in_legacy_api(self):
        self.public_ms.visibility = 'internal'
        self.public_ms.save()
        response = self.c_client.get(self.shared_url)
        self.assertIsNone(response.data['milestone_id'])
        self.assertIsNone(response.data['estimated_minutes'])

    def test_private_work_item_direct_access_is_denied(self):
        response = self.c_client.get(f'/api/work-items/{self.private.pk}/')
        self.assertEqual(response.status_code, 403)

    def test_private_milestone_list_is_filtered_for_clients(self):
        rows = self.c_client.get(self.prefix+'milestones/')
        self.assertEqual(rows.status_code, 200)
        self.assertEqual(len(rows.data), 1)
        self.assertEqual(rows.data[0]['id'], str(self.public_ms.pk))

    def test_client_dependency_does_not_expose_internal_title_or_id(self):
        response = self.c_client.get(self.shared_url+'dependencies/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertTrue(response.data[0]['internal'])
        self.assertIsNone(response.data[0]['prerequisite_id'])
        self.assertIsNone(response.data[0]['id'])
        self.assertNotIn(self.private.title, str(response.data))

    def test_client_checklist_does_not_expose_internal_text(self):
        response = self.c_client.get(self.shared_url+'checklist/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['title'], 'Public QA Checklist')

    def test_client_reports_do_not_disclose_staff_effort_or_private_items(self):
        response = self.c_client.get(self.prefix+'reports/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['work_items']['total'], 2)
        self.assertNotIn('effort', response.data)
        self.assertNotIn('team', response.data)
        self.assertNotIn('time', response.data)

    def test_client_timeline_masks_internal_milestone_prerequisite_and_effort(self):
        data = self.c_client.get(self.prefix+'timeline/').data
        self.assertNotIn(str(self.private_ms.pk), str(data))
        self.assertNotIn(str(self.private.pk), str(data))
        self.assertEqual(len(data['work_items']), 2)
        self.assertTrue(all(w['estimated_minutes'] is None for w in data['work_items']))

    def test_client_cannot_access_financial_endpoints(self):
        for path in ('time-entries/', 'time-summary/', 'time-rate/', 'time-invoices/'):
            self.assertEqual(self.c_client.get(self.prefix+path).status_code, 403)

    def test_unauthenticated_project_api_requires_login(self):
        client = APIClient()
        for path in (self.prefix+'reports/', self.prefix+'timeline/',
                     self.prefix+'files/', self.prefix+'work-items/'):
            self.assertIn(client.get(path).status_code, (401, 403))

    def test_foreign_tenant_must_not_access_project_resource_matrix(self):
        for path in (self.prefix+'reports/', self.prefix+'timeline/',
                     self.prefix+'files/', self.prefix+'work-items/',
                     self.prefix+'conversation/', self.prefix+'scope/'):
            self.assertEqual(self.c_foreign.get(path).status_code, 404, path)

    def test_unassigned_staff_must_not_access_project_resource_matrix(self):
        for path in (self.prefix+'reports/', self.prefix+'timeline/',
                     self.prefix+'files/', self.prefix+'work-items/'):
            self.assertEqual(self.c_outsider.get(path).status_code, 404, path)

    def test_other_organization_client_and_nonmember_are_isolated(self):
        for api in (self.c_other, self.c_nonmember):
            self.assertEqual(api.get(self.prefix+'reports/').status_code, 404)
            self.assertEqual(api.get(self.prefix+'timeline/').status_code, 404)

    def test_membership_revocation_blocks_all_follow_up_reads(self):
        ProjectMember.objects.filter(project=self.project, user=self.client).delete()
        for path in (self.prefix+'reports/', self.prefix+'timeline/',
                     self.prefix+'work-items/', self.prefix+'files/'):
            self.assertEqual(self.c_client.get(path).status_code, 404, path)

    def test_organization_deactivation_blocks_client_reads(self):
        self.org.is_active = False
        self.org.save(update_fields=['is_active'])
        self.assertEqual(self.c_client.get(self.prefix+'reports/').status_code, 404)
        self.assertEqual(self.c_client.get(self.shared_url).status_code, 404)

    def test_client_cannot_modify_staff_work(self):
        response = self.c_client.patch(
            self.shared_url, {'estimated_minutes': 5}, format='json',
        )
        self.assertEqual(response.status_code, 403)
        self.shared.refresh_from_db()
        self.assertEqual(self.shared.estimated_minutes, 60)

    def test_archived_project_rejects_staff_comment(self):
        self.project.status = 'archived'
        self.project.save()
        response = self.c_owner.post(self.shared_url+'comments/', {
            'body': 'Must never change an archived project',
            'visibility': 'internal',
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(WorkItemComment.objects.count(), 0)

    def test_archived_project_rejects_client_comment(self):
        self.project.status = 'archived'
        self.project.save()
        response = self.c_client.post(self.shared_url+'comments/', {
            'body': 'Even a client must not post after archival',
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(WorkItemComment.objects.count(), 0)

    def test_active_project_allows_client_shared_comment(self):
        response = self.c_client.post(self.shared_url+'comments/', {
            'body': 'Please confirm after completing the work',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(WorkItemComment.objects.count(), 1)
        self.assertEqual(response.data['visibility'], 'client')

    def test_pending_delivery_blocks_milestone_create_without_audit(self):
        ProjectDeliveryReview.objects.create(
            project=self.project, status='pending',
            summary='Awaiting client review', submitted_by=self.owner, round_number=1,
        )
        before = ProjectActivity.objects.filter(project=self.project).count()
        response = self.c_owner.post(self.prefix+'milestones/', {
            'name': 'Illegitimate milestone',
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.project.milestones.count(), 2)
        self.assertEqual(ProjectActivity.objects.filter(project=self.project).count(), before)

    def test_pending_delivery_blocks_milestone_change(self):
        ProjectDeliveryReview.objects.create(
            project=self.project, status='pending',
            summary='Awaiting client review', submitted_by=self.owner, round_number=1,
        )
        response = self.c_owner.patch(
            self.prefix+f'milestones/{self.public_ms.id}/',
            {'name': 'Changed after submission'}, format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.public_ms.refresh_from_db()
        self.assertEqual(self.public_ms.name, 'Public Rollout')

    def test_changes_requested_unlocks_milestone_update(self):
        ProjectDeliveryReview.objects.create(
            project=self.project, status='changes_requested',
            summary='Client asks for a change', submitted_by=self.owner, round_number=1,
        )
        response = self.c_owner.patch(
            self.prefix+f'milestones/{self.public_ms.id}/',
            {'name': 'Revised Rollout'}, format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)

    def test_completed_project_blocks_milestone_edit(self):
        self.project.status = 'completed'
        self.project.save()
        response = self.c_owner.patch(
            self.prefix+f'milestones/{self.public_ms.id}/',
            {'name': 'Not allowed'}, format='json',
        )
        self.assertEqual(response.status_code, 400)

    def test_client_cannot_create_milestone(self):
        self.assertEqual(self.c_client.post(self.prefix+'milestones/', {
            'name': 'Client authority bypass',
        }, format='json').status_code, 403)

    def test_project_file_version_cannot_be_downloaded_by_unassigned_client(self):
        created = self.c_owner.post(self.prefix+'files/', {
            'file': SimpleUploadedFile('audit.txt', b'Private final QA report', content_type='text/plain'),
            'category': 'library', 'visibility': 'internal',
        }, format='multipart')
        self.assertEqual(created.status_code, 201, created.data)
        file_id = created.data['id']
        ver_id = created.data['versions'][0]['id']
        url = self.prefix+f'files/{file_id}/versions/{ver_id}/download/'
        self.assertEqual(self.c_client.get(url).status_code, 404)
        staff = self.c_owner.get(url)
        self.assertEqual(staff.status_code, 200)
        self.assertEqual(b''.join(staff.streaming_content), b'Private final QA report')
        self.assertEqual(staff['Cache-Control'], 'private, no-store')

    def test_project_client_visibility_change_cuts_off_reads(self):
        self.project.visibility = 'internal'
        self.project.save()
        self.assertEqual(self.c_client.get(self.prefix+'reports/').status_code, 404)
        self.assertEqual(self.c_client.get(self.shared_url).status_code, 404)

    def test_contributor_cannot_browse_tenant_templates(self):
        self.assertEqual(self.c_agent.get('/api/projects/templates/').status_code, 403)
        self.assertEqual(self.c_client.get('/api/projects/templates/').status_code, 403)

    def test_report_and_timeline_are_read_only_endpoints(self):
        self.assertEqual(self.c_owner.post(self.prefix+'reports/', {}, format='json').status_code, 405)
        self.assertEqual(self.c_owner.post(self.prefix+'timeline/', {}, format='json').status_code, 405)

    def test_manager_effort_summary_excludes_private_items_only_for_clients(self):
        response = self.c_owner.get(self.prefix+'reports/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['effort']['estimated_minutes'], 12600)
        response = self.c_client.get(self.prefix+'reports/')
        self.assertNotIn('effort', response.data)

    def test_project_portfolio_respects_client_access_scope(self):
        self.assertEqual(self.c_client.get('/api/projects/reports/').data['count'], 1)
        self.assertEqual(self.c_other.get('/api/projects/reports/').data['count'], 0)

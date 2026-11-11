"""Phase 2 file library regression, including tenant and client confidentiality."""
import tempfile
from io import BytesIO

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings

from apps.tenants.models import Tenant, ClientOrganization

from .models import (
    Project, ProjectDocument, ProjectDocumentVersion,
    ProjectMember, WorkItem,
)
from .tests import actor, authenticated


def upload(name='requirements.txt', content=b'Requirements version one'):
    return SimpleUploadedFile(name, content, content_type='text/plain')


@override_settings(DEBUG=True, PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class ProjectFileManagementTests(TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls._media = tempfile.TemporaryDirectory(prefix='matedesk-phase2-tests-')
        cls._media_settings = override_settings(MEDIA_ROOT=cls._media.name)
        cls._media_settings.enable()

    @classmethod
    def tearDownClass(cls):
        cls._media_settings.disable()
        cls._media.cleanup()
        super().tearDownClass()

    def setUp(self):
        self.tenant = Tenant.objects.create(name='File MSP', slug='phase2-file-msp')
        self.other_tenant = Tenant.objects.create(name='Other MSP', slug='phase2-other-msp')
        self.org = ClientOrganization.objects.create(tenant=self.tenant, name='Client A')
        self.other_org = ClientOrganization.objects.create(tenant=self.tenant, name='Client B')
        self.owner = actor(self.tenant, 'msp_owner', 'p2owner@example.test')
        self.contributor = actor(self.tenant, 'msp_agent', 'p2agent@example.test')
        self.client = actor(self.tenant, 'client_owner', 'p2client@example.test', self.org)
        self.other_client = actor(self.tenant, 'client_owner', 'p2other@example.test', self.other_org)
        self.same_org_nonmember = actor(self.tenant, 'client_owner', 'p2nomember@example.test', self.org)
        self.external = actor(self.other_tenant, 'msp_owner', 'p2external@example.test')
        self.project = Project.objects.create(
            tenant=self.tenant, client_org=self.org, created_by=self.owner,
            key='FILES', name='Project Files', visibility='client', status='active',
        )
        ProjectMember.objects.create(project=self.project, user=self.owner, role='manager')
        ProjectMember.objects.create(project=self.project, user=self.contributor, role='contributor')
        ProjectMember.objects.create(project=self.project, user=self.client, role='client_reviewer')
        self.owner_api = authenticated(self.owner)
        self.client_api = authenticated(self.client)
        self.contributor_api = authenticated(self.contributor)
        self.files_url = f'/api/projects/{self.project.pk}/files/'
        self.work_item = WorkItem.objects.create(
            project=self.project, number=1, title='Landing Page',
            visibility='client', status='done', created_by=self.owner,
        )
        self.private_work_item = WorkItem.objects.create(
            project=self.project, number=2, title='Internal Database',
            visibility='internal', created_by=self.owner,
        )

    def create(self, *, api=None, filename='requirements.txt', content=b'Requirements version one',
               category='library', visibility='internal', work_item_id=None):
        data = {'file': upload(filename, content), 'category': category, 'visibility': visibility}
        if work_item_id:
            data['work_item_id'] = str(work_item_id)
        return (api or self.owner_api).post(self.files_url, data, format='multipart')

    def versions_url(self, file_id):
        return f'{self.files_url}{file_id}/versions/'

    def download_url(self, file_id, version_id):
        return f'{self.versions_url(file_id)}{version_id}/download/'

    def test_upload_list_and_immutable_download(self):
        created = self.create()
        self.assertEqual(created.status_code, 201, created.data)
        document = created.data
        self.assertEqual(document['category'], 'library')
        self.assertEqual(document['versions'][0]['number'], 1)
        self.assertNotIn('blob', str(document))
        self.assertNotIn('/media/', str(document))
        result = self.owner_api.get(self.files_url)
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.data['count'], 1)
        self.assertEqual(result.data['results'][0]['id'], document['id'])
        version = document['versions'][0]
        stream = self.owner_api.get(self.download_url(document['id'], version['id']))
        self.assertEqual(stream.status_code, 200)
        self.assertEqual(b''.join(stream.streaming_content), b'Requirements version one')
        self.assertIn('attachment;', stream['Content-Disposition'])
        self.assertEqual(stream['Cache-Control'], 'private, no-store')

    def test_version_history_preserves_original(self):
        doc = self.create().data
        result = self.owner_api.post(
            self.versions_url(doc['id']),
            {'file': upload('requirements.txt', b'Requirements version two')},
            format='multipart',
        )
        self.assertEqual(result.status_code, 201, result.data)
        self.assertEqual(result.data['number'], 2)
        old_id = doc['versions'][0]['id']
        second = self.owner_api.get(self.versions_url(doc['id']))
        self.assertEqual([v['number'] for v in second.data], [2, 1])
        old_file = self.owner_api.get(self.download_url(doc['id'], old_id))
        self.assertEqual(b''.join(old_file.streaming_content), b'Requirements version one')
        new_file = self.owner_api.get(self.download_url(doc['id'], result.data['id']))
        self.assertEqual(b''.join(new_file.streaming_content), b'Requirements version two')
        self.assertNotEqual(second.data[0]['sha256'], second.data[1]['sha256'])

    def test_internal_documents_hidden_from_client(self):
        private = self.create()
        public = self.create(filename='public.txt', visibility='client')
        self.assertEqual(private.status_code, 201)
        self.assertEqual(public.status_code, 201)
        visible = self.client_api.get(self.files_url).data['results']
        self.assertEqual([v['id'] for v in visible], [public.data['id']])
        hidden_doc = private.data
        hidden_version = hidden_doc['versions'][0]
        for url in (self.versions_url(hidden_doc['id']),
                    self.download_url(hidden_doc['id'], hidden_version['id']),
                    ):
            self.assertEqual(self.client_api.get(url).status_code, 404)

    def test_client_visibility_revoked_immediately(self):
        doc = self.create(visibility='client').data
        self.assertEqual(self.client_api.get(self.versions_url(doc['id'])).status_code, 200)
        changed = self.owner_api.patch(
            f"{self.files_url}{doc['id']}/", {'visibility': 'internal'}, format='json',
        )
        self.assertEqual(changed.status_code, 200, changed.data)
        self.assertEqual(self.client_api.get(self.versions_url(doc['id'])).status_code, 404)

    def test_other_tenant_and_other_client_cannot_guess_ids(self):
        doc = self.create(visibility='client').data
        for user in (self.external, self.other_client, self.same_org_nonmember):
            api = authenticated(user)
            self.assertEqual(api.get(self.files_url).status_code, 404)
            self.assertEqual(
                api.get(self.download_url(doc['id'], doc['versions'][0]['id'])).status_code, 404,
            )

    def test_client_can_upload_public_library_document(self):
        response = self.create(api=self.client_api, visibility='client')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(str(response.data['created_by']), str(self.client.pk))
        self.assertEqual(self.client_api.get(self.files_url).data['count'], 1)

    def test_client_cannot_upload_internal_or_delivery_file(self):
        self.assertEqual(self.create(api=self.client_api, visibility='internal').status_code, 403)
        self.assertEqual(
            self.create(api=self.client_api, category='delivery', visibility='client').status_code, 403,
        )

    def test_client_cannot_change_another_clients_file(self):
        doc = self.create(visibility='client').data
        self.assertEqual(
            self.client_api.post(
                self.versions_url(doc['id']), {'file': upload()}, format='multipart',
            ).status_code, 403,
        )

    def test_contributor_can_upload_internal_but_cannot_publish(self):
        self.assertEqual(
            self.create(api=self.contributor_api, visibility='internal').status_code, 201,
        )
        self.assertEqual(
            self.create(api=self.contributor_api, visibility='client').status_code, 403,
        )

    def test_work_item_attachment_visibility_and_scope(self):
        attached = self.create(category='work_item', visibility='client', work_item_id=self.work_item.pk)
        self.assertEqual(attached.status_code, 201, attached.data)
        private = self.create(category='work_item', visibility='internal', work_item_id=self.private_work_item.pk)
        self.assertEqual(private.status_code, 201, private.data)
        result = self.client_api.get(self.files_url + '?category=work_item')
        self.assertEqual(result.data['count'], 1)
        self.assertEqual(result.data['results'][0]['id'], attached.data['id'])
        self.assertEqual(
            self.create(category='work_item', visibility='client',
                        work_item_id=self.private_work_item.pk).status_code, 400,
        )
        other_project = Project.objects.create(
            tenant=self.tenant, client_org=self.org, created_by=self.owner,
            key='OTHER', name='Other Project', visibility='client',
        )
        other_work = WorkItem.objects.create(project=other_project, number=1, title='Other', created_by=self.owner)
        self.assertEqual(
            self.create(category='work_item', work_item_id=other_work.id).status_code, 404,
        )

    def test_private_work_item_attachment_cannot_be_published_via_patch(self):
        doc = self.create(category='work_item', visibility='internal',
                          work_item_id=self.private_work_item.pk).data
        response = self.owner_api.patch(
            f"{self.files_url}{doc['id']}/", {'visibility': 'client'},
            format='json',
        )
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(ProjectDocument.objects.get(pk=doc['id']).visibility, 'internal')

    def test_filename_newline_is_safely_sanitized(self):
        result = self.create(filename='invalid\nname.txt')
        self.assertEqual(result.status_code, 201, result.data)
        self.assertEqual(result.data['versions'][0]['original_name'], 'invalidname.txt')

    def test_upload_validation_blocks_invalid_or_disguised_files(self):
        for name, contents in [
            ('malware.exe', b'executable'),
            ('attack.html', b'<script>alert(1)</script>'),
            ('fake.pdf', b'not actually pdf'),
            ('fake.png', b'not actually png'),
            ('empty.txt', b''),
        ]:
            with self.subTest(name=name):
                result = self.create(filename=name, content=contents)
                self.assertEqual(result.status_code, 400, result.data)
        large = self.create(content=b'X' * (20 * 1024 * 1024 + 1))
        self.assertEqual(large.status_code, 400)
        self.assertEqual(ProjectDocument.objects.count(), 0)

    def test_preview_only_for_known_safe_media(self):
        pdf = self.create(filename='project.pdf', content=b'%PDF-1.4\nsample', visibility='client').data
        version = pdf['versions'][0]
        preview = self.client_api.get(self.download_url(pdf['id'], version['id']) + '?preview=1')
        self.assertEqual(preview.status_code, 200)
        self.assertEqual(preview['Content-Type'], 'application/pdf')
        self.assertEqual(preview['Content-Security-Policy'], 'sandbox')
        text = self.create(visibility='client').data
        t = self.client_api.get(self.download_url(text['id'], text['versions'][0]['id']) + '?preview=1')
        self.assertEqual(t['Content-Type'], 'application/octet-stream')
        self.assertIn('attachment;', t['Content-Disposition'])

    def test_soft_archive_hides_file_but_preserves_versions(self):
        document = self.create().data
        response = self.owner_api.delete(f"{self.files_url}{document['id']}/")
        self.assertEqual(response.status_code, 204, response.data)
        self.assertEqual(self.owner_api.get(self.files_url).data['count'], 0)
        self.assertEqual(ProjectDocumentVersion.objects.count(), 1)
        self.assertEqual(
            self.owner_api.get(self.download_url(document['id'], document['versions'][0]['id'])).status_code,
            404,
        )

    def test_delivery_file_staged_then_frozen_on_submission(self):
        draft = self.create(filename='handoff.pdf', content=b'%PDF-1.4\nhandoff',
                            category='delivery', visibility='client')
        self.assertEqual(draft.status_code, 201, draft.data)
        document = draft.data
        self.assertEqual(self.client_api.get(self.files_url + '?category=delivery').data['count'], 0)
        self.private_work_item.status = 'cancelled'
        self.private_work_item.save()
        result = self.owner_api.post(
            f'/api/projects/{self.project.id}/delivery/submit/',
            {'summary': 'Website work finished and ready for approval.'},
            format='json',
        )
        self.assertEqual(result.status_code, 201, result.data)
        file_record = ProjectDocument.objects.get(pk=document['id'])
        self.assertIsNotNone(file_record.delivery_review_id)
        self.assertEqual(self.client_api.get(self.files_url + '?category=delivery').data['count'], 1)
        self.assertEqual(
            self.owner_api.post(
                self.versions_url(document['id']), {'file': upload()}, format='multipart'
            ).status_code, 400,
        )
        self.assertEqual(
            self.owner_api.delete(f"{self.files_url}{document['id']}/").status_code, 400,
        )

    def test_draft_delivery_requires_manager(self):
        result = self.create(api=self.contributor_api, category='delivery', visibility='client')
        self.assertEqual(result.status_code, 403)

    def test_completed_project_does_not_allow_version_mutations(self):
        doc = self.create().data
        Project.objects.filter(pk=self.project.pk).update(status='completed')
        self.assertEqual(
            self.owner_api.post(self.versions_url(doc['id']),
                                {'file': upload()}, format='multipart').status_code, 400,
        )
        self.assertEqual(self.owner_api.delete(f"{self.files_url}{doc['id']}/").status_code, 400)

    def test_non_member_staff_agent_cannot_view_project_files(self):
        another_agent = actor(self.tenant, 'msp_agent', 'p2stranger@example.test')
        document = self.create().data
        self.assertEqual(
            authenticated(another_agent).get(
                self.download_url(document['id'], document['versions'][0]['id'])
            ).status_code, 404,
        )

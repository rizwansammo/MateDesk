"""Phase 4 regression tests: blockers, dependency cycles, checklist, tenant access."""
from django.core.exceptions import ValidationError as DjangoValidationError
from django.test import TestCase, override_settings

from apps.tenants.models import ClientOrganization, Tenant

from .models import (
    Project, ProjectActivity, ProjectDeliveryReview, ProjectMember,
    WorkItem, WorkItemChecklistEntry, WorkItemDependency,
)
from .tests import actor, authenticated


@override_settings(DEBUG=True, PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class AdvancedWorkItemTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Phase4 Company', slug='phase4-company')
        self.foreign_tenant = Tenant.objects.create(name='Foreign Company', slug='phase4-foreign')
        self.org = ClientOrganization.objects.create(tenant=self.tenant, name='Client One')
        self.other_org = ClientOrganization.objects.create(tenant=self.tenant, name='Client Two')
        self.owner = actor(self.tenant, 'msp_owner', 'p4owner@example.test')
        self.agent = actor(self.tenant, 'msp_agent', 'p4agent@example.test')
        self.client = actor(self.tenant, 'client_owner', 'p4client@example.test', self.org)
        self.other_client = actor(self.tenant, 'client_owner', 'p4otherclient@example.test', self.other_org)
        self.unassigned_agent = actor(self.tenant, 'msp_agent', 'p4unassigned@example.test')
        self.other_owner = actor(self.foreign_tenant, 'msp_owner', 'p4foreign@example.test')
        self.project = Project.objects.create(
            tenant=self.tenant, client_org=self.org, key='PHFO',
            name='Advanced Work', visibility='client', status='active', created_by=self.owner,
        )
        ProjectMember.objects.create(project=self.project, user=self.owner, role='manager')
        ProjectMember.objects.create(project=self.project, user=self.agent, role='contributor')
        ProjectMember.objects.create(project=self.project, user=self.client, role='client_reviewer')
        self.first = WorkItem.objects.create(
            project=self.project, number=1, title='Database setup', visibility='internal',
            status='todo', created_by=self.owner,
        )
        self.second = WorkItem.objects.create(
            project=self.project, number=2, title='Public website', visibility='client',
            status='todo', created_by=self.owner,
        )
        self.third = WorkItem.objects.create(
            project=self.project, number=3, title='Final validation', visibility='client',
            status='todo', created_by=self.owner,
        )
        self.manager_api = authenticated(self.owner)
        self.agent_api = authenticated(self.agent)
        self.client_api = authenticated(self.client)

    def dependencies(self, item=None):
        return f'/api/work-items/{(item or self.second).id}/dependencies/'

    def checklist(self, item=None):
        return f'/api/work-items/{(item or self.second).id}/checklist/'

    def detail(self, item=None):
        return f'/api/work-items/{(item or self.second).id}/'

    def add_dependency(self, item=None, prerequisite=None, api=None):
        return (api or self.manager_api).post(
            self.dependencies(item), {'prerequisite_id': str((prerequisite or self.first).id)},
            format='json',
        )

    def add_checklist(self, item=None, **changes):
        data = {'title': 'Check mobile layout', **changes}
        return self.manager_api.post(self.checklist(item), data, format='json')

    def set_status(self, item, status, api=None):
        return (api or self.manager_api).patch(self.detail(item), {'status': status}, format='json')

    def test_new_items_have_no_blockers_and_empty_checklist(self):
        result = self.manager_api.get(self.detail())
        self.assertEqual(result.status_code, 200)
        self.assertIs(result.data['is_blocked'], False)
        self.assertEqual(result.data['blocked_by_count'], 0)
        self.assertEqual(result.data['checklist_total'], 0)
        self.assertEqual(result.data['checklist_completed'], 0)

    def test_dependency_create_blocks_start_and_is_visible_on_project_list(self):
        added = self.add_dependency()
        self.assertEqual(added.status_code, 201, added.data)
        item = self.manager_api.get(self.detail()).data
        self.assertIs(item['is_blocked'], True)
        self.assertEqual(item['blocked_by_count'], 1)
        listing = self.manager_api.get(f'/api/projects/{self.project.pk}/work-items/')
        self.assertEqual(listing.status_code, 200)
        row = next(x for x in listing.data if x['id'] == str(self.second.pk))
        self.assertTrue(row['is_blocked'])
        self.assertEqual(self.set_status(self.second, 'in_progress').status_code, 400)
        self.assertEqual(self.set_status(self.second, 'in_review').status_code, 400)
        self.assertEqual(self.set_status(self.second, 'done').status_code, 400)
        self.second.refresh_from_db()
        self.assertEqual(self.second.status, 'todo')

    def test_completing_prerequisite_unblocks_without_auto_start(self):
        self.add_dependency()
        self.assertEqual(self.set_status(self.first, 'done').status_code, 200)
        status = self.manager_api.get(self.detail()).data
        self.assertFalse(status['is_blocked'])
        self.assertEqual(status['blocked_by_count'], 0)
        self.assertEqual(status['status'], 'todo')
        self.assertEqual(self.set_status(self.second, 'in_progress').status_code, 200)
        self.second.refresh_from_db()
        self.assertEqual(self.second.status, 'in_progress')
        self.project.refresh_from_db()
        self.assertEqual(self.project.status, 'active')

    def test_cancelled_prerequisite_does_not_satisfy_dependency(self):
        self.add_dependency()
        self.assertEqual(self.set_status(self.first, 'cancelled').status_code, 200)
        self.assertTrue(self.manager_api.get(self.detail()).data['is_blocked'])

    def test_can_remove_dependency_to_unblock(self):
        added = self.add_dependency().data
        response = self.manager_api.delete(self.dependencies() + str(added['id']) + '/')
        self.assertEqual(response.status_code, 204)
        self.assertFalse(self.manager_api.get(self.detail()).data['is_blocked'])
        self.assertEqual(self.manager_api.get(self.dependencies()).data, [])

    def test_no_duplicate_self_or_cycles(self):
        self.assertEqual(self.add_dependency().status_code, 201)
        self.assertEqual(self.add_dependency().status_code, 400)
        self.assertEqual(self.add_dependency(item=self.second, prerequisite=self.second).status_code, 400)
        self.assertEqual(self.add_dependency(item=self.third, prerequisite=self.second).status_code, 201)
        self.assertEqual(self.add_dependency(item=self.first, prerequisite=self.third).status_code, 400)
        self.assertEqual(WorkItemDependency.objects.count(), 2)

    def test_cross_project_dependency_rejected(self):
        another = Project.objects.create(
            tenant=self.tenant, client_org=self.org, created_by=self.owner,
            key='OTHER', name='Another Project', visibility='client',
        )
        outside_item = WorkItem.objects.create(
            project=another, number=1, title='Outside Work', created_by=self.owner,
        )
        self.assertEqual(
            self.add_dependency(prerequisite=outside_item).status_code, 404,
        )

    def test_model_rejects_cross_project_dependency(self):
        another = Project.objects.create(
            tenant=self.tenant, client_org=self.org, created_by=self.owner,
            key='LATE', name='Other Project',
        )
        outside = WorkItem.objects.create(project=another, number=1, title='Different Project', created_by=self.owner)
        with self.assertRaises(DjangoValidationError):
            WorkItemDependency.objects.create(
                work_item=self.second, prerequisite=outside, created_by=self.owner,
            )

    def test_model_rejects_cycle_even_outside_rest_endpoint(self):
        WorkItemDependency.objects.create(
            work_item=self.second, prerequisite=self.first, created_by=self.owner,
        )
        with self.assertRaises(DjangoValidationError):
            WorkItemDependency.objects.create(
                work_item=self.first, prerequisite=self.second, created_by=self.owner,
            )

    def test_client_cannot_view_internal_prerequisite_details(self):
        self.add_dependency()
        result = self.client_api.get(self.dependencies())
        self.assertEqual(result.status_code, 200)
        self.assertEqual(len(result.data), 1)
        row = result.data[0]
        self.assertIsNone(row['id'])
        self.assertIsNone(row['prerequisite_id'])
        self.assertIsNone(row['ref'])
        self.assertIsNone(row['status'])
        self.assertIsNone(row['completed'])
        self.assertEqual(row['title'], 'Internal Project Work')
        self.assertTrue(row['internal'])
        self.assertNotIn('Database setup', str(result.data))
        listing = self.client_api.get(f'/api/projects/{self.project.pk}/work-items/')
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(len(listing.data), 2)
        public_item = next(x for x in listing.data if x['id'] == str(self.second.id))
        self.assertTrue(public_item['is_blocked'])
        self.assertEqual(public_item['blocked_by_count'], 0)  # hide private dependency counts

    def test_client_can_view_published_prerequisite(self):
        self.first.visibility = 'client'
        self.first.save()
        self.add_dependency()
        row = self.client_api.get(self.dependencies()).data[0]
        self.assertEqual(row['title'], 'Database setup')
        self.assertEqual(row['ref'], self.first.ref)

    def test_client_cannot_mutate_dependencies(self):
        self.assertEqual(self.add_dependency(api=self.client_api).status_code, 403)
        added = self.add_dependency().data
        self.assertEqual(
            self.client_api.delete(self.dependencies() + str(added['id']) + '/').status_code,
            403,
        )

    def test_unassigned_agent_other_org_and_foreign_tenant_have_no_access(self):
        self.add_dependency()
        for user in (self.unassigned_agent, self.other_client, self.other_owner):
            api = authenticated(user)
            self.assertEqual(api.get(self.dependencies()).status_code, 404)
            self.assertEqual(api.get(self.checklist()).status_code, 404)

    def test_private_work_item_cannot_be_read_by_client(self):
        self.assertEqual(self.client_api.get(self.dependencies(self.first)).status_code, 403)
        self.assertEqual(self.client_api.get(self.checklist(self.first)).status_code, 403)

    def test_contributor_may_manage_dependencies(self):
        self.assertEqual(self.add_dependency(api=self.agent_api).status_code, 201)

    def test_active_item_cannot_acquire_unfinished_prerequisite(self):
        self.assertEqual(self.set_status(self.second, 'in_progress').status_code, 200)
        self.assertEqual(self.add_dependency().status_code, 400)
        self.assertEqual(WorkItemDependency.objects.count(), 0)

    def test_cannot_add_dependencies_to_closed_item(self):
        self.set_status(self.second, 'done')
        self.assertEqual(self.add_dependency().status_code, 400)
        self.assertEqual(WorkItemDependency.objects.count(), 0)

    def test_cannot_reopen_done_prerequisite_after_dependent_begins(self):
        self.add_dependency()
        self.set_status(self.first, 'done')
        self.set_status(self.second, 'in_progress')
        self.assertEqual(self.set_status(self.first, 'todo').status_code, 400)
        self.assertEqual(self.set_status(self.first, 'cancelled').status_code, 400)
        self.first.refresh_from_db()
        self.assertEqual(self.first.status, 'done')

    def test_closed_dependent_cannot_lose_dependency(self):
        dependency = self.add_dependency().data
        self.set_status(self.first, 'done')
        self.set_status(self.second, 'done')
        self.assertEqual(
            self.manager_api.delete(self.dependencies() + str(dependency['id']) + '/').status_code,
            400,
        )

    def test_checklist_create_and_progress(self):
        added = self.add_checklist()
        self.assertEqual(added.status_code, 201, added.data)
        status = self.manager_api.get(self.detail()).data
        self.assertEqual(status['checklist_total'], 1)
        self.assertEqual(status['checklist_completed'], 0)
        self.assertEqual(self.set_status(self.second, 'done').status_code, 400)

    def test_toggle_checklist_then_done_is_allowed(self):
        added = self.add_checklist().data
        entry_url = self.checklist() + str(added['id']) + '/'
        done = self.manager_api.patch(entry_url, {'is_done': True}, format='json')
        self.assertEqual(done.status_code, 200, done.data)
        self.assertIsNotNone(done.data['completed_at'])
        self.assertEqual(done.data['completed_by_name'], self.owner.full_name)
        self.assertEqual(self.manager_api.get(self.detail()).data['checklist_completed'], 1)
        self.assertEqual(self.set_status(self.second, 'done').status_code, 200)
        self.second.refresh_from_db()
        self.assertEqual(self.second.status, 'done')

    def test_checklist_reopen_and_uncheck(self):
        added = self.add_checklist().data
        url = self.checklist() + str(added['id']) + '/'
        self.manager_api.patch(url, {'is_done': True}, format='json')
        result = self.manager_api.patch(url, {'is_done': False}, format='json')
        self.assertEqual(result.status_code, 200, result.data)
        self.assertIsNone(result.data['completed_at'])
        self.assertIsNone(result.data['completed_by_name'])
        self.assertEqual(self.manager_api.get(self.detail()).data['checklist_completed'], 0)

    def test_done_task_checklist_immutable_until_reopened(self):
        entry = self.add_checklist().data
        entry_url = self.checklist() + str(entry['id']) + '/'
        self.manager_api.patch(entry_url, {'is_done': True}, format='json')
        self.set_status(self.second, 'done')
        self.assertEqual(self.manager_api.patch(entry_url, {'title': 'New title'}, format='json').status_code, 400)
        self.assertEqual(self.manager_api.delete(entry_url).status_code, 400)
        self.assertEqual(self.add_checklist().status_code, 400)
        self.assertEqual(self.set_status(self.second, 'todo').status_code, 200)
        self.assertEqual(self.manager_api.patch(entry_url, {'is_done': False}, format='json').status_code, 200)

    def test_checklist_delete_changes_total(self):
        entry = self.add_checklist().data
        result = self.manager_api.delete(self.checklist() + str(entry['id']) + '/')
        self.assertEqual(result.status_code, 204)
        self.assertEqual(self.manager_api.get(self.detail()).data['checklist_total'], 0)

    def test_client_sees_only_published_checklist_lines(self):
        internal = self.add_checklist(title='Internal database passwords').data
        public = self.add_checklist(title='Review landing page', visibility='client').data
        result = self.client_api.get(self.checklist())
        self.assertEqual(result.status_code, 200)
        self.assertEqual([x['id'] for x in result.data], [str(public['id'])])
        self.assertNotIn('Internal database passwords', str(result.data))
        client_item = self.client_api.get(self.detail()).data
        self.assertEqual(client_item['checklist_total'], 1)
        self.assertEqual(client_item['checklist_completed'], 0)
        self.assertEqual(self.manager_api.get(self.detail()).data['checklist_total'], 2)

    def test_client_cannot_mutate_checklist(self):
        self.assertEqual(
            self.client_api.post(self.checklist(), {'title': 'Insert private record'}, format='json').status_code,
            403,
        )
        public = self.add_checklist(visibility='client').data
        entry_url = self.checklist() + str(public['id']) + '/'
        self.assertEqual(self.client_api.patch(entry_url, {'is_done': True}, format='json').status_code, 403)
        self.assertEqual(self.client_api.delete(entry_url).status_code, 403)

    def test_contributor_cannot_publish_checklist_to_client(self):
        result = self.agent_api.post(
            self.checklist(),
            {'title': 'Do not publish', 'visibility': 'client'},
            format='json',
        )
        self.assertEqual(result.status_code, 403)
        internal = self.agent_api.post(
            self.checklist(), {'title': 'Internal review'}, format='json',
        )
        self.assertEqual(internal.status_code, 201, internal.data)
        entry_url = self.checklist() + str(internal.data['id']) + '/'
        self.assertEqual(
            self.agent_api.patch(entry_url, {'visibility': 'client'}, format='json').status_code,
            403,
        )

    def test_private_work_item_cannot_publish_checklist_line(self):
        result = self.add_checklist(item=self.first, visibility='client')
        self.assertEqual(result.status_code, 400)
        self.assertEqual(WorkItemChecklistEntry.objects.count(), 0)

    def test_checklist_validation_rejects_blank_and_oversized(self):
        for value in ('', '   ', 'x' * 300):
            with self.subTest(title=value):
                self.assertEqual(self.add_checklist(title=value).status_code, 400)

    def test_dependency_and_checklist_audited(self):
        dependency = self.add_dependency().data
        checklist = self.add_checklist().data
        self.manager_api.patch(
            self.checklist() + str(checklist['id']) + '/',
            {'is_done': True}, format='json',
        )
        self.manager_api.delete(self.dependencies() + str(dependency['id']) + '/')
        rows = list(ProjectActivity.objects.filter(project=self.project, kind='work_item_updated'))
        self.assertGreaterEqual(len(rows), 4)

    def test_delivery_lock_blocks_all_changes(self):
        ProjectDeliveryReview.objects.create(
            project=self.project, round_number=1, summary='Client handoff delivered',
            status='pending', submitted_by=self.owner,
        )
        self.assertEqual(self.add_dependency().status_code, 400)
        self.assertEqual(self.add_checklist().status_code, 400)
        self.assertEqual(self.set_status(self.first, 'done').status_code, 400)

    def test_completed_project_blocks_changes(self):
        Project.objects.filter(pk=self.project.pk).update(status='completed')
        self.assertEqual(self.add_dependency().status_code, 400)
        self.assertEqual(self.add_checklist().status_code, 400)

    def test_business_decision_on_hold_is_not_automatically_changed(self):
        Project.objects.filter(pk=self.project.pk).update(status='on_hold')
        self.add_dependency()
        self.set_status(self.first, 'done')
        self.set_status(self.second, 'in_progress')
        self.project.refresh_from_db()
        self.assertEqual(self.project.status, 'on_hold')

    def test_deactivated_staff_history_does_not_prevent_manager_edits(self):
        entry = self.add_checklist().data
        url = self.checklist() + str(entry['id']) + '/'
        self.manager_api.patch(url, {'is_done': True}, format='json')
        self.owner.is_active = False
        self.owner.save(update_fields=['is_active'])
        new_manager = actor(self.tenant, 'msp_manager', 'p4managerafter@example.test')
        another_api = authenticated(new_manager)
        result = another_api.patch(url, {'title': 'Updated safely after staff departure'}, format='json')
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(result.data['title'], 'Updated safely after staff departure')
        self.assertTrue(result.data['is_done'])

    def test_checklist_sort_order(self):
        self.add_checklist(title='Last', position=10)
        self.add_checklist(title='First', position=1)
        titles = [row['title'] for row in self.manager_api.get(self.checklist()).data]
        self.assertEqual(titles, ['First', 'Last'])

    def test_zero_blockers_after_marking_one_of_two_dependencies_done(self):
        self.add_dependency()
        self.add_dependency(prerequisite=self.third)
        self.assertEqual(self.manager_api.get(self.detail()).data['blocked_by_count'], 2)
        self.set_status(self.first, 'done')
        self.assertEqual(self.manager_api.get(self.detail()).data['blocked_by_count'], 1)
        self.set_status(self.third, 'done')
        self.assertEqual(self.manager_api.get(self.detail()).data['blocked_by_count'], 0)

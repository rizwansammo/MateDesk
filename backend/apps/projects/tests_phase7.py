"""Phase 7: live reports, read only timeline and tenant-safe reusable templates."""
from datetime import timedelta
from uuid import uuid4
from django.core.exceptions import ValidationError as DjangoValidationError
from django.test import TestCase, override_settings
from django.utils import timezone
from apps.tenants.models import Tenant, ClientOrganization
from .models import (
    Project, ProjectMember, ProjectMilestone, ProjectTemplate, WorkItem,
    WorkItemChecklistEntry, WorkItemDependency, ProjectTimeEntry,
)
from .tests_requests import actor, client_for


@override_settings(DEBUG=True, PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class ProjectPhase7Tests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name='Phase7 MSP', slug='phase7msp')
        self.foreign_tenant = Tenant.objects.create(name='Other MSP7', slug='phase7foreign')
        self.org = ClientOrganization.objects.create(tenant=self.tenant, name='Company A')
        self.other_org = ClientOrganization.objects.create(tenant=self.tenant, name='Company B')
        self.foreign_org = ClientOrganization.objects.create(
            tenant=self.foreign_tenant, name='Foreign Org',
        )
        self.owner = actor(self.tenant, 'owner@phase7.test', 'msp_owner')
        self.manager = actor(self.tenant, 'manager@phase7.test', 'msp_manager')
        self.agent = actor(self.tenant, 'agent@phase7.test', 'msp_agent')
        self.outsider = actor(self.tenant, 'otheragent@phase7.test', 'msp_agent')
        self.client = actor(self.tenant, 'client@phase7.test', 'client_owner', self.org)
        self.foreign = actor(self.foreign_tenant, 'foreign@phase7.test', 'msp_owner')
        self.today = timezone.localdate()
        self.project = Project.objects.create(
            tenant=self.tenant, client_org=self.org,
            created_by=self.owner, name='Website Delivery', key='PSEVEN',
            start_date=self.today-timedelta(days=30),
            due_date=self.today+timedelta(days=60),
            status='planned', visibility='client',
        )
        for person, role in ((self.agent, 'contributor'), (self.client, 'client_reviewer')):
            ProjectMember.objects.create(project=self.project, user=person, role=role)
        self.private_ms = ProjectMilestone.objects.create(
            project=self.project, name='Staff Research',
            visibility='internal', position=0,
            start_date=self.today-timedelta(days=28),
            due_date=self.today+timedelta(days=14),
        )
        self.public_ms = ProjectMilestone.objects.create(
            project=self.project, name='Public Launch',
            visibility='client', position=1,
            start_date=self.today-timedelta(days=14),
            due_date=self.today+timedelta(days=50),
        )
        self.private = WorkItem.objects.create(
            project=self.project, number=1, title='Internal audit',
            visibility='internal', created_by=self.owner,
            milestone=self.private_ms, status='todo', priority='urgent',
            estimated_minutes=300,
            start_date=self.today-timedelta(days=20),
            due_date=self.today-timedelta(days=1), assignee=self.agent,
        )
        self.public = WorkItem.objects.create(
            project=self.project, number=2, title='Client feature',
            visibility='client', created_by=self.owner,
            milestone=self.public_ms, status='backlog',
            estimated_minutes=180,
            start_date=self.today, due_date=self.today+timedelta(days=35),
            assignee=self.agent,
        )
        self.public_hidden_ms = WorkItem.objects.create(
            project=self.project, number=3, title='Visible without milestone',
            visibility='client', created_by=self.owner,
            milestone=self.private_ms, status='todo',
        )
        WorkItemDependency.objects.create(
            work_item=self.public, prerequisite=self.private, created_by=self.owner,
        )
        WorkItemChecklistEntry.objects.create(
            work_item=self.public, title='Client Checklist',
            visibility='client', position=0, is_done=True,
            created_by=self.owner, completed_by=self.owner,
            completed_at=timezone.now(),
        )
        WorkItemChecklistEntry.objects.create(
            work_item=self.public, title='Private Checklist',
            visibility='internal', position=1, is_done=False,
            created_by=self.owner,
        )
        self.c_owner = client_for(self.owner)
        self.c_manager = client_for(self.manager)
        self.c_agent = client_for(self.agent)
        self.c_outsider = client_for(self.outsider)
        self.c_client = client_for(self.client)
        self.c_foreign = client_for(self.foreign)
        self.reports = f'/api/projects/{self.project.pk}/reports/'
        self.timeline = f'/api/projects/{self.project.pk}/timeline/'
        self.capture = f'/api/projects/{self.project.pk}/templates/capture/'
        self.templates = '/api/projects/templates/'
        self.portfolio = '/api/projects/reports/'

    def save_template(self, name='Agency Website'):
        return self.c_owner.post(
            self.capture, {'name': name, 'description': 'Reusable website delivery'},
            format='json',
        )

    def empty_target(self, key='FRESH7', status='planned'):
        return Project.objects.create(
            tenant=self.tenant, client_org=self.other_org, created_by=self.owner,
            key=key, name='New rollout', status=status, visibility='client',
            start_date=self.today+timedelta(days=10),
        )

    def test_report_counts_status_and_overdue_correctly(self):
        result = self.c_owner.get(self.reports)
        self.assertEqual(result.status_code, 200, result.data)
        data = result.data
        self.assertEqual(data['work_items']['total'], 3)
        self.assertEqual(data['work_items']['done'], 0)
        self.assertEqual(data['work_items']['overdue'], 1)
        self.assertEqual(data['work_items']['completion_percent'], 0)
        self.assertEqual(data['milestones']['total'], 2)
        self.assertEqual(data['milestones']['completed'], 0)

    def test_client_report_excludes_private_progress(self):
        result = self.c_client.get(self.reports)
        self.assertEqual(result.status_code, 200, result.data)
        data = result.data
        self.assertTrue(data['is_client_view'])
        self.assertEqual(data['work_items']['total'], 2)
        self.assertEqual(data['work_items']['overdue'], 0)
        self.assertEqual(data['milestones']['total'], 1)
        self.assertNotIn('team', data)
        self.assertNotIn('effort', data)
        self.assertNotIn('time', data)

    def test_manager_report_team_estimate(self):
        result = self.c_manager.get(self.reports)
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(result.data['effort']['estimated_minutes'], 480)
        self.assertEqual(result.data['team'][0]['assigned'], 2)
        self.assertEqual(result.data['team'][0]['overdue'], 1)

    def test_contributor_sees_no_others_time_or_staff_report(self):
        result = self.c_agent.get(self.reports)
        self.assertEqual(result.status_code, 200, result.data)
        self.assertNotIn('team', result.data)
        self.assertNotIn('effort', result.data)
        self.assertEqual(result.data['time']['scope'], 'own')

    def test_client_timeline_dependencies_private_prerequisite_masked(self):
        result = self.c_client.get(self.timeline)
        self.assertEqual(result.status_code, 200, result.data)
        data = result.data
        self.assertEqual(len(data['work_items']), 2)
        self.assertEqual(len(data['milestones']), 1)
        client_item = next(x for x in data['work_items'] if x['title'] == 'Client feature')
        self.assertEqual(client_item['dependencies'], [])
        self.assertIsNone(client_item['estimated_minutes'])
        hidden_parent = next(x for x in data['work_items']
                             if x['title'] == 'Visible without milestone')
        self.assertIsNone(hidden_parent['milestone_id'])
        self.assertNotIn('Internal audit', str(data))

    def test_staff_timeline_preserves_dependencies_and_dates(self):
        data = self.c_owner.get(self.timeline).data
        entry = next(x for x in data['work_items'] if x['title'] == 'Client feature')
        self.assertEqual(entry['dependencies'], [str(self.private.pk)])
        self.assertEqual(entry['estimated_minutes'], 180)
        self.assertEqual(entry['start_date'].isoformat(), self.today.isoformat())

    def test_invalid_date_ranges_on_models(self):
        ms = ProjectMilestone(
            project=self.project, name='Backwards', start_date=self.today+timedelta(days=3),
            due_date=self.today,
        )
        with self.assertRaises(DjangoValidationError):
            ms.save()
        item = WorkItem(
            project=self.project, number=17, title='Backwards',
            created_by=self.owner, start_date=self.today+timedelta(days=3),
            due_date=self.today,
        )
        with self.assertRaises(DjangoValidationError):
            item.save()

    def test_portfolio_only_shows_accessible_projects(self):
        second = self.empty_target()
        rows = self.c_client.get(self.portfolio).data['results']
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['project_id'], str(self.project.pk))
        rows = self.c_owner.get(self.portfolio).data['results']
        self.assertEqual(len(rows), 2)
        self.assertEqual({x['project_id'] for x in rows}, {str(self.project.pk), str(second.pk)})

    def test_outsider_and_foreign_tenant_cannot_view_reports(self):
        for api in (self.c_outsider, self.c_foreign):
            self.assertEqual(api.get(self.reports).status_code, 404)
            self.assertEqual(api.get(self.timeline).status_code, 404)

    def test_client_revocation_withdraws_timeline_and_report(self):
        ProjectMember.objects.filter(project=self.project, user=self.client).delete()
        self.assertEqual(self.c_client.get(self.reports).status_code, 404)
        self.assertEqual(self.c_client.get(self.timeline).status_code, 404)
        self.assertEqual(self.c_client.get(self.portfolio).data['count'], 0)

    def test_client_organization_visibility_withdraws_access(self):
        self.project.visibility = 'internal'
        self.project.save()
        self.assertEqual(self.c_client.get(self.reports).status_code, 404)
        self.assertEqual(self.c_client.get(self.timeline).status_code, 404)

    def test_portfolio_pagination_invalid_page_and_empty_counts(self):
        self.assertEqual(self.c_owner.get(self.portfolio + '?page=no').status_code, 400)
        self.assertEqual(self.c_owner.get(self.portfolio + '?page=-1').status_code, 400)
        result = self.c_owner.get(self.portfolio+'?page=2')
        self.assertEqual(result.data['results'], [])
        self.assertEqual(result.data['count'], 1)

    def test_template_capture_includes_structure_and_not_identity(self):
        response = self.save_template()
        self.assertEqual(response.status_code, 201, response.data)
        saved = ProjectTemplate.objects.get(pk=response.data['id'])
        self.assertEqual(len(saved.snapshot['milestones']), 2)
        self.assertEqual(len(saved.snapshot['work_items']), 3)
        self.assertEqual(len(saved.snapshot['dependencies']), 1)
        self.assertEqual(len(saved.snapshot['work_items'][1]['checklists']), 2)
        self.assertNotIn(str(self.client.id), str(saved.snapshot))
        self.assertNotIn(str(self.agent.id), str(saved.snapshot))
        self.assertNotIn(str(self.org.id), str(saved.snapshot))

    def test_manager_can_list_tenant_templates(self):
        self.save_template()
        result = self.c_manager.get(self.templates)
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.data[0]['name'], 'Agency Website')

    def test_client_and_agent_cannot_capture_or_list_templates(self):
        for api in (self.c_client, self.c_agent):
            self.assertEqual(api.get(self.templates).status_code, 403)
            self.assertEqual(api.post(self.capture, {'name': 'Forbidden'}, format='json').status_code, 403)

    def test_capture_duplicate_name_is_rejected(self):
        self.assertEqual(self.save_template().status_code, 201)
        self.assertEqual(self.save_template().status_code, 400)
        self.assertEqual(ProjectTemplate.objects.count(), 1)

    def test_template_apply_copies_milestones_items_checklist_dependencies(self):
        template = self.save_template()
        target = self.empty_target()
        result = self.c_owner.post(
            f'/api/projects/{target.pk}/templates/{template.data["id"]}/apply/',
            {}, format='json',
        )
        self.assertEqual(result.status_code, 201, result.data)
        self.assertEqual(result.data['work_items_created'], 3)
        self.assertEqual(result.data['milestones_created'], 2)
        items = list(target.work_items.order_by('number'))
        self.assertEqual([row.number for row in items], [1, 2, 3])
        self.assertEqual([row.status for row in items], ['backlog'] * 3)
        self.assertTrue(all(row.assignee_id is None for row in items))
        self.assertEqual(WorkItemDependency.objects.filter(work_item__project=target).count(), 1)
        entries = WorkItemChecklistEntry.objects.filter(work_item__project=target)
        self.assertEqual(entries.count(), 2)
        self.assertFalse(entries.filter(is_done=True).exists())
        self.assertEqual(target.next_item_number, 1)  # refresh required
        target.refresh_from_db()
        self.assertEqual(target.next_item_number, 4)

    def test_rebased_timeline_uses_target_start_date(self):
        template = self.save_template()
        target = self.empty_target()
        self.c_owner.post(
            f'/api/projects/{target.pk}/templates/{template.data["id"]}/apply/',
            {}, format='json',
        )
        item = target.work_items.get(title='Client feature')
        self.assertEqual(item.start_date, target.start_date + timedelta(days=30))
        self.assertEqual(item.due_date, target.start_date + timedelta(days=65))

    def test_template_does_not_copy_staff_or_time_or_invoice(self):
        template = self.save_template()
        target = self.empty_target()
        self.assertEqual(self.c_owner.post(
            f'/api/projects/{target.pk}/templates/{template.data["id"]}/apply/',
            {}, format='json',
        ).status_code, 201)
        self.assertEqual(target.time_entries.count(), 0)
        self.assertEqual(target.members.count(), 0)
        self.assertEqual(target.ticket_associations.count(), 0)
        self.assertEqual(target.documents.count(), 0)
        self.assertEqual(target.scope_versions.count(), 0)

    def test_apply_fails_for_nonempty_project_without_partial_changes(self):
        template = self.save_template()
        result = self.c_owner.post(
            f'/api/projects/{self.project.pk}/templates/{template.data["id"]}/apply/',
            {}, format='json',
        )
        self.assertEqual(result.status_code, 400)
        self.assertEqual(self.project.work_items.count(), 3)

    def test_apply_is_repeat_safe_even_with_network_retry(self):
        template = self.save_template()
        target = self.empty_target()
        url = f'/api/projects/{target.pk}/templates/{template.data["id"]}/apply/'
        self.assertEqual(self.c_owner.post(url, {}, format='json').status_code, 201)
        self.assertEqual(self.c_owner.post(url, {}, format='json').status_code, 400)
        self.assertEqual(target.work_items.count(), 3)

    def test_apply_rejects_active_project(self):
        template = self.save_template()
        target = self.empty_target(status='active')
        self.assertEqual(self.c_owner.post(
            f'/api/projects/{target.pk}/templates/{template.data["id"]}/apply/',
            {}, format='json',
        ).status_code, 400)

    def test_apply_rejects_cross_tenant_template(self):
        template = self.save_template()
        foreign_project = Project.objects.create(
            tenant=self.foreign_tenant, client_org=self.foreign_org,
            created_by=self.foreign, name='Other', key='FOREIGN',
        )
        result = self.c_foreign.post(
            f'/api/projects/{foreign_project.pk}/templates/{template.data["id"]}/apply/',
            {}, format='json',
        )
        self.assertEqual(result.status_code, 404)

    def test_template_create_project_is_atomic_and_reuses_tenant_permissions(self):
        template = self.save_template()
        result = self.c_owner.post(
            f'/api/projects/templates/{template.data["id"]}/create-project/',
            {
                'name': 'New Website', 'key': 'WEBSITE7',
                'client_org_id': str(self.other_org.pk), 'visibility': 'client',
                'start_date': (self.today+timedelta(days=20)).isoformat(),
            },
            format='json',
        )
        self.assertEqual(result.status_code, 201, result.data)
        project = Project.objects.get(pk=result.data['id'])
        self.assertEqual(project.work_items.count(), 3)
        self.assertEqual(project.client_org_id, self.other_org.pk)
        self.assertEqual(project.status, 'planned')
        self.assertEqual(project.members.filter(user=self.owner, role='manager').count(), 1)
        self.assertEqual(result.data['template_result']['work_items_created'], 3)

    def test_template_create_does_not_allow_impersonation_or_duplicate_project_key(self):
        template = self.save_template()
        path = f'/api/projects/templates/{template.data["id"]}/create-project/'
        payload = {'name': 'New Project', 'key': self.project.key,
                   'client_org_id': str(self.other_org.pk)}
        self.assertEqual(self.c_owner.post(path, payload, format='json').status_code, 400)
        self.assertEqual(Project.objects.count(), 1)

    def test_template_source_cannot_change_snapshot(self):
        template = self.save_template()
        row = ProjectTemplate.objects.get(pk=template.data['id'])
        row.snapshot['work_items'] = []
        with self.assertRaises(DjangoValidationError):
            row.save()

    def test_template_delete_does_not_change_projects(self):
        template = self.save_template()
        result = self.c_manager.delete(f'/api/projects/templates/{template.data["id"]}/')
        self.assertEqual(result.status_code, 204)
        self.assertEqual(self.project.work_items.count(), 3)

    def test_template_invalid_cycle_is_rejected_before_applying(self):
        template = self.save_template()
        row = ProjectTemplate.objects.get(pk=template.data['id'])
        snapshot = row.snapshot
        snapshot['dependencies'].append({'work_index': 0, 'prerequisite_index': 1})
        snapshot['dependencies'].append({'work_index': 1, 'prerequisite_index': 0})
        ProjectTemplate.objects.filter(pk=row.pk).update(snapshot=snapshot)
        target = self.empty_target()
        result = self.c_owner.post(
            f'/api/projects/{target.pk}/templates/{row.pk}/apply/', {},
            format='json',
        )
        self.assertEqual(result.status_code, 400)
        self.assertEqual(target.work_items.count(), 0)

    def test_client_cannot_use_template_creation(self):
        template = self.save_template()
        result = self.c_client.post(
            f'/api/projects/templates/{template.data["id"]}/create-project/',
            {'client_org_id': str(self.org.pk), 'name': 'Client Project', 'key': 'CLI7'},
            format='json',
        )
        self.assertEqual(result.status_code, 403)

    def test_manager_can_edit_work_schedule_and_report_updates(self):
        path = f'/api/work-items/{self.public.pk}/'
        result = self.c_owner.patch(path, {
            'start_date': (self.today+timedelta(days=1)).isoformat(),
            'due_date': (self.today+timedelta(days=9)).isoformat(),
            'estimated_minutes': 240,
        }, format='json')
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(result.data['estimated_minutes'], 240)
        self.public.refresh_from_db()
        self.assertEqual(self.public.start_date, self.today+timedelta(days=1))
        self.assertEqual(self.public.status, 'backlog')
        report = self.c_owner.get(self.reports)
        self.assertEqual(report.data['effort']['estimated_minutes'], 540)

    def test_invalid_work_date_patch_is_rejected(self):
        original_date = self.public.start_date
        result = self.c_owner.patch(f'/api/work-items/{self.public.pk}/', {
            'start_date': (self.today+timedelta(days=100)).isoformat(),
        }, format='json')
        self.assertEqual(result.status_code, 400)
        self.public.refresh_from_db()
        self.assertEqual(self.public.start_date, original_date)

    def test_milestone_start_date_updates_without_changing_status(self):
        result = self.c_manager.patch(
            f'/api/projects/{self.project.pk}/milestones/{self.public_ms.pk}/',
            {'start_date': (self.today-timedelta(days=10)).isoformat()},
            format='json',
        )
        self.assertEqual(result.status_code, 200, result.data)
        self.public_ms.refresh_from_db()
        self.assertEqual(self.public_ms.start_date, self.today-timedelta(days=10))
        self.assertEqual(self.public_ms.status, 'planned')

    def test_template_copies_description_and_project_due_offset(self):
        self.project.description = 'Original reusable project instructions'
        self.project.save()
        template = self.save_template()
        target = self.empty_target()
        self.assertIsNone(target.due_date)
        self.assertEqual(target.description, '')
        result = self.c_owner.post(
            f'/api/projects/{target.pk}/templates/{template.data["id"]}/apply/',
            {}, format='json',
        )
        self.assertEqual(result.status_code, 201, result.data)
        target.refresh_from_db()
        self.assertEqual(target.description, self.project.description)
        self.assertEqual(target.due_date, target.start_date+timedelta(days=90))

    def test_template_rejects_project_with_pending_scope_history(self):
        from .models import ProjectScopeChangeRequest
        template = self.save_template()
        target = self.empty_target()
        ProjectScopeChangeRequest.objects.create(
            project=target, title='Existing scope change', requested_by=self.owner,
            requested_changes='Do not overwrite pending scope', reason='Already discussed',
        )
        result = self.c_owner.post(
            f'/api/projects/{target.pk}/templates/{template.data["id"]}/apply/',
            {}, format='json',
        )
        self.assertEqual(result.status_code, 400)
        self.assertFalse(target.work_items.exists())

    def test_client_cannot_see_private_milestone_after_visibility_change(self):
        self.assertEqual(len(self.c_client.get(self.timeline).data['milestones']), 1)
        self.public_ms.visibility = 'internal'
        self.public_ms.save()
        client_result = self.c_client.get(self.timeline)
        self.assertEqual(client_result.status_code, 200)
        self.assertEqual(client_result.data['milestones'], [])
        self.assertTrue(all(row['milestone_id'] is None for row in client_result.data['work_items']))

    def test_template_preview_is_manager_only(self):
        template = self.save_template()
        url = f'/api/projects/templates/{template.data["id"]}/'
        manager = self.c_manager.get(url)
        self.assertEqual(manager.status_code, 200)
        self.assertEqual(manager.data['snapshot']['work_items'][1]['title'], 'Client feature')
        self.assertEqual(self.c_client.get(url).status_code, 403)
        self.assertEqual(self.c_agent.get(url).status_code, 403)
        self.assertEqual(self.c_foreign.get(url).status_code, 404)

    def test_template_apply_rejects_inactive_target_organization(self):
        template = self.save_template()
        target = self.empty_target()
        self.other_org.is_active = False
        self.other_org.save(update_fields=['is_active'])
        response = self.c_owner.post(
            f'/api/projects/{target.pk}/templates/{template.data["id"]}/apply/',
            {}, format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(target.work_items.exists())

"""Live Project reports and read only timeline with strict client visibility."""
from collections import Counter, defaultdict
from datetime import date

from django.db.models import Count
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.permissions import CLIENT_ROLES, IsTenantUser
from .models import Project, ProjectMilestone, ProjectTimeEntry, WorkItem, WorkItemDependency
from .permissions import can_manage_project, visible_projects


ACTIVE = ('in_progress', 'in_review')
COMPLETE = ('done',)
INCOMPLETE = ('backlog', 'todo', 'in_progress', 'in_review')


def _visible_items(project, user):
    rows = project.work_items.select_related('assignee', 'milestone')
    if user.role in CLIENT_ROLES:
        rows = rows.filter(visibility='client')
    return list(rows.order_by('position', 'created_at', 'id'))


def _visible_milestones(project, user):
    rows = project.milestones.all()
    if user.role in CLIENT_ROLES:
        rows = rows.filter(visibility='client')
    return list(rows.order_by('position', 'created_at', 'id'))


def _report(project, user, *, include_team=True):
    today = timezone.localdate()
    items = _visible_items(project, user)
    milestones = _visible_milestones(project, user)
    status_counts = Counter(item.status for item in items)
    priority_counts = Counter(item.priority for item in items)
    active_items = [row for row in items if row.status not in ('done', 'cancelled')]
    overdue_items = [row for row in active_items if row.due_date and row.due_date < today]
    overdue_milestones = [row for row in milestones if row.status != 'completed'
                          and row.due_date and row.due_date < today]
    counted = len(items) - status_counts['cancelled']
    result = {
        'project_id': str(project.pk), 'project_key': project.key,
        'project_name': project.name, 'project_status': project.status,
        'as_of': today.isoformat(), 'is_client_view': user.role in CLIENT_ROLES,
        'start_date': project.start_date, 'due_date': project.due_date,
        'work_items': {
            'total': len(items), 'active': len(active_items),
            'done': status_counts['done'], 'cancelled': status_counts['cancelled'],
            'overdue': len(overdue_items),
            'completion_percent': round(100 * status_counts['done'] / counted, 1)
            if counted else 0,
        },
        'milestones': {
            'total': len(milestones),
            'completed': sum(x.status == 'completed' for x in milestones),
            'overdue': len(overdue_milestones),
        },
        'status_distribution': [
            {'status': status, 'count': status_counts[status]}
            for status, _ in WorkItem.STATUSES
        ],
        'priority_distribution': [
            {'priority': priority, 'count': priority_counts[priority]}
            for priority, _ in WorkItem.PRIORITIES
        ],
    }
    # Project history may include staff only tasks. Never derive client
    # metrics or timeline from hidden records, memberships, or time logs.
    if user.role in CLIENT_ROLES:
        return result

    if not include_team:
        return result
    manager = can_manage_project(user, project)
    hours = ProjectTimeEntry.objects.filter(project=project)
    if not manager:
        hours = hours.filter(staff=user)
    entries = list(hours.values('staff_id', 'staff_name', 'minutes', 'billable'))
    own_minutes = sum(int(x['minutes']) for x in entries)
    result['time'] = {
        'tracked_minutes': own_minutes,
        'billable_minutes': sum(int(x['minutes']) for x in entries if x['billable']),
        'non_billable_minutes': sum(int(x['minutes']) for x in entries if not x['billable']),
        'scope': 'project' if manager else 'own',
    }
    if manager:
        team = defaultdict(lambda: {
            'assigned': 0, 'completed': 0, 'overdue': 0,
            'estimated_minutes': 0, 'tracked_minutes': 0,
        })
        labels = {}
        for item in items:
            if item.assignee_id:
                key = str(item.assignee_id)
                labels[key] = item.assignee.full_name or item.assignee.email
                team[key]['assigned'] += 1
                team[key]['completed'] += int(item.status == 'done')
                team[key]['overdue'] += int(item in overdue_items)
                team[key]['estimated_minutes'] += int(item.estimated_minutes)
        for entry in entries:
            if entry['staff_id']:
                key = str(entry['staff_id'])
                labels.setdefault(key, entry['staff_name'])
                team[key]['tracked_minutes'] += int(entry['minutes'])
        result['team'] = [
            {'staff_id': key, 'name': labels[key], **values}
            for key, values in sorted(team.items(), key=lambda pair: labels[pair[0]].casefold())
        ]
        result['effort'] = {
            'estimated_minutes': sum(item.estimated_minutes for item in items),
            'tracked_minutes': own_minutes,
            'variance_minutes': own_minutes - sum(item.estimated_minutes for item in items),
        }
    return result


class ProjectReportView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request, pk):
        project = get_object_or_404(visible_projects(request), pk=pk)
        return Response(_report(project, request.user))


class ProjectTimelineView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request, pk):
        project = get_object_or_404(visible_projects(request), pk=pk)
        user = request.user
        client = user.role in CLIENT_ROLES
        milestones = _visible_milestones(project, user)
        items = _visible_items(project, user)
        visible_item_ids = {item.pk for item in items}
        visible_milestone_ids = {row.pk for row in milestones}
        dependencies = defaultdict(list)
        for work_id, prerequisite_id in WorkItemDependency.objects.filter(
            work_item_id__in=visible_item_ids,
            prerequisite_id__in=visible_item_ids,
        ).values_list('work_item_id', 'prerequisite_id'):
            dependencies[work_id].append(str(prerequisite_id))
        today = timezone.localdate()
        milestones_json = []
        for row in milestones:
            related = [item for item in items if item.milestone_id == row.pk]
            eligible = [x for x in related if x.status != 'cancelled']
            done = sum(x.status == 'done' for x in eligible)
            milestones_json.append({
                'id': str(row.pk), 'name': row.name, 'status': row.status,
                'start_date': row.start_date, 'due_date': row.due_date,
                'visibility': row.visibility,
                'progress_percent': round(100 * done / len(eligible), 1) if eligible else 0,
                'overdue': bool(row.due_date and row.due_date < today
                                and row.status != 'completed'),
            })
        items_json = []
        for row in items:
            items_json.append({
                'id': str(row.pk), 'ref': row.ref, 'title': row.title,
                'kind': row.kind, 'status': row.status, 'priority': row.priority,
                'visibility': row.visibility, 'start_date': row.start_date,
                'due_date': row.due_date,
                'milestone_id': str(row.milestone_id)
                if row.milestone_id in visible_milestone_ids else None,
                'dependencies': sorted(dependencies[row.pk]),
                'overdue': bool(row.due_date and row.due_date < today
                                and row.status not in ('done', 'cancelled')),
                'estimated_minutes': None if client else row.estimated_minutes,
            })
        return Response({
            'project_id': str(project.pk), 'start_date': project.start_date,
            'due_date': project.due_date, 'as_of': today.isoformat(),
            'milestones': milestones_json, 'work_items': items_json,
        })


class ProjectPortfolioReportView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request):
        projects = visible_projects(request).order_by('name', 'id')
        try:
            page = int(request.query_params.get('page', 1))
        except (ValueError, TypeError):
            raise ValidationError({'page': 'Invalid page number.'})
        if page < 1 or page > 10000:
            raise ValidationError({'page': 'Page must be between 1 and 10000.'})
        count = projects.count()
        selected = list(projects[(page - 1) * 25:page * 25])
        reports = [_report(project, request.user, include_team=False)
                   for project in selected]
        return Response({
            'count': count, 'page': page, 'page_size': 25,
            'has_more': page * 25 < count,
            'results': reports,
        })

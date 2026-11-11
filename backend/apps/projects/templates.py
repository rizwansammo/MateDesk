"""Tenant reusable Project Templates with safe structure snapshots and atomic instantiation."""
import json
from datetime import date, timedelta

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.tenants.models import ClientOrganization
from apps.users.permissions import IsTenantUser

from .activity import record_activity
from .models import (
    Project, ProjectMember, ProjectMilestone, ProjectTemplate, WorkItem,
    WorkItemChecklistEntry, WorkItemDependency,
)
from .permissions import tenant_for_request, visible_projects
from .requests import can_create_project
from .serializers import ProjectCreateSerializer, ProjectReadSerializer
from .delivery import ensure_delivery_unlocked

MAX_MILESTONES = 100
MAX_ITEMS = 300
MAX_CHECKLIST = 1200
MAX_EDGES = 1200
MAX_SNAPSHOT_SIZE = 220000
MAX_OFFSET = 3650


def _manager(request):
    if request.user.role not in ('msp_owner', 'msp_manager'):
        raise PermissionDenied('Tenant Project Template management requires an MSP Owner or Manager.')
    return tenant_for_request(request)


def _template_response(row):
    data = row.snapshot
    return {
        'id': str(row.pk), 'name': row.name, 'description': row.description,
        'milestone_count': len(data['milestones']),
        'work_item_count': len(data['work_items']),
        'source_project_id': str(row.source_project_id) if row.source_project_id else None,
        'version': row.version, 'created_at': row.created_at,
    }


def _offset(date_value, anchor):
    if date_value is None:
        return None
    value = (date_value - anchor).days
    if abs(value) > MAX_OFFSET:
        raise ValidationError({'dates': 'Template schedule cannot exceed ten years.'})
    return value


def _shift(anchor, days):
    if days is None:
        return None
    try:
        return anchor + timedelta(days=days)
    except (ValueError, OverflowError):
        raise ValidationError({'dates': 'Template date is outside supported range.'}) from None


def _capture(project):
    milestones = list(project.milestones.all().order_by('position', 'created_at', 'id'))
    items = list(project.work_items.all().prefetch_related(
        'checklist_entries',
    ).order_by('position', 'created_at', 'id'))
    if len(milestones) > MAX_MILESTONES or len(items) > MAX_ITEMS:
        raise ValidationError({'detail': 'Template exceeds the milestone or Work Item limit.'})
    dates = [x for item in items for x in (item.start_date, item.due_date) if x]
    dates += [x for row in milestones for x in (row.start_date, row.due_date) if x]
    anchor = project.start_date or (min(dates) if dates else timezone.localdate())
    m_idx = {m.pk: i for i, m in enumerate(milestones)}
    w_idx = {w.pk: i for i, w in enumerate(items)}
    captured_m = [{
        'name': row.name, 'description': row.description,
        'visibility': row.visibility, 'position': row.position,
        'start_offset': _offset(row.start_date, anchor),
        'due_offset': _offset(row.due_date, anchor),
    } for row in milestones]
    captured_w = []
    total_checklist = 0
    for row in items:
        checklists = [{
            'title': check.title, 'visibility': check.visibility,
            'position': check.position,
        } for check in row.checklist_entries.all()]
        total_checklist += len(checklists)
        captured_w.append({
            'title': row.title, 'description': row.description,
            'kind': row.kind, 'priority': row.priority,
            'visibility': row.visibility, 'position': row.position,
            'estimated_minutes': row.estimated_minutes,
            'milestone_index': m_idx.get(row.milestone_id),
            'start_offset': _offset(row.start_date, anchor),
            'due_offset': _offset(row.due_date, anchor),
            'checklists': checklists,
        })
    if total_checklist > MAX_CHECKLIST:
        raise ValidationError({'detail': 'Template checklist limit exceeded.'})
    edges = [
        {'work_index': w_idx[work], 'prerequisite_index': w_idx[prereq]}
        for work, prereq in WorkItemDependency.objects.filter(
            work_item_id__in=w_idx,
        ).values_list('work_item_id', 'prerequisite_id')
        if prereq in w_idx
    ]
    if len(edges) > MAX_EDGES:
        raise ValidationError({'detail': 'Template dependency limit exceeded.'})
    snapshot = {
        'version': 1,
        'project_description': project.description[:5000],
        'project_due_offset': _offset(project.due_date, anchor),
        'milestones': captured_m,
        'work_items': captured_w,
        'dependencies': edges,
    }
    _validate_snapshot(snapshot)
    return snapshot


def _validate_snapshot(data):
    if not isinstance(data, dict) or data.get('version') != 1:
        raise ValidationError({'snapshot': 'Unsupported Template version.'})
    milestones, items, edges = (
        data.get('milestones'), data.get('work_items'), data.get('dependencies'),
    )
    if not all(isinstance(x, list) for x in (milestones, items, edges)):
        raise ValidationError({'snapshot': 'Invalid Template structure.'})
    if (len(milestones) > MAX_MILESTONES or len(items) > MAX_ITEMS
            or len(edges) > MAX_EDGES):
        raise ValidationError({'snapshot': 'Template exceeds size limits.'})
    if len(json.dumps(data, ensure_ascii=False)) > MAX_SNAPSHOT_SIZE:
        raise ValidationError({'snapshot': 'Template payload exceeds limit.'})
    if not isinstance(data.get('project_description'), str):
        raise ValidationError({'snapshot': 'Invalid description.'})

    def check_offset(value):
        if value is not None and (type(value) is not int or abs(value) > MAX_OFFSET):
            raise ValidationError({'snapshot': 'Invalid schedule offset.'})

    def check_text(item, field, limit, *, blank=False):
        value = item.get(field)
        if not isinstance(value, str) or len(value) > limit or (not blank and not value.strip()):
            raise ValidationError({'snapshot': 'Invalid template text.'})

    check_offset(data.get('project_due_offset'))
    for row in milestones:
        if not isinstance(row, dict):
            raise ValidationError({'snapshot': 'Invalid Milestone.'})
        check_text(row, 'name', 200)
        check_text(row, 'description', 100000, blank=True)
        if row.get('visibility') not in ('internal', 'client'):
            raise ValidationError({'snapshot': 'Invalid Milestone visibility.'})
        if type(row.get('position')) is not int or row['position'] < 0:
            raise ValidationError({'snapshot': 'Invalid Milestone position.'})
        for field in ('start_offset', 'due_offset'):
            check_offset(row.get(field))
        if (row.get('start_offset') is not None
                and row.get('due_offset') is not None
                and row['start_offset'] > row['due_offset']):
            raise ValidationError({'snapshot': 'Milestone schedule is reversed.'})
    all_checklists = 0
    for row in items:
        if not isinstance(row, dict):
            raise ValidationError({'snapshot': 'Invalid Work Item.'})
        check_text(row, 'title', 300)
        check_text(row, 'description', 100000, blank=True)
        if (row.get('kind') not in dict(WorkItem.KINDS)
                or row.get('priority') not in dict(WorkItem.PRIORITIES)
                or row.get('visibility') not in ('internal', 'client')):
            raise ValidationError({'snapshot': 'Invalid Work Item classification.'})
        idx = row.get('milestone_index')
        if idx is not None and (type(idx) is not int or not 0 <= idx < len(milestones)):
            raise ValidationError({'snapshot': 'Invalid Work Item milestone reference.'})
        if (type(row.get('position')) is not int or row['position'] < 0
                or type(row.get('estimated_minutes')) is not int
                or not 0 <= row['estimated_minutes'] <= 1000000):
            raise ValidationError({'snapshot': 'Invalid effort estimate or position.'})
        for field in ('start_offset', 'due_offset'):
            check_offset(row.get(field))
        if (row.get('start_offset') is not None
                and row.get('due_offset') is not None
                and row['start_offset'] > row['due_offset']):
            raise ValidationError({'snapshot': 'Work Item schedule is reversed.'})
        checklists = row.get('checklists')
        if not isinstance(checklists, list):
            raise ValidationError({'snapshot': 'Invalid checklist.'})
        all_checklists += len(checklists)
        for entry in checklists:
            if not isinstance(entry, dict):
                raise ValidationError({'snapshot': 'Invalid checklist entry.'})
            check_text(entry, 'title', 255)
            if (entry.get('visibility') not in ('internal', 'client')
                    or (entry['visibility'] == 'client' and row['visibility'] != 'client')
                    or type(entry.get('position')) is not int or entry['position'] < 0):
                raise ValidationError({'snapshot': 'Invalid checklist visibility or position.'})
    if all_checklists > MAX_CHECKLIST:
        raise ValidationError({'snapshot': 'Too many checklist entries.'})
    seen = set()
    for edge in edges:
        if not isinstance(edge, dict):
            raise ValidationError({'snapshot': 'Invalid prerequisite.'})
        a, b = edge.get('work_index'), edge.get('prerequisite_index')
        if any(type(value) is not int or value < 0 or value >= len(items)
               for value in (a, b)) or a == b or (a, b) in seen:
            raise ValidationError({'snapshot': 'Invalid dependency reference.'})
        seen.add((a, b))
    # Defensive cycle detection even for manually modified database snapshots.
    nodes = {i: set() for i in range(len(items))}
    for a, b in seen:
        nodes[a].add(b)
    def visit(node, visiting, visited):
        if node in visiting:
            raise ValidationError({'snapshot': 'Circular template dependencies are not allowed.'})
        if node in visited:
            return
        visiting.add(node)
        for next_node in nodes[node]:
            visit(next_node, visiting, visited)
        visiting.remove(node)
        visited.add(node)
    visited = set()
    for i in nodes:
        visit(i, set(), visited)


def _save(instance):
    try:
        instance.save()
    except DjangoValidationError as exc:
        raise ValidationError(getattr(exc, 'message_dict', None) or exc.messages) from exc


def _apply(project, template, user):
    snapshot = template.snapshot
    _validate_snapshot(snapshot)
    if project.tenant_id != template.tenant_id:
        raise PermissionDenied('Project and Template must belong to one tenant.')
    if not project.client_org.is_active:
        raise ValidationError({'project': 'The Client Organization must be active.'})
    if project.status != 'planned':
        raise ValidationError({'project': 'Only an empty planned Project can apply a Template.'})
    ensure_delivery_unlocked(project)
    if (project.milestones.exists() or project.work_items.exists()
            or project.ticket_associations.exists() or project.time_entries.exists()
            or project.documents.exists() or project.scope_versions.exists()
            or project.scope_proposals.exists() or project.scope_change_requests.exists()
            or project.delivery_reviews.exists()):
        raise ValidationError({
            'project': 'Template application requires an empty Project without delivery records.',
        })
    anchor = project.start_date or timezone.localdate()
    if not project.description:
        project.description = snapshot['project_description']
    if project.due_date is None:
        project.due_date = _shift(anchor, snapshot['project_due_offset'])
    new_milestones = []
    for info in snapshot['milestones']:
        milestone = ProjectMilestone(
            project=project, name=info['name'], description=info['description'],
            visibility=info['visibility'], position=info['position'],
            start_date=_shift(anchor, info['start_offset']),
            due_date=_shift(anchor, info['due_offset']),
            status='planned',
        )
        _save(milestone)
        new_milestones.append(milestone)
    new_items = []
    for index, info in enumerate(snapshot['work_items']):
        mid = info['milestone_index']
        item = WorkItem(
            project=project, number=project.next_item_number + index,
            milestone=new_milestones[mid] if mid is not None else None,
            created_by=user, assignee=None, title=info['title'],
            description=info['description'], kind=info['kind'],
            priority=info['priority'], visibility=info['visibility'],
            position=info['position'], status='backlog',
            start_date=_shift(anchor, info['start_offset']),
            due_date=_shift(anchor, info['due_offset']),
            estimated_minutes=info['estimated_minutes'],
        )
        _save(item)
        new_items.append(item)
        for check in info['checklists']:
            _save(WorkItemChecklistEntry(
                work_item=item, title=check['title'],
                visibility=check['visibility'], position=check['position'],
                is_done=False, created_by=user,
            ))
    for edge in snapshot['dependencies']:
        _save(WorkItemDependency(
            work_item=new_items[edge['work_index']],
            prerequisite=new_items[edge['prerequisite_index']],
            created_by=user,
        ))
    project.next_item_number += len(new_items)
    _save(project)
    record_activity(
        project, actor=user, visibility='internal', kind='project_updated',
        summary='Project Template applied',
    )
    return {'project_id': str(project.pk),
            'milestones_created': len(new_milestones), 'work_items_created': len(new_items)}


class CaptureInput(serializers.Serializer):
    name = serializers.CharField(max_length=160, trim_whitespace=True)
    description = serializers.CharField(max_length=2000, required=False, allow_blank=True)


class CreateFromTemplateInput(ProjectCreateSerializer):
    # Regular Project fields remain the source of truth for identity and client.
    pass


class ProjectTemplatesView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request):
        tenant = _manager(request)
        rows = ProjectTemplate.objects.filter(tenant=tenant).select_related('source_project')[:200]
        return Response([_template_response(row) for row in rows])


class ProjectTemplateDetailView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request, template_id):
        tenant = _manager(request)
        template = get_object_or_404(ProjectTemplate, tenant=tenant, pk=template_id)
        return Response({**_template_response(template), 'snapshot': template.snapshot})

    def delete(self, request, template_id):
        tenant = _manager(request)
        template = get_object_or_404(ProjectTemplate, tenant=tenant, pk=template_id)
        template.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CaptureProjectTemplateView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def post(self, request, pk):
        tenant = _manager(request)
        project = get_object_or_404(visible_projects(request), pk=pk)
        data = CaptureInput(data=request.data)
        data.is_valid(raise_exception=True)
        with transaction.atomic():
            Project.objects.select_for_update().get(pk=project.pk)
            if ProjectTemplate.objects.filter(tenant=tenant, name=data.validated_data['name']).exists():
                raise ValidationError({'name': 'A Template with this name already exists.'})
            template = ProjectTemplate(
                tenant=tenant, source_project=project, created_by=request.user,
                name=data.validated_data['name'],
                description=data.validated_data.get('description', ''),
                snapshot=_capture(project),
            )
            try:
                _save(template)
            except IntegrityError as exc:
                raise ValidationError({'name': 'Template name already exists.'}) from exc
        return Response(_template_response(template), status=status.HTTP_201_CREATED)


class ApplyProjectTemplateView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def post(self, request, pk, template_id):
        tenant = _manager(request)
        get_object_or_404(visible_projects(request), pk=pk)
        template = get_object_or_404(ProjectTemplate, pk=template_id, tenant=tenant)
        with transaction.atomic():
            project = Project.objects.select_for_update().get(pk=pk, tenant=tenant)
            result = _apply(project, template, request.user)
        return Response(result, status=status.HTTP_201_CREATED)


class CreateProjectFromTemplateView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def post(self, request, template_id):
        tenant = _manager(request)
        if not can_create_project(request.user):
            raise PermissionDenied('Project creation permission required.')
        template = get_object_or_404(ProjectTemplate, pk=template_id, tenant=tenant)
        data = CreateFromTemplateInput(data=request.data)
        data.is_valid(raise_exception=True)
        attrs = data.validated_data.copy()
        if attrs.get('status') not in (None, 'planned'):
            raise ValidationError({'status': 'New projects created from Templates begin in Planned status.'})
        org = get_object_or_404(ClientOrganization,
            pk=attrs.pop('client_org_id'), tenant=tenant, is_active=True)
        attrs['status'] = 'planned'
        attrs['visibility'] = attrs.get('visibility', 'internal')
        # An explicit start date serves as the relative timeline anchor.
        attrs['start_date'] = attrs.get('start_date') or timezone.localdate()
        with transaction.atomic():
            project = Project(tenant=tenant, client_org=org, created_by=request.user,
                              **attrs)
            _save(project)
            _save(ProjectMember(project=project, user=request.user, role='manager'))
            record_activity(project, kind='project_created', actor=request.user,
                            summary='Project created from Template',
                            visibility='client' if project.visibility == 'client' else 'internal')
            result = _apply(project, template, request.user)
        return Response({
            **ProjectReadSerializer(project, context={'request': request}).data,
            'template_result': result,
        }, status=status.HTTP_201_CREATED)

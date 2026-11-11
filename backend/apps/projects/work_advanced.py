"""Advanced Work Items: acyclic prerequisites, derived blockers, and checklists.

All writes lock their Project before touching Work Items, preserving manager
hold/delivery decisions and avoiding concurrent dependency cycles.
"""
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.permissions import CLIENT_ROLES, IsTenantUser

from .activity import record_activity
from .delivery import ensure_delivery_unlocked
from .models import Project, WorkItem, WorkItemChecklistEntry, WorkItemDependency
from .permissions import can_edit_work, can_manage_project
from .views import _edit, _save_validated, _work_item


class DependencyInputSerializer(serializers.Serializer):
    prerequisite_id = serializers.UUIDField()


class ChecklistInputSerializer(serializers.Serializer):
    title = serializers.CharField(min_length=1, max_length=255, required=True)
    visibility = serializers.ChoiceField(
        choices=['internal', 'client'], required=False, default='internal',
    )
    position = serializers.IntegerField(min_value=0, max_value=10000, required=False, default=0)


class ChecklistUpdateSerializer(serializers.Serializer):
    title = serializers.CharField(min_length=1, max_length=255, required=False)
    visibility = serializers.ChoiceField(choices=['internal', 'client'], required=False)
    position = serializers.IntegerField(min_value=0, max_value=10000, required=False)
    is_done = serializers.BooleanField(required=False)


class ChecklistReadSerializer(serializers.ModelSerializer):
    completed_by_name = serializers.CharField(
        source='completed_by.full_name', read_only=True, allow_null=True,
    )

    class Meta:
        model = WorkItemChecklistEntry
        fields = [
            'id', 'title', 'is_done', 'position', 'visibility',
            'created_at', 'updated_at', 'completed_at', 'completed_by_name',
        ]


def _lock_item(request, pk):
    """The caller must be inside transaction.atomic()."""
    item = _work_item(request, pk)
    _edit(request.user, item.project)
    project = Project.objects.select_for_update().get(pk=item.project_id)
    ensure_delivery_unlocked(project)
    locked = WorkItem.objects.select_for_update().get(pk=item.pk, project=project)
    return project, locked


def _touch(item):
    # Unlike WorkItem.save(), a timestamp-only update must not trigger any
    # status transition. Delivery review locks are checked by the caller.
    WorkItem.objects.filter(pk=item.pk).update(updated_at=timezone.now())


def _log(project, item, request, message):
    record_activity(
        project, kind='work_item_updated', actor=request.user,
        summary=f'Work Item {message}: {item.ref}',
        visibility=item.visibility, work_item=item,
    )


class WorkItemDependenciesView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request, pk):
        item = _work_item(request, pk)
        rows = item.dependency_edges.select_related('prerequisite__project').order_by('created_at', 'id')
        is_client = request.user.role in CLIENT_ROLES
        result = []
        for link in rows:
            prerequisite = link.prerequisite
            # Do not expose identifiers, titles or status of staff-only work.
            hidden = is_client and prerequisite.visibility != 'client'
            result.append({
                'id': None if hidden else str(link.id),
                'prerequisite_id': None if hidden else str(prerequisite.pk),
                'ref': None if hidden else prerequisite.ref,
                'title': 'Internal Project Work' if hidden else prerequisite.title,
                'status': None if hidden else prerequisite.status,
                'completed': None if hidden else prerequisite.status == 'done',
                'internal': hidden,
            })
        return Response(result)

    def post(self, request, pk):
        data = DependencyInputSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        with transaction.atomic():
            project, item = _lock_item(request, pk)
            prerequisite = get_object_or_404(
                WorkItem.objects.filter(project=project),
                pk=data.validated_data['prerequisite_id'],
            )
            if item.dependency_edges.count() >= 60:
                raise ValidationError({'detail': 'Maximum 60 dependencies per Work Item.'})
            if item.dependency_edges.filter(prerequisite=prerequisite).exists():
                raise ValidationError({'prerequisite_id': 'This dependency is already recorded.'})
            link = _save_validated(WorkItemDependency(
                work_item=item, prerequisite=prerequisite,
                created_by=request.user,
            ))
            _touch(item)
            _log(project, item, request, 'dependency added')
        return Response({
            'id': str(link.id),
            'prerequisite_id': str(prerequisite.pk),
            'ref': prerequisite.ref,
            'title': prerequisite.title,
            'status': prerequisite.status,
            'completed': prerequisite.status == 'done',
            'internal': False,
        }, status=status.HTTP_201_CREATED)


class WorkItemDependencyDetailView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def delete(self, request, pk, dependency_id):
        with transaction.atomic():
            project, item = _lock_item(request, pk)
            if item.status in ('done', 'cancelled'):
                raise ValidationError({'detail': 'Reopen this Work Item before editing dependencies.'})
            link = get_object_or_404(WorkItemDependency.objects.filter(work_item=item), pk=dependency_id)
            link.delete()
            _touch(item)
            _log(project, item, request, 'dependency removed')
        return Response(status=status.HTTP_204_NO_CONTENT)


class WorkItemChecklistView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request, pk):
        item = _work_item(request, pk)
        queryset = item.checklist_entries.select_related('completed_by')
        if request.user.role in CLIENT_ROLES:
            queryset = queryset.filter(visibility='client')
        return Response(ChecklistReadSerializer(queryset, many=True).data)

    def post(self, request, pk):
        data = ChecklistInputSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        with transaction.atomic():
            project, item = _lock_item(request, pk)
            if item.checklist_entries.count() >= 100:
                raise ValidationError({'detail': 'Maximum 100 checklist items per Work Item.'})
            if data.validated_data['visibility'] == 'client' and not can_manage_project(
                request.user, project,
            ):
                raise PermissionDenied('Only Project Managers can publish checklist items to the Client.')
            entry = _save_validated(WorkItemChecklistEntry(
                work_item=item, created_by=request.user, **data.validated_data,
            ))
            _touch(item)
            _log(project, item, request, 'checklist entry added')
        return Response(ChecklistReadSerializer(entry).data, status=status.HTTP_201_CREATED)


class WorkItemChecklistDetailView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def patch(self, request, pk, entry_id):
        data = ChecklistUpdateSerializer(data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        if not data.validated_data:
            raise ValidationError({'detail': 'No checklist changes supplied.'})
        with transaction.atomic():
            project, item = _lock_item(request, pk)
            entry = get_object_or_404(
                WorkItemChecklistEntry.objects.select_for_update().filter(work_item=item),
                pk=entry_id,
            )
            if 'visibility' in data.validated_data and not can_manage_project(request.user, project):
                raise PermissionDenied('Only Project Managers can change checklist visibility.')
            for key, value in data.validated_data.items():
                setattr(entry, key, value)
            if 'is_done' in data.validated_data:
                entry.completed_by = request.user if entry.is_done else None
                entry.completed_at = timezone.now() if entry.is_done else None
            _save_validated(entry)
            _touch(item)
            _log(project, item, request, 'checklist entry updated')
        return Response(ChecklistReadSerializer(entry).data)

    def delete(self, request, pk, entry_id):
        with transaction.atomic():
            project, item = _lock_item(request, pk)
            if item.status in ('done', 'cancelled'):
                raise ValidationError({'detail': 'Reopen this Work Item before removing checklist entries.'})
            entry = get_object_or_404(WorkItemChecklistEntry.objects.filter(work_item=item), pk=entry_id)
            entry.delete()
            _touch(item)
            _log(project, item, request, 'checklist entry removed')
        return Response(status=status.HTTP_204_NO_CONTENT)

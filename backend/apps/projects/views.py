"""Tenant scoped REST endpoints for project planning and work delivery."""
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.tenants.models import ClientOrganization
from apps.users.models import User
from apps.users.permissions import CLIENT_ROLES, IsTenantUser

from .models import Project, ProjectMember, ProjectMilestone, WorkItem, WorkItemComment
from .activity import record_activity
from .permissions import can_edit_work, can_manage_project, tenant_for_request, visible_projects
from .serializers import (
    ProjectCreateSerializer, ProjectUpdateSerializer, ProjectReadSerializer,
    ProjectMemberReadSerializer, ProjectMemberWriteSerializer,
    ProjectMilestoneReadSerializer, ProjectMilestoneWriteSerializer,
    WorkItemReadSerializer, WorkItemWriteSerializer,
    WorkItemCommentReadSerializer, WorkItemCommentWriteSerializer,
)


def _save_validated(instance):
    try:
        instance.save()
    except DjangoValidationError as exc:
        raise ValidationError(getattr(exc, 'message_dict', None) or exc.messages) from exc
    except IntegrityError as exc:
        raise ValidationError({'detail': 'A conflicting project record already exists.'}) from exc
    return instance


def _project(request, pk):
    return get_object_or_404(visible_projects(request), pk=pk)


def _manage(user, project):
    if not can_manage_project(user, project):
        raise PermissionDenied('Project management permission required.')


def _edit(user, project):
    if not can_edit_work(user, project):
        raise PermissionDenied('Project contributor permission required.')


def _work_item(request, pk):
    item = get_object_or_404(
        WorkItem.objects.select_related('project', 'milestone', 'assignee', 'created_by'),
        pk=pk, project__in=visible_projects(request),
    )
    if request.user.role in CLIENT_ROLES and item.visibility != 'client':
        raise PermissionDenied('This work item is not visible to clients.')
    return item


def _milestone(project, value):
    if value is None:
        return None
    return get_object_or_404(ProjectMilestone.objects.filter(project=project), id=value)


def _assignee(project, value):
    if value is None:
        return None
    return get_object_or_404(
        User.objects.filter(
            id=value, tenant=project.tenant, is_active=True,
            project_memberships__project=project,
            project_memberships__role__in=['manager', 'contributor'],
            role__in=['msp_owner', 'msp_manager', 'msp_agent'],
        ),
    )


class ProjectListView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request):
        projects = visible_projects(request)
        org = request.query_params.get('client_org_id')
        if org:
            projects = projects.filter(client_org_id=org)
        return Response(ProjectReadSerializer(projects, many=True, context={'request': request}).data)

    def post(self, request):
        from .requests import can_create_project
        if not can_create_project(request.user):
            raise PermissionDenied('Project creation permission required.')
        data = ProjectCreateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        attrs = data.validated_data.copy()
        tenant = tenant_for_request(request)
        org = get_object_or_404(
            ClientOrganization.objects.filter(tenant=tenant, is_active=True),
            id=attrs.pop('client_org_id'),
        )
        project = Project(tenant=tenant, client_org=org, created_by=request.user, **attrs)
        with transaction.atomic():
            _save_validated(project)
            _save_validated(ProjectMember(project=project, user=request.user, role='manager'))
            record_activity(project, kind='project_created', actor=request.user,
                            summary='Project created', visibility='client' if project.visibility == 'client' else 'internal')
        return Response(ProjectReadSerializer(project, context={'request': request}).data, status=status.HTTP_201_CREATED)


class ProjectDetailView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request, pk):
        return Response(ProjectReadSerializer(_project(request, pk), context={'request': request}).data)

    def patch(self, request, pk):
        project = _project(request, pk)
        _manage(request.user, project)
        forbidden = {'client_org', 'client_org_id', 'tenant', 'tenant_id', 'key', 'created_by'}
        if forbidden.intersection(request.data):
            raise ValidationError({'detail': 'Project identity and client organization cannot be changed.'})
        data = ProjectUpdateSerializer(data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        for field, value in data.validated_data.items():
            setattr(project, field, value)
        _save_validated(project)
        record_activity(project, kind='project_updated', actor=request.user,
                        summary='Project details updated',
                        visibility='client' if project.visibility == 'client' else 'internal')
        return Response(ProjectReadSerializer(project).data)


class ProjectMembersView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request, pk):
        project = _project(request, pk)
        _manage(request.user, project)
        members = project.members.select_related('user').all()
        return Response(ProjectMemberReadSerializer(members, many=True).data)

    def post(self, request, pk):
        project = _project(request, pk)
        _manage(request.user, project)
        data = ProjectMemberWriteSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        user = get_object_or_404(
            User.objects.filter(tenant=project.tenant, is_active=True),
            pk=data.validated_data['user_id'],
        )
        if project.members.filter(user=user).exists():
            raise ValidationError({'user_id': 'This user is already a project member.'})
        member = ProjectMember(project=project, user=user, role=data.validated_data['role'])
        _save_validated(member)
        return Response(ProjectMemberReadSerializer(member).data, status=status.HTTP_201_CREATED)


class ProjectMemberDetailView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def delete(self, request, pk, member_id):
        project = _project(request, pk)
        _manage(request.user, project)
        member = get_object_or_404(project.members.all(), pk=member_id)
        if WorkItem.objects.filter(project=project, assignee=member.user).exists():
            raise ValidationError({'detail': 'Reassign this member\'s work items before removing membership.'})
        member.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProjectMilestonesView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request, pk):
        project = _project(request, pk)
        milestones = project.milestones.all()
        if request.user.role in CLIENT_ROLES:
            milestones = milestones.filter(visibility='client')
        return Response(ProjectMilestoneReadSerializer(milestones, many=True).data)

    def post(self, request, pk):
        project = _project(request, pk)
        _manage(request.user, project)
        data = ProjectMilestoneWriteSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        if not data.validated_data.get('name'):
            raise ValidationError({'name': 'Name is required.'})
        milestone = _save_validated(ProjectMilestone(project=project, **data.validated_data))
        record_activity(project, kind='milestone_created', actor=request.user,
                        summary=f'Milestone added: {milestone.name}',
                        visibility=milestone.visibility, milestone=milestone)
        return Response(ProjectMilestoneReadSerializer(milestone).data, status=status.HTTP_201_CREATED)


class ProjectMilestoneDetailView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def patch(self, request, pk, milestone_id):
        project = _project(request, pk)
        _manage(request.user, project)
        milestone = get_object_or_404(project.milestones.all(), pk=milestone_id)
        data = ProjectMilestoneWriteSerializer(data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        for field, value in data.validated_data.items():
            setattr(milestone, field, value)
        _save_validated(milestone)
        record_activity(project, kind='milestone_updated', actor=request.user,
                        summary=f'Milestone updated: {milestone.name}',
                        visibility=milestone.visibility, milestone=milestone)
        return Response(ProjectMilestoneReadSerializer(milestone).data)


class ProjectWorkItemsView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request, pk):
        project = _project(request, pk)
        items = project.work_items.select_related('project', 'milestone', 'assignee')
        if request.user.role in CLIENT_ROLES:
            items = items.filter(visibility='client')
        milestone_id = request.query_params.get('milestone_id')
        if milestone_id:
            items = items.filter(milestone_id=milestone_id)
        return Response(WorkItemReadSerializer(items, many=True).data)

    def post(self, request, pk):
        project = _project(request, pk)
        _edit(request.user, project)
        data = WorkItemWriteSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        attrs = data.validated_data.copy()
        if not attrs.get('title'):
            raise ValidationError({'title': 'Title is required.'})
        if attrs.get('visibility') == 'client' and not can_manage_project(request.user, project):
            raise PermissionDenied('Only a project manager can publish client visible work.')
        milestone = _milestone(project, attrs.pop('milestone_id', None))
        assignee = _assignee(project, attrs.pop('assignee_id', None))
        with transaction.atomic():
            locked = Project.objects.select_for_update().get(pk=project.pk, tenant=project.tenant)
            item = WorkItem(
                project=locked, number=locked.next_item_number,
                milestone=milestone, assignee=assignee,
                created_by=request.user, **attrs,
            )
            _save_validated(item)
            locked.next_item_number += 1
            _save_validated(locked)
            record_activity(locked, kind='work_item_created', actor=request.user,
                            summary=f'Work Item added: {item.ref}', visibility=item.visibility,
                            work_item=item)
        return Response(WorkItemReadSerializer(item).data, status=status.HTTP_201_CREATED)


class WorkItemDetailView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request, pk):
        return Response(WorkItemReadSerializer(_work_item(request, pk)).data)

    def patch(self, request, pk):
        item = _work_item(request, pk)
        _edit(request.user, item.project)
        data = WorkItemWriteSerializer(data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        attrs = data.validated_data.copy()
        if attrs.get('visibility') == 'client' and not can_manage_project(request.user, item.project):
            raise PermissionDenied('Only a project manager can publish client visible work.')
        if 'milestone_id' in attrs:
            item.milestone = _milestone(item.project, attrs.pop('milestone_id'))
        if 'assignee_id' in attrs:
            item.assignee = _assignee(item.project, attrs.pop('assignee_id'))
        for field, value in attrs.items():
            setattr(item, field, value)
        _save_validated(item)
        record_activity(item.project, kind='work_item_updated', actor=request.user,
                        summary=f'Work Item updated: {item.ref}', visibility=item.visibility,
                        work_item=item)
        return Response(WorkItemReadSerializer(item).data)


class WorkItemCommentsView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request, pk):
        item = _work_item(request, pk)
        comments = item.comments.select_related('author')
        if request.user.role in CLIENT_ROLES:
            comments = comments.filter(visibility='client')
        return Response(WorkItemCommentReadSerializer(comments, many=True).data)

    def post(self, request, pk):
        item = _work_item(request, pk)
        is_client = request.user.role in CLIENT_ROLES
        if not is_client:
            _edit(request.user, item.project)
        data = WorkItemCommentWriteSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        visibility = data.validated_data.get('visibility', 'client' if is_client else 'internal')
        if is_client:
            if visibility != 'client':
                raise PermissionDenied('Clients can only post client visible comments.')
        elif visibility == 'client' and not can_manage_project(request.user, item.project):
            raise PermissionDenied('Only a project manager can publish client visible comments.')
        comment = WorkItemComment(
            work_item=item, author=request.user,
            body=data.validated_data['body'], visibility=visibility,
        )
        _save_validated(comment)
        return Response(WorkItemCommentReadSerializer(comment).data, status=status.HTTP_201_CREATED)

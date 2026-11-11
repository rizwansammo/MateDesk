"""Project conversations and attention inbox without ticket or approval side effects."""
from django.db import transaction
from django.db.models import F, OuterRef, Q, Subquery
from django.shortcuts import get_object_or_404
from rest_framework import serializers, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.permissions import CLIENT_ROLES, IsTenantUser
from .activity import (
    CLIENT_ATTENTION_KINDS, STAFF_ATTENTION_KINDS, record_activity,
    visible_activities_for_projects,
)
from .models import Project, ProjectActivityRead, ProjectMessage
from .permissions import can_edit_work, can_manage_project, visible_projects
from .support import _serialize_activity


class ProjectMessageInput(serializers.Serializer):
    body = serializers.CharField(min_length=1, max_length=5000, trim_whitespace=True)
    visibility = serializers.ChoiceField(choices=['internal', 'client'], default='internal')
    request_id = serializers.UUIDField()

    def validate_body(self, value):
        if not value.strip():
            raise serializers.ValidationError('Enter a message.')
        return value.strip()


def _serialize_message(row, viewer):
    return {
        'id': str(row.id),
        'body': row.body,
        'visibility': row.visibility,
        'author': row.author.full_name if row.author else 'Former member',
        'is_mine': row.author_id == viewer.pk,
        'created_at': row.created_at,
    }


class ProjectConversationView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def _project(self, request, pk):
        return get_object_or_404(visible_projects(request), pk=pk)

    def get(self, request, pk):
        project = self._project(request, pk)
        qs = ProjectMessage.objects.filter(project=project).select_related('author')
        if request.user.role in CLIENT_ROLES:
            qs = qs.filter(visibility='client')
        try:
            page = int(request.query_params.get('page', 1))
        except (TypeError, ValueError):
            raise ValidationError({'page': 'Page must be a number.'})
        if page < 1 or page > 10000:
            raise ValidationError({'page': 'Page is outside the supported range.'})
        total = qs.count()
        rows = qs[(page - 1) * 25:page * 25]
        return Response({
            'results': [_serialize_message(row, request.user) for row in rows],
            'count': total, 'page': page, 'page_size': 25,
            'has_more': page * 25 < total,
        })

    def post(self, request, pk):
        project = self._project(request, pk)
        if project.status == 'archived':
            raise PermissionDenied('Archived projects are read only.')
        data = ProjectMessageInput(data=request.data)
        data.is_valid(raise_exception=True)
        attrs = data.validated_data
        user = request.user
        if user.role in CLIENT_ROLES:
            if attrs['visibility'] != 'client':
                raise PermissionDenied('Clients may only send shared messages.')
        elif not can_edit_work(user, project):
            raise PermissionDenied('Project team membership is required to send messages.')
        elif attrs['visibility'] == 'client' and not can_manage_project(user, project):
            raise PermissionDenied('Only Project Managers can share project updates with clients.')
        if attrs['visibility'] == 'client' and project.visibility != 'client':
            raise ValidationError({'visibility': 'Make the Project client visible first.'})
        with transaction.atomic():
            # All messages for a project share the same lock to make retries
            # idempotent without posting a second activity event.
            project = Project.objects.select_for_update().get(pk=project.pk)
            existing = ProjectMessage.objects.filter(
                project=project, author=user, request_id=attrs['request_id'],
            ).first()
            if existing:
                if existing.body != attrs['body'] or existing.visibility != attrs['visibility']:
                    raise ValidationError({'request_id': 'This request ID belongs to another message.'})
                return Response(_serialize_message(existing, user), status=status.HTTP_200_OK)
            message = ProjectMessage(
                project=project, author=user, body=attrs['body'],
                visibility=attrs['visibility'], request_id=attrs['request_id'],
            )
            message.save()
            from_client = user.role in CLIENT_ROLES
            record_activity(
                project, actor=user, visibility=message.visibility,
                kind='project_message_client' if from_client else 'project_message_staff',
                summary='New client message' if from_client else 'New team update',
            )
        return Response(_serialize_message(message, user), status=status.HTTP_201_CREATED)


class ProjectNotificationInboxView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request):
        user = request.user
        projects = visible_projects(request)
        kinds = CLIENT_ATTENTION_KINDS if user.role in CLIENT_ROLES else STAFF_ATTENTION_KINDS
        qs = visible_activities_for_projects(request, projects).filter(
            kind__in=kinds,
        ).exclude(actor_id=user.id).select_related(
            'project', 'actor', 'work_item', 'ticket', 'milestone',
        )
        cursor = ProjectActivityRead.objects.filter(
            user=user, project_id=OuterRef('project_id'),
        ).values('last_seen_at')[:1]
        qs = qs.annotate(_seen_at=Subquery(cursor))
        unread = qs.filter(Q(_seen_at__isnull=True) | Q(created_at__gt=F('_seen_at'))).count()
        try:
            page = int(request.query_params.get('page', 1))
        except (TypeError, ValueError):
            raise ValidationError({'page': 'Page must be a number.'})
        if page < 1 or page > 10000:
            raise ValidationError({'page': 'Page is outside the supported range.'})
        count = qs.count()
        rows = qs.order_by('-created_at', '-id')[(page - 1) * 25:page * 25]
        result = []
        for event in rows:
            info = _serialize_activity(event, user)
            info.update({
                'project_id': str(event.project_id),
                'project_name': event.project.name,
                'project_key': event.project.key,
                'is_unread': event._seen_at is None or event.created_at > event._seen_at,
            })
            if event.kind in ('project_message_staff', 'project_message_client'):
                info['href'] = f'/projects/{event.project_id}?tab=conversation'
            result.append(info)
        return Response({
            'results': result, 'count': count, 'page': page,
            'page_size': 25, 'has_more': page * 25 < count,
            'unread_count': unread,
        })

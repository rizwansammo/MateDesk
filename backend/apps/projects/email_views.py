"""Staff controlled client notifications with an idempotent audit record."""
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.users.permissions import IsTenantUser, IsMSPUser
from .email_notifications import send_project_notification
from .models import ProjectEmailNotification, ProjectMember, WorkItem
from .permissions import can_manage_project, visible_projects, tenant_for_request


class NotificationWriteSerializer(serializers.Serializer):
    recipient_id = serializers.UUIDField()
    idempotency_key = serializers.UUIDField()
    note = serializers.CharField(max_length=2000, allow_blank=True, required=False, default='')


class WorkItemNotificationView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser, IsMSPUser]

    def _item(self, request, pk):
        item = get_object_or_404(
            WorkItem.objects.select_related('project', 'project__client_org'),
            pk=pk, project__in=visible_projects(request),
        )
        if not can_manage_project(request.user, item.project):
            raise PermissionDenied('Project Manager permission required.')
        if (item.project.visibility != 'client'
                or item.visibility != 'client'
                or item.project.status == 'archived'):
            raise ValidationError({
                'detail': 'Make the Project and Work Item client visible before notifying reviewers.',
            })
        return item

    def get(self, request, pk):
        item = self._item(request, pk)
        memberships = ProjectMember.objects.filter(
            project=item.project, role='client_reviewer', user__is_active=True,
            user__tenant=item.project.tenant, user__client_org=item.project.client_org,
            user__role__in=['client_owner', 'end_user'],
        ).select_related('user').order_by('user__email')
        recent = ProjectEmailNotification.objects.filter(
            tenant=tenant_for_request(request), work_item=item,
        ).select_related('recipient')[:20]
        return Response({
            'reviewers': [{
                'id': str(member.user_id),
                'name': member.user.full_name,
                'email': member.user.email,
            } for member in memberships],
            'notifications': [{
                'id': str(row.id),
                'recipient': row.recipient.email,
                'status': row.status,
                'sent_at': row.sent_at,
                'created_at': row.created_at,
            } for row in recent],
        })

    def post(self, request, pk):
        item = self._item(request, pk)
        data = NotificationWriteSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        attrs = data.validated_data
        membership = get_object_or_404(
            ProjectMember.objects.select_related('user'),
            project=item.project, role='client_reviewer',
            user_id=attrs['recipient_id'],
            user__is_active=True,
            user__tenant=item.project.tenant,
            user__client_org=item.project.client_org,
            user__role__in=['client_owner', 'end_user'],
        )
        tenant = tenant_for_request(request)
        key = attrs['idempotency_key']
        with transaction.atomic():
            existing = ProjectEmailNotification.objects.filter(
                tenant=tenant, idempotency_key=key,
            ).first()
            if existing:
                if existing.work_item_id != item.id or existing.recipient_id != membership.user_id:
                    raise ValidationError({'idempotency_key': 'This request key belongs to another notification.'})
                if existing.status != 'sent':
                    return Response({
                        'id': str(existing.id), 'status': existing.status,
                        'detail': 'This request was already attempted. Start a new request to retry.',
                    }, status=status.HTTP_409_CONFLICT)
                return Response({
                    'id': str(existing.id), 'status': existing.status,
                    'sent_at': existing.sent_at,
                }, status=status.HTTP_200_OK)

            record = ProjectEmailNotification(
                tenant=tenant, work_item=item,
                recipient=membership.user, sent_by=request.user,
                idempotency_key=key,
                subject=f'Project update: [{item.ref}] {item.title}'[:500],
                note=attrs['note'],
            )
            try:
                record.save()
            except DjangoValidationError as exc:
                raise ValidationError(getattr(exc, 'message_dict', None) or exc.messages) from exc
            except IntegrityError as exc:
                raise ValidationError({'detail': 'Notification request already exists.'}) from exc

        successful = send_project_notification(record)
        record.refresh_from_db()
        if not successful:
            return Response({
                'id': str(record.id), 'status': record.status,
                'detail': record.last_error or 'Email could not be sent.',
            }, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response({
            'id': str(record.id), 'status': record.status, 'sent_at': record.sent_at,
        }, status=status.HTTP_201_CREATED)

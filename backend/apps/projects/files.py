"""Tenant scoped Project file library, Work Item attachments and Delivery documents.

Never expose FileField URLs: every file read goes through authenticated access
checking, even for clients with a document UUID or an old version UUID.
"""
import hashlib
import mimetypes
import os
from pathlib import PurePath
from uuid import UUID

from django.db import transaction
from django.db.models import Prefetch, Q
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.permissions import CLIENT_ROLES, IsTenantUser

from .activity import record_activity
from .delivery import ensure_delivery_unlocked
from .models import Project, ProjectDocument, ProjectDocumentVersion, WorkItem
from .permissions import can_edit_work, can_manage_project, visible_projects


MAX_PROJECT_FILE_BYTES = 20 * 1024 * 1024
ALLOWED_EXTENSIONS = {
    '.pdf', '.png', '.jpg', '.jpeg', '.webp', '.txt', '.csv',
    '.md', '.json', '.docx', '.xlsx', '.pptx', '.zip',
}
INLINE_TYPES = {
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
}


class ProjectDocumentVersionSerializer(serializers.ModelSerializer):
    uploaded_by = serializers.CharField(source='created_by.full_name', allow_null=True, read_only=True)

    class Meta:
        model = ProjectDocumentVersion
        fields = ['id', 'number', 'original_name', 'content_type', 'size',
                  'sha256', 'uploaded_by', 'created_at']


class ProjectDocumentSerializer(serializers.ModelSerializer):
    versions = ProjectDocumentVersionSerializer(many=True, read_only=True)
    uploaded_by = serializers.CharField(source='created_by.full_name', allow_null=True, read_only=True)

    class Meta:
        model = ProjectDocument
        fields = ['id', 'project', 'category', 'work_item', 'delivery_review',
                  'title', 'visibility', 'uploaded_by', 'created_by', 'created_at',
                  'updated_at', 'versions']


def _client(user):
    return user.role in CLIENT_ROLES


def _project(request, pk):
    return get_object_or_404(visible_projects(request), pk=pk)


def _visible_files(request, project):
    qs = ProjectDocument.objects.filter(
        project=project, archived_at__isnull=True,
    ).select_related('work_item', 'delivery_review', 'created_by').prefetch_related(
        Prefetch('versions', queryset=ProjectDocumentVersion.objects.select_related('created_by').order_by('-number')),
    )
    if _client(request.user):
        # Unsubmitted Delivery Files are never sent to client reviewers.
        qs = qs.filter(visibility='client').filter(
            Q(category='library')
            | Q(category='work_item', work_item__visibility='client')
            | Q(category='delivery', delivery_review__isnull=False)
        )
    return qs


def _document(request, project, doc_id):
    return get_object_or_404(_visible_files(request, project), pk=doc_id)


def _safe_name(uploaded):
    raw = str(uploaded.name or '').replace('\\', '/')
    name = PurePath(raw).name.strip()
    if (not name or name.startswith('.') or len(name) > 255
            or any(ord(ch) < 32 or ord(ch) == 127 for ch in name)):
        raise ValidationError({'file': 'Use a valid filename with at most 255 characters.'})
    extension = os.path.splitext(name)[1].lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise ValidationError({'file': 'This file type is not allowed.'})
    if not uploaded.size or uploaded.size > MAX_PROJECT_FILE_BYTES:
        raise ValidationError({'file': 'File must be between 1 byte and 20 MB.'})
    prefix = uploaded.read(16)
    uploaded.seek(0)
    signatures = {
        '.pdf': b'%PDF-', '.png': b'\x89PNG\r\n\x1a\n',
        '.jpg': b'\xff\xd8\xff', '.jpeg': b'\xff\xd8\xff',
        '.webp': b'RIFF',
        '.docx': b'PK', '.xlsx': b'PK', '.pptx': b'PK', '.zip': b'PK',
    }
    if extension in signatures and not prefix.startswith(signatures[extension]):
        raise ValidationError({'file': 'File contents do not match the extension.'})
    if extension == '.webp' and prefix[8:12] != b'WEBP':
        raise ValidationError({'file': 'Invalid WebP file.'})
    digest = hashlib.sha256()
    for chunk in uploaded.chunks():
        digest.update(chunk)
    uploaded.seek(0)
    content_type = mimetypes.guess_type(name)[0] or 'application/octet-stream'
    return name, content_type, digest.hexdigest()


def _write_version(document, uploaded, *, actor):
    name, content_type, digest = _safe_name(uploaded)
    next_version = (document.versions.order_by('-number').values_list('number', flat=True).first() or 0) + 1
    version = ProjectDocumentVersion(
        document=document, number=next_version, original_name=name,
        size=uploaded.size, content_type=content_type, sha256=digest,
        created_by=actor,
    )
    # Save after metadata validation so invalid names never reach storage.
    version.blob = uploaded
    version.save()
    return version


def _assert_write(request, project, *, category=None, existing=None, visibility=None):
    user = request.user
    is_client = _client(user)
    if project.status in ('completed', 'archived'):
        raise ValidationError({'detail': 'Reopen the Project before adding or changing documents.'})
    ensure_delivery_unlocked(project)
    if is_client:
        if category == 'delivery' or (existing and existing.category == 'delivery'):
            raise PermissionDenied('Only the Project Manager can manage Delivery Files.')
        if existing and existing.created_by_id != user.id:
            raise PermissionDenied('Clients can only edit their own uploaded files.')
        if visibility and visibility != 'client':
            raise PermissionDenied('Clients can only upload Client Visible files.')
    elif category == 'delivery' or (existing and existing.category == 'delivery'):
        if not can_manage_project(user, project):
            raise PermissionDenied('Only the Project Manager can manage Delivery Files.')
    elif not can_edit_work(user, project):
        raise PermissionDenied('Only Project contributors can manage documents.')

    if visibility == 'client' and not is_client and not can_manage_project(user, project):
        raise PermissionDenied('Only a Project Manager can publish Client Visible files.')
    if existing and existing.delivery_review_id:
        raise ValidationError({'detail': 'Submitted Delivery Files are immutable. Upload a new file for another round.'})


class ProjectFilesView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request, pk):
        project = _project(request, pk)
        qs = _visible_files(request, project)
        category = request.query_params.get('category', '')
        if category and category not in dict(ProjectDocument.CATEGORIES):
            raise ValidationError({'category': 'Invalid category.'})
        if category:
            qs = qs.filter(category=category)
        item_id = request.query_params.get('work_item_id')
        if item_id:
            try:
                item_uuid = UUID(item_id)
            except (ValueError, TypeError):
                raise ValidationError({'work_item_id': 'Invalid Work Item ID.'})
            qs = qs.filter(work_item_id=item_uuid)
        try:
            page = int(request.query_params.get('page', 1))
        except (ValueError, TypeError):
            raise ValidationError({'page': 'Invalid page number.'})
        if page < 1:
            raise ValidationError({'page': 'Invalid page number.'})
        count = qs.count()
        rows = qs[(page - 1) * 50:page * 50]
        return Response({'count': count, 'page': page, 'page_size': 50,
                         'results': ProjectDocumentSerializer(rows, many=True).data})

    def post(self, request, pk):
        project = _project(request, pk)
        category = request.data.get('category', 'library')
        if category not in dict(ProjectDocument.CATEGORIES):
            raise ValidationError({'category': 'Invalid category.'})
        visibility = request.data.get('visibility', 'client' if _client(request.user) else 'internal')
        if visibility not in dict(ProjectDocument.VISIBILITY):
            raise ValidationError({'visibility': 'Invalid visibility.'})
        _assert_write(request, project, category=category, visibility=visibility)
        uploaded = request.FILES.get('file')
        if uploaded is None:
            raise ValidationError({'file': 'Choose a file to upload.'})
        name, _, _ = _safe_name(uploaded)
        title = str(request.data.get('title') or name).strip()
        if not title or len(title) > 255:
            raise ValidationError({'title': 'Title must be 1 to 255 characters.'})
        item = None
        if category == 'work_item':
            work_item_id = request.data.get('work_item_id')
            item = get_object_or_404(WorkItem, id=work_item_id, project=project) if work_item_id else None
            if item is None:
                raise ValidationError({'work_item_id': 'Work Item is required.'})
            if _client(request.user) and item.visibility != 'client':
                raise PermissionDenied('This Work Item is not visible to the Client.')
            if visibility == 'client' and item.visibility != 'client':
                raise ValidationError({'visibility': 'Client Visible attachments require a Client Visible Work Item.'})
        elif request.data.get('work_item_id'):
            raise ValidationError({'work_item_id': 'Only Work Item attachments can link a Work Item.'})
        if category == 'delivery' and visibility != 'client':
            raise ValidationError({'visibility': 'Delivery Files must be Client Visible.'})

        with transaction.atomic():
            # Serialize concurrent uploads with Delivery submission.
            locked = Project.objects.select_for_update().get(pk=project.pk)
            _assert_write(request, locked, category=category, visibility=visibility)
            document = ProjectDocument(
                project=locked, category=category, work_item=item,
                title=title, visibility=visibility, created_by=request.user,
            )
            document.save()
            _write_version(document, uploaded, actor=request.user)
            record_activity(
                locked, actor=request.user, kind='project_updated',
                summary='Project file uploaded',
                visibility=visibility, work_item=item,
            )
        return Response(ProjectDocumentSerializer(document).data, status=status.HTTP_201_CREATED)


class ProjectFileDetailView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def patch(self, request, pk, document_id):
        project = _project(request, pk)
        document = _document(request, project, document_id)
        visibility = request.data.get('visibility', document.visibility)
        if visibility not in dict(ProjectDocument.VISIBILITY):
            raise ValidationError({'visibility': 'Invalid visibility.'})
        if 'title' not in request.data and 'visibility' not in request.data:
            raise ValidationError({'detail': 'Nothing to update.'})
        title = str(request.data.get('title', document.title)).strip()
        if not title or len(title) > 255:
            raise ValidationError({'title': 'Title must be 1 to 255 characters.'})
        if (document.category == 'work_item' and visibility == 'client'
                and document.work_item.visibility != 'client'):
            raise ValidationError({
                'visibility': 'A private Work Item cannot have a Client Visible attachment.'
            })
        with transaction.atomic():
            locked = Project.objects.select_for_update().get(pk=project.pk)
            document = _document(request, locked, document_id)
            _assert_write(request, locked, existing=document, visibility=visibility)
            if (document.category == 'work_item' and visibility == 'client'
                    and document.work_item.visibility != 'client'):
                raise ValidationError({
                    'visibility': 'A private Work Item cannot have a Client Visible attachment.'
                })
            document.title = title
            document.visibility = visibility
            document.save()
            record_activity(
                locked, actor=request.user, kind='project_updated',
                summary='Project file details updated',
                visibility=visibility, work_item=document.work_item,
            )
        return Response(ProjectDocumentSerializer(document).data)

    def delete(self, request, pk, document_id):
        project = _project(request, pk)
        document = _document(request, project, document_id)
        with transaction.atomic():
            locked = Project.objects.select_for_update().get(pk=project.pk)
            document = _document(request, locked, document_id)
            _assert_write(request, locked, existing=document)
            document.archived_at = timezone.now()
            document.save(update_fields=['archived_at', 'updated_at'])
            record_activity(
                locked, actor=request.user, kind='project_updated',
                summary='Project file archived',
                visibility=document.visibility, work_item=document.work_item,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProjectFileVersionsView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request, pk, document_id):
        project = _project(request, pk)
        document = _document(request, project, document_id)
        return Response(ProjectDocumentVersionSerializer(document.versions.all(), many=True).data)

    def post(self, request, pk, document_id):
        project = _project(request, pk)
        document = _document(request, project, document_id)
        _assert_write(request, project, existing=document)
        uploaded = request.FILES.get('file')
        if uploaded is None:
            raise ValidationError({'file': 'Choose a file to upload.'})
        _safe_name(uploaded)
        with transaction.atomic():
            locked = Project.objects.select_for_update().get(pk=project.pk)
            document = get_object_or_404(
                ProjectDocument.objects.select_for_update().filter(
                    project=locked, archived_at__isnull=True,
                ), pk=document_id
            )
            # Reapply the read check, especially for a client when visibility changed.
            _document(request, locked, document_id)
            _assert_write(request, locked, existing=document)
            version = _write_version(document, uploaded, actor=request.user)
            record_activity(
                locked, actor=request.user, kind='project_updated',
                summary='Project file version uploaded',
                visibility=document.visibility, work_item=document.work_item,
            )
        return Response(ProjectDocumentVersionSerializer(version).data, status=status.HTTP_201_CREATED)


class ProjectFileDownloadView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request, pk, document_id, version_id):
        project = _project(request, pk)
        document = _document(request, project, document_id)
        version = get_object_or_404(
            ProjectDocumentVersion, pk=version_id, document=document,
        )
        try:
            file_handle = version.blob.open('rb')
        except (OSError, ValueError):
            raise Http404
        extension = os.path.splitext(version.original_name)[1].lower()
        preview = request.query_params.get('preview') == '1' and extension in INLINE_TYPES
        response = FileResponse(
            file_handle, content_type=INLINE_TYPES[extension] if preview else 'application/octet-stream',
            as_attachment=not preview, filename=version.original_name,
        )
        response['Cache-Control'] = 'private, no-store'
        response['X-Content-Type-Options'] = 'nosniff'
        response['Content-Security-Policy'] = 'sandbox'
        return response

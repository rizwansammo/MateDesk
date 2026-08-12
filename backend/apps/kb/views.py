from django.shortcuts import get_object_or_404
from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.permissions import IsTenantUser, MSP_ROLES
from .models import KBArticle, TicketKBLink, KBFolder, KBTag, KBArticleVersion
from .serializers import (
    KBArticleSerializer, KBArticleWriteSerializer, KBFolderSerializer, KBFolderWriteSerializer,
    KBTagSerializer, KBArticleVersionListSerializer, KBArticleVersionDetailSerializer,
)

# Keep at most this many history snapshots per article.
_MAX_VERSIONS_PER_ARTICLE = 50
# Don't snapshot more often than this during continuous autosave (seconds).
_VERSION_THROTTLE_SECONDS = 120


def _maybe_snapshot_version(article, user, *, force=False):
    """Capture the article's CURRENT (pre-change) title+content as a version,
    throttled so rapid autosaves don't flood history."""
    if not (article.content or article.title):
        return
    latest = article.versions.first()  # ordered by -created_at
    if not force and latest is not None:
        age = (timezone.now() - latest.created_at).total_seconds()
        if age < _VERSION_THROTTLE_SECONDS:
            return
        if latest.title == article.title and latest.content == article.content:
            return
    KBArticleVersion.objects.create(
        article=article,
        title=article.title,
        content=article.content,
        created_by=user if getattr(user, 'is_authenticated', False) else None,
    )
    stale_ids = list(article.versions.values_list('id', flat=True)[_MAX_VERSIONS_PER_ARTICLE:])
    if stale_ids:
        KBArticleVersion.objects.filter(id__in=stale_ids).delete()


def _resolve_tenant(request):
    return getattr(request, 'tenant', None) or getattr(request.user, 'tenant', None)


def _scoped_article_queryset(request, tenant):
    qs = KBArticle.objects.filter(tenant=tenant).select_related('author', 'client_org')
    if request.user.role in MSP_ROLES:
        return qs

    # Client-side users can only view published public knowledge,
    # scoped to their own organization or general (unscoped) articles.
    qs = qs.filter(status='published', visibility='public')
    user_org_id = getattr(request.user, 'client_org_id', None)
    if user_org_id:
        return qs.filter(Q(client_org_id=user_org_id) | Q(client_org__isnull=True))
    return qs.filter(client_org__isnull=True)


class KBArticleListView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request):
        tenant = _resolve_tenant(request)
        if tenant is None:
            return Response({'detail': 'No tenant context.'}, status=400)

        qs = _scoped_article_queryset(request, tenant)

        category = request.query_params.get('category', '')
        if category:
            qs = qs.filter(category=category)

        folder_id = request.query_params.get('folder_id')
        if folder_id == 'null':
            qs = qs.filter(folder_id__isnull=True)
        elif folder_id:
            qs = qs.filter(folder_id=folder_id)

        q = request.query_params.get('q', '')
        if q:
            qs = qs.filter(title__icontains=q)

        return Response(KBArticleSerializer(qs, many=True, context={'request': request}).data)

    def post(self, request):
        tenant = _resolve_tenant(request)
        if tenant is None:
            return Response({'detail': 'No tenant context.'}, status=400)
        if request.user.role not in MSP_ROLES:
            return Response({'detail': 'MSP staff only.'}, status=403)

        ser = KBArticleWriteSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data

        org = None
        if d.get('client_org_id'):
            from apps.tenants.models import ClientOrganization
            org = ClientOrganization.objects.filter(pk=d['client_org_id'], tenant=tenant).first()
            if org is None:
                return Response({'detail': 'Invalid client_org_id for this tenant.'}, status=400)

        folder = None
        if d.get('folder_id'):
            folder = KBFolder.objects.filter(pk=d['folder_id'], tenant=tenant).first()
            if folder is None:
                return Response({'detail': 'Invalid folder_id.'}, status=400)

        article = KBArticle.objects.create(
            tenant=tenant,
            category=d['category'],
            document_type=d.get('document_type', 'Article'),
            title=d['title'],
            content=d.get('content', ''),
            status=d['status'],
            visibility=d['visibility'],
            author=request.user,
            client_org=org,
            folder=folder,
        )

        if 'tags' in d:
            for tag_name in d['tags']:
                tag, _ = KBTag.objects.get_or_create(tenant=tenant, name=tag_name)
                article.tags.add(tag)

        return Response(KBArticleSerializer(article, context={'request': request}).data, status=201)


class KBArticleDetailView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def _get_article(self, request, pk):
        tenant = _resolve_tenant(request)
        if tenant is None:
            return None, Response({'detail': 'No tenant context.'}, status=400)
        article = get_object_or_404(_scoped_article_queryset(request, tenant), pk=pk)
        return article, None

    def get(self, request, pk):
        article, err = self._get_article(request, pk)
        if err:
            return err
        return Response(KBArticleSerializer(article, context={'request': request}).data)

    def patch(self, request, pk):
        article, err = self._get_article(request, pk)
        if err:
            return err
        if request.user.role not in MSP_ROLES:
            return Response({'detail': 'MSP staff only.'}, status=403)

        ser = KBArticleWriteSerializer(data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data

        # Snapshot the existing content into history before overwriting it.
        content_changing = 'content' in d and d['content'] != article.content
        title_changing = 'title' in d and d['title'] != article.title
        force_snapshot = str(request.data.get('create_version', '')).lower() in ('1', 'true', 'yes')
        if content_changing or title_changing or force_snapshot:
            _maybe_snapshot_version(article, request.user, force=force_snapshot)

        for field in ('category', 'document_type', 'title', 'content', 'status', 'visibility'):
            if field in d:
                setattr(article, field, d[field])

        if 'client_org_id' in d:
            if d['client_org_id']:
                from apps.tenants.models import ClientOrganization
                tenant = _resolve_tenant(request)
                org = ClientOrganization.objects.filter(
                    pk=d['client_org_id'], tenant=tenant
                ).first()
                if org is None:
                    return Response({'detail': 'Invalid client_org_id for this tenant.'}, status=400)
                article.client_org = org
            else:
                article.client_org = None

        if 'folder_id' in d:
            if d['folder_id']:
                tenant = _resolve_tenant(request)
                folder = KBFolder.objects.filter(pk=d['folder_id'], tenant=tenant).first()
                if folder is None:
                    return Response({'detail': 'Invalid folder_id.'}, status=400)
                article.folder = folder
            else:
                article.folder = None

        article.save()

        if 'tags' in d:
            tag_objs = []
            for tag_name in d['tags']:
                tag, _ = KBTag.objects.get_or_create(tenant=tenant, name=tag_name)
                tag_objs.append(tag)
            article.tags.set(tag_objs)

        return Response(KBArticleSerializer(article, context={'request': request}).data)

    def delete(self, request, pk):
        article, err = self._get_article(request, pk)
        if err:
            return err
        if request.user.role not in MSP_ROLES:
            return Response({'detail': 'MSP staff only.'}, status=403)
        article.delete()
        return Response(status=204)


class KBArticleLinkTicketView(APIView):
    """POST /api/kb/articles/{pk}/link-ticket/    body: {ticket_ref}
       DELETE /api/kb/articles/{pk}/link-ticket/  body: {ticket_ref}"""
    permission_classes = [IsAuthenticated, IsTenantUser]

    def post(self, request, pk):
        tenant = _resolve_tenant(request)
        if tenant is None:
            return Response({'detail': 'No tenant context.'}, status=400)
        if request.user.role not in MSP_ROLES:
            return Response({'detail': 'MSP staff only.'}, status=403)

        article = get_object_or_404(KBArticle, pk=pk, tenant=tenant)

        ticket_ref = request.data.get('ticket_ref')
        if not ticket_ref:
            return Response({'detail': 'ticket_ref required.'}, status=400)

        from apps.tickets.models import Ticket
        ticket = get_object_or_404(Ticket, ticket_ref=ticket_ref, tenant=tenant)

        link, created = TicketKBLink.objects.get_or_create(
            ticket=ticket, article=article,
            defaults={'linked_by': request.user},
        )
        return Response(
            {'linked': True, 'created': created, 'link_id': str(link.id)},
            status=201 if created else 200,
        )

    def delete(self, request, pk):
        tenant = _resolve_tenant(request)
        if tenant is None:
            return Response({'detail': 'No tenant context.'}, status=400)
        if request.user.role not in MSP_ROLES:
            return Response({'detail': 'MSP staff only.'}, status=403)

        article = get_object_or_404(KBArticle, pk=pk, tenant=tenant)

        ticket_ref = request.data.get('ticket_ref')
        if not ticket_ref:
            return Response({'detail': 'ticket_ref required.'}, status=400)

        from apps.tickets.models import Ticket
        ticket = get_object_or_404(Ticket, ticket_ref=ticket_ref, tenant=tenant)

        TicketKBLink.objects.filter(ticket=ticket, article=article).delete()
        return Response(status=204)


class KBFolderListView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request):
        tenant = _resolve_tenant(request)
        if tenant is None:
            return Response({'detail': 'No tenant context.'}, status=400)
        qs = KBFolder.objects.filter(tenant=tenant)
        return Response(KBFolderSerializer(qs, many=True).data)

    def post(self, request):
        tenant = _resolve_tenant(request)
        if tenant is None:
            return Response({'detail': 'No tenant context.'}, status=400)
        if request.user.role not in MSP_ROLES:
            return Response({'detail': 'MSP staff only.'}, status=403)
            
        ser = KBFolderWriteSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        
        parent = None
        if d.get('parent_id'):
            parent = get_object_or_404(KBFolder, pk=d['parent_id'], tenant=tenant)
            
        folder = KBFolder.objects.create(
            tenant=tenant,
            name=d['name'],
            parent=parent
        )
        return Response(KBFolderSerializer(folder).data, status=201)


class KBFolderDetailView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request, pk):
        tenant = _resolve_tenant(request)
        folder = get_object_or_404(KBFolder, pk=pk, tenant=tenant)
        return Response(KBFolderSerializer(folder).data)

    def patch(self, request, pk):
        tenant = _resolve_tenant(request)
        folder = get_object_or_404(KBFolder, pk=pk, tenant=tenant)
        if request.user.role not in MSP_ROLES:
            return Response({'detail': 'MSP staff only.'}, status=403)

        ser = KBFolderWriteSerializer(data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        
        if 'name' in d:
            folder.name = d['name']
        if 'parent_id' in d:
            if d['parent_id']:
                parent = get_object_or_404(KBFolder, pk=d['parent_id'], tenant=tenant)
                # Prevent cycles
                curr = parent
                while curr:
                    if curr.id == folder.id:
                        return Response({'detail': 'Cannot set parent to a descendant.'}, status=400)
                    curr = curr.parent
                folder.parent = parent
            else:
                folder.parent = None
                
        folder.save()
        return Response(KBFolderSerializer(folder).data)

    def delete(self, request, pk):
        tenant = _resolve_tenant(request)
        folder = get_object_or_404(KBFolder, pk=pk, tenant=tenant)
        if request.user.role not in MSP_ROLES:
            return Response({'detail': 'MSP staff only.'}, status=403)
        folder.delete()
        return Response(status=204)


class KBTagListView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request):
        tenant = _resolve_tenant(request)
        if tenant is None:
            return Response({'detail': 'No tenant context.'}, status=400)
        qs = KBTag.objects.filter(tenant=tenant).order_by('name')
        return Response(KBTagSerializer(qs, many=True).data)


class KBArticleVersionListView(APIView):
    """GET /api/kb/articles/{pk}/versions/ — history snapshots (newest first)."""
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request, pk):
        tenant = _resolve_tenant(request)
        if tenant is None:
            return Response({'detail': 'No tenant context.'}, status=400)
        if request.user.role not in MSP_ROLES:
            return Response({'detail': 'MSP staff only.'}, status=403)
        article = get_object_or_404(_scoped_article_queryset(request, tenant), pk=pk)
        versions = article.versions.select_related('created_by').all()
        return Response(KBArticleVersionListSerializer(versions, many=True).data)


class KBArticleVersionDetailView(APIView):
    """GET /api/kb/articles/{pk}/versions/{version_pk}/ — full version content."""
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request, pk, version_pk):
        tenant = _resolve_tenant(request)
        if tenant is None:
            return Response({'detail': 'No tenant context.'}, status=400)
        if request.user.role not in MSP_ROLES:
            return Response({'detail': 'MSP staff only.'}, status=403)
        article = get_object_or_404(_scoped_article_queryset(request, tenant), pk=pk)
        version = get_object_or_404(article.versions, pk=version_pk)
        return Response(KBArticleVersionDetailSerializer(version).data)


class KBArticleVersionRestoreView(APIView):
    """POST /api/kb/articles/{pk}/versions/{version_pk}/restore/
       Snapshots the current content, then restores the chosen version."""
    permission_classes = [IsAuthenticated, IsTenantUser]

    def post(self, request, pk, version_pk):
        tenant = _resolve_tenant(request)
        if tenant is None:
            return Response({'detail': 'No tenant context.'}, status=400)
        if request.user.role not in MSP_ROLES:
            return Response({'detail': 'MSP staff only.'}, status=403)
        article = get_object_or_404(KBArticle.objects.filter(tenant=tenant), pk=pk)
        version = get_object_or_404(article.versions, pk=version_pk)

        # Preserve the live content as a snapshot before overwriting it.
        _maybe_snapshot_version(article, request.user, force=True)
        article.title = version.title
        article.content = version.content
        article.save(update_fields=['title', 'content', 'updated_at'])
        return Response(KBArticleSerializer(article, context={'request': request}).data)

from django.db import models as djmodels
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from apps.users.permissions import IsTenantUser, MSP_ROLES
from .models import AgentTodo, Announcement


def _resolve_tenant(request):
    """Tenant from the subdomain (prod) or the JWT user (dev/localhost)."""
    return getattr(request, 'tenant', None) or getattr(request.user, 'tenant', None)


class AgentTodoListView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request):
        tenant = _resolve_tenant(request)
        if tenant is None:
            return Response([])
        todos = AgentTodo.objects.filter(tenant=tenant, agent=request.user)
        return Response([
            {'id': str(t.id), 'text': t.text, 'completed': t.completed, 'created_at': t.created_at.isoformat()}
            for t in todos
        ])

    def post(self, request):
        tenant = _resolve_tenant(request)
        if tenant is None:
            return Response({'error': 'No tenant context.'}, status=400)
        text = (request.data.get('text') or '').strip()
        if not text:
            return Response({'error': 'text required'}, status=400)
        todo = AgentTodo.objects.create(tenant=tenant, agent=request.user, text=text)
        return Response(
            {'id': str(todo.id), 'text': todo.text, 'completed': todo.completed, 'created_at': todo.created_at.isoformat()},
            status=201,
        )


class AgentTodoDetailView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def patch(self, request, pk):
        tenant = _resolve_tenant(request)
        if tenant is None:
            return Response(status=404)
        try:
            todo = AgentTodo.objects.get(pk=pk, tenant=tenant, agent=request.user)
        except AgentTodo.DoesNotExist:
            return Response(status=404)
        if 'completed' in request.data:
            todo.completed = bool(request.data['completed'])
        if 'text' in request.data:
            todo.text = request.data['text']
        todo.save()
        return Response({'id': str(todo.id), 'text': todo.text, 'completed': todo.completed})

    def delete(self, request, pk):
        tenant = _resolve_tenant(request)
        if tenant is None:
            return Response(status=404)
        try:
            todo = AgentTodo.objects.get(pk=pk, tenant=tenant, agent=request.user)
        except AgentTodo.DoesNotExist:
            return Response(status=404)
        todo.delete()
        return Response(status=204)


class AnnouncementListView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request):
        tenant = _resolve_tenant(request)
        if tenant is None:
            return Response([])
        if request.user.role not in MSP_ROLES:
            return Response([])
        qs = Announcement.objects.filter(tenant=tenant).filter(
            djmodels.Q(recipient_mode='all') | djmodels.Q(recipients=request.user)
        ).distinct()
        return Response([{
            'id': str(a.id),
            'title': a.title,
            'body': a.body,
            'created_by': a.created_by.full_name if a.created_by else 'System',
            'recipient_mode': a.recipient_mode,
            'created_at': a.created_at.isoformat(),
        } for a in qs])

    def post(self, request):
        tenant = _resolve_tenant(request)
        if tenant is None:
            return Response({'error': 'No tenant context.'}, status=400)
        if request.user.role not in ('msp_owner', 'msp_manager'):
            return Response({'error': 'Permission denied'}, status=403)
        title = (request.data.get('title') or '').strip()
        body  = (request.data.get('body')  or '').strip()
        if not title or not body:
            return Response({'error': 'title and body required'}, status=400)
        mode = request.data.get('recipient_mode', 'all')
        ann = Announcement.objects.create(
            tenant=tenant, created_by=request.user, title=title, body=body, recipient_mode=mode
        )
        if mode == 'specific':
            from apps.users.models import User
            ids = request.data.get('recipient_ids', [])
            ann.recipients.set(User.objects.filter(tenant=tenant, id__in=ids))
        return Response({
            'id': str(ann.id),
            'title': ann.title,
            'body': ann.body,
            'created_by': ann.created_by.full_name,
            'recipient_mode': ann.recipient_mode,
            'created_at': ann.created_at.isoformat(),
        }, status=201)


class AnnouncementDetailView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def delete(self, request, pk):
        tenant = _resolve_tenant(request)
        if tenant is None:
            return Response(status=404)
        if request.user.role not in ('msp_owner', 'msp_manager'):
            return Response({'error': 'Permission denied'}, status=403)
        try:
            ann = Announcement.objects.get(pk=pk, tenant=tenant)
        except Announcement.DoesNotExist:
            return Response(status=404)
        ann.delete()
        return Response(status=204)

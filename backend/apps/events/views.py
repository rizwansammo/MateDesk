from django.shortcuts import get_object_or_404
from django.utils import timezone

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.permissions import IsTenantUser, MSP_ROLES
from apps.users.models import User
from apps.tickets.models import Ticket

from .models import Event
from .serializers import EventSerializer, EventCreateSerializer, EventUpdateSerializer


def _resolve_tenant(request):
    return getattr(request, 'tenant', None) or getattr(request.user, 'tenant', None)


class EventListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request):
        tenant = _resolve_tenant(request)
        if tenant is None:
            return Response([], status=200)

        qs = Event.objects.filter(tenant=tenant).prefetch_related('assigned_agents').select_related('creator', 'linked_ticket')

        # Clients can only see events where they are assigned (if ever used for clients)
        # For now events are MSP-only
        if request.user.role not in MSP_ROLES:
            return Response([], status=200)

        status_filter = request.query_params.get('status', '')
        if status_filter:
            qs = qs.filter(status=status_filter)

        # Filter for events assigned to current user
        mine = request.query_params.get('mine', '')
        if mine == '1':
            qs = qs.filter(assigned_agents=request.user)

        return Response(EventSerializer(qs, many=True).data)

    def post(self, request):
        if request.user.role not in MSP_ROLES:
            return Response({'detail': 'MSP staff only.'}, status=403)

        tenant = _resolve_tenant(request)
        if tenant is None:
            return Response({'detail': 'No tenant context.'}, status=400)

        serializer = EventCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        linked_ticket = None
        ref = data.get('linked_ticket_ref', '').strip()
        if ref:
            linked_ticket = Ticket.objects.filter(tenant=tenant, ticket_ref=ref).first()

        event = Event.objects.create(
            tenant=tenant,
            title=data['title'],
            description=data.get('description', ''),
            event_dt=data['event_dt'],
            creator=request.user,
            linked_ticket=linked_ticket,
        )

        agent_ids = data.get('assigned_agent_ids', [])
        if agent_ids:
            agents = User.objects.filter(id__in=agent_ids, tenant=tenant, is_active=True, role__in=MSP_ROLES)
            event.assigned_agents.set(agents)

        # Always include creator in assigned agents
        event.assigned_agents.add(request.user)

        return Response(EventSerializer(event).data, status=201)


class EventDetailView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def _get_event(self, request, pk):
        tenant = _resolve_tenant(request)
        return get_object_or_404(
            Event.objects.prefetch_related('assigned_agents').select_related('creator', 'linked_ticket'),
            pk=pk, tenant=tenant
        )

    def get(self, request, pk):
        if request.user.role not in MSP_ROLES:
            return Response({'detail': 'MSP staff only.'}, status=403)
        event = self._get_event(request, pk)
        return Response(EventSerializer(event).data)

    def patch(self, request, pk):
        if request.user.role not in MSP_ROLES:
            return Response({'detail': 'MSP staff only.'}, status=403)

        event = self._get_event(request, pk)
        tenant = _resolve_tenant(request)

        serializer = EventUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        for field in ('title', 'description', 'event_dt', 'status'):
            if field in data:
                setattr(event, field, data[field])

        if 'linked_ticket_ref' in data:
            ref = (data['linked_ticket_ref'] or '').strip()
            event.linked_ticket = Ticket.objects.filter(tenant=tenant, ticket_ref=ref).first() if ref else None

        event.save()

        if 'assigned_agent_ids' in data:
            agents = User.objects.filter(id__in=data['assigned_agent_ids'], tenant=tenant, is_active=True, role__in=MSP_ROLES)
            event.assigned_agents.set(agents)
            event.assigned_agents.add(request.user)

        event.refresh_from_db()
        return Response(EventSerializer(event).data)

    def delete(self, request, pk):
        if request.user.role not in MSP_ROLES:
            return Response({'detail': 'MSP staff only.'}, status=403)
        event = self._get_event(request, pk)
        event.delete()
        return Response(status=204)

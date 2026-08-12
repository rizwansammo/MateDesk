from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from apps.users.permissions import IsMSPUser, IsTenantUser
from .models import AutomationRule, AutomationLog
from .serializers import AutomationRuleSerializer, AutomationRuleWriteSerializer, AutomationLogSerializer
from .registry import FIELD_REGISTRY, OPERATOR_REGISTRY, ACTION_REGISTRY
from .templates import AUTOMATION_TEMPLATES
from .engine import dry_run_automation_rules


class AutomationRuleListView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser, IsMSPUser]

    def get(self, request):
        rules = (
            AutomationRule.objects
            .filter(tenant=request.tenant)
            .select_related('scope_org')
        )
        return Response(AutomationRuleSerializer(rules, many=True).data)

    def post(self, request):
        ser = AutomationRuleWriteSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        rule = AutomationRule.objects.create(tenant=request.tenant, **ser.validated_data)
        return Response(AutomationRuleSerializer(rule).data, status=status.HTTP_201_CREATED)


class AutomationRuleDetailView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser, IsMSPUser]

    def _rule(self, request, pk):
        return AutomationRule.objects.select_related('scope_org').get(pk=pk, tenant=request.tenant)

    def get(self, request, pk):
        return Response(AutomationRuleSerializer(self._rule(request, pk)).data)

    def patch(self, request, pk):
        rule = self._rule(request, pk)
        ser  = AutomationRuleWriteSerializer(data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        for k, v in ser.validated_data.items():
            setattr(rule, k, v)
        rule.save()
        return Response(AutomationRuleSerializer(rule).data)

    def delete(self, request, pk):
        self._rule(request, pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AutomationRegistryView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser, IsMSPUser]

    def get(self, request):
        return Response({
            'fields':    FIELD_REGISTRY,
            'operators': OPERATOR_REGISTRY,
            'actions':   ACTION_REGISTRY,
        })


class AutomationTemplatesView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser, IsMSPUser]

    def get(self, request):
        return Response(AUTOMATION_TEMPLATES)


class AutomationLogListView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser, IsMSPUser]

    def get(self, request):
        qs = AutomationLog.objects.filter(tenant=request.tenant)
        ticket_ref = request.query_params.get('ticket')
        rule_id    = request.query_params.get('rule')
        if ticket_ref:
            qs = qs.filter(ticket_ref=ticket_ref)
        if rule_id:
            qs = qs.filter(rule_id=rule_id)
        return Response(AutomationLogSerializer(qs[:100], many=True).data)


class AutomationTestView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser, IsMSPUser]

    def post(self, request):
        ticket_ref = request.data.get('ticket_ref', '').strip()
        trigger    = request.data.get('trigger', 'ticket_created')

        if not ticket_ref:
            return Response({'error': 'ticket_ref is required'}, status=status.HTTP_400_BAD_REQUEST)

        valid_triggers = (
            'ticket_created', 'ticket_updated', 'ticket_closed', 'ticket_solved',
            'ticket_assigned', 'ticket_unassigned', 'priority_escalated', 'sla_breached',
            'reply_added', 'customer_replied', 'ticket_overdue', 'ticket_stale',
        )
        if trigger not in valid_triggers:
            return Response(
                {'error': f'trigger must be one of {valid_triggers}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            from apps.tickets.models import Ticket
            ticket = (
                Ticket.objects
                .select_related('client_org', 'group', 'assignee', 'requester')
                .get(ticket_ref=ticket_ref, tenant=request.tenant)
            )
        except Ticket.DoesNotExist:
            return Response({'error': 'Ticket not found'}, status=status.HTTP_404_NOT_FOUND)

        results = dry_run_automation_rules(ticket, trigger)
        return Response(results)

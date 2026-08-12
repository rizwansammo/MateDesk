from rest_framework import serializers
from .models import AutomationRule, AutomationLog


class AutomationRuleSerializer(serializers.ModelSerializer):
    scope_org_name = serializers.SerializerMethodField()

    def get_scope_org_name(self, obj):
        return obj.scope_org.name if obj.scope_org_id and obj.scope_org else None

    class Meta:
        model  = AutomationRule
        fields = [
            'id', 'name', 'description', 'is_active', 'priority_order',
            'trigger', 'scope_type', 'scope_org_id', 'scope_org_name',
            'condition_match', 'conditions', 'actions', 'stop_processing',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class AutomationRuleWriteSerializer(serializers.Serializer):
    name            = serializers.CharField(max_length=200)
    description     = serializers.CharField(required=False, allow_blank=True, default='')
    is_active       = serializers.BooleanField(required=False, default=True)
    priority_order  = serializers.IntegerField(required=False, default=10, min_value=1)
    trigger         = serializers.ChoiceField(choices=[
        'ticket_created', 'ticket_updated', 'ticket_closed', 'ticket_solved',
        'ticket_assigned', 'ticket_unassigned', 'priority_escalated', 'sla_breached',
        'reply_added', 'customer_replied', 'ticket_overdue', 'ticket_stale',
    ])
    scope_type      = serializers.ChoiceField(choices=['all_orgs', 'specific_org'], required=False, default='all_orgs')
    scope_org_id    = serializers.UUIDField(required=False, allow_null=True, default=None)
    condition_match = serializers.ChoiceField(choices=['all', 'any'], required=False, default='all')
    conditions      = serializers.ListField(child=serializers.DictField(), required=False, default=list)
    actions         = serializers.ListField(child=serializers.DictField(), required=False, default=list)
    stop_processing = serializers.BooleanField(required=False, default=False)


class AutomationLogSerializer(serializers.ModelSerializer):
    class Meta:
        model  = AutomationLog
        fields = ['id', 'rule_id', 'rule_name', 'ticket_ref', 'trigger', 'actions_taken', 'fired_at']

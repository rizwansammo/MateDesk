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

    def validate(self, attrs):
        """Check Project routing targets and scope before accepting a rule.

        Use the effective saved state on PATCH, including changes to trigger or
        organization. A forged tenant or foreign Project ID cannot be stored.
        """
        from apps.projects.models import Project
        from apps.projects.permissions import can_manage_project

        rule = self.context.get('rule')
        tenant = self.context.get('tenant')
        actor = self.context.get('actor')
        actions = attrs.get('actions', rule.actions if rule else [])
        project_actions = [action for action in actions if action.get('type') == 'link_to_project']
        if not project_actions:
            return attrs

        trigger = attrs.get('trigger', rule.trigger if rule else None)
        if trigger != 'ticket_created':
            raise serializers.ValidationError({
                'actions': 'Link to Project is available only for Ticket Created.',
            })
        if len(project_actions) > 1:
            raise serializers.ValidationError({
                'actions': 'Use only one Link to Project action in a rule.',
            })

        scope_type = attrs.get('scope_type', rule.scope_type if rule else 'all_orgs')
        scope_org_id = attrs.get('scope_org_id', rule.scope_org_id if rule else None)
        conditions = attrs.get('conditions', rule.conditions if rule else [])
        if scope_type == 'specific_org' and not scope_org_id:
            raise serializers.ValidationError({
                'scope_org_id': 'Select the organization for this Project rule.',
            })
        if scope_type == 'all_orgs' and not conditions:
            raise serializers.ValidationError({
                'conditions': 'Add at least one condition or select a specific organization.',
            })

        from apps.tenants.models import ClientOrganization
        if scope_type == 'specific_org' and not ClientOrganization.objects.filter(
            pk=scope_org_id, tenant=tenant, is_active=True,
        ).exists():
            raise serializers.ValidationError({
                'scope_org_id': 'Organization must be active and belong to this tenant.',
            })

        raw_value = project_actions[0].get('value', '')
        try:
            import uuid
            project_pk = uuid.UUID(str(raw_value))
        except (ValueError, AttributeError, TypeError):
            raise serializers.ValidationError({
                'actions': 'Select a valid Project.',
            })

        project = Project.objects.filter(
            pk=project_pk, tenant=tenant, client_org__is_active=True,
        ).exclude(status='archived').select_related('client_org').first()
        if not project or project.client_org.name == 'Walk-In':
            raise serializers.ValidationError({
                'actions': 'Project must belong to an active client organization in this tenant.',
            })
        if scope_type == 'specific_org' and project.client_org_id != scope_org_id:
            raise serializers.ValidationError({
                'actions': 'Project must belong to the selected organization.',
            })
        if not actor or not can_manage_project(actor, project):
            raise serializers.ValidationError({
                'actions': 'Only Project Managers can configure Project routing.',
            })
        return attrs


class AutomationLogSerializer(serializers.ModelSerializer):
    class Meta:
        model  = AutomationLog
        fields = ['id', 'rule_id', 'rule_name', 'ticket_ref', 'trigger', 'actions_taken', 'fired_at']

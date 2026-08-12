from rest_framework import serializers
from .models import SLAPolicy, SLATarget, VIPRule


class SLATargetSerializer(serializers.ModelSerializer):
    class Meta:
        model  = SLATarget
        fields = ['id', 'priority', 'first_response_minutes', 'resolution_minutes', 'due_soon_minutes']
        read_only_fields = ['id']


class SLAPolicySerializer(serializers.ModelSerializer):
    targets        = SLATargetSerializer(many=True)
    scope_org_name = serializers.SerializerMethodField()

    class Meta:
        model  = SLAPolicy
        fields = [
            'id', 'name', 'description', 'is_active', 'priority_order',
            'scope_type', 'scope_org', 'scope_org_name',
            'clock_mode', 'breach_emails', 'targets',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'scope_org_name']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Constrain scope_org choices to the current tenant so a policy cannot
        # reference (or echo the name of) another tenant's organization.
        request = self.context.get('request')
        tenant = None
        if request is not None:
            tenant = getattr(request, 'tenant', None) or getattr(getattr(request, 'user', None), 'tenant', None)
        if tenant is not None and 'scope_org' in self.fields:
            from apps.tenants.models import ClientOrganization
            self.fields['scope_org'].queryset = ClientOrganization.objects.filter(tenant=tenant)

    def get_scope_org_name(self, obj):
        return obj.scope_org.name if obj.scope_org_id else None

    def create(self, validated_data):
        targets_data = validated_data.pop('targets', [])
        policy = SLAPolicy.objects.create(**validated_data)
        for t in targets_data:
            SLATarget.objects.create(policy=policy, **t)
        return policy

    def update(self, instance, validated_data):
        targets_data = validated_data.pop('targets', None)
        for attr, val in validated_data.items():
            setattr(instance, attr, val)
        instance.save()
        if targets_data is not None:
            instance.targets.all().delete()
            for t in targets_data:
                SLATarget.objects.create(policy=instance, **t)
        return instance


class VIPRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model  = VIPRule
        fields = ['id', 'name', 'is_active', 'notification_emails', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']

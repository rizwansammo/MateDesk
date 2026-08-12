from rest_framework import serializers
from .models import ClientOrganization, Tenant


class TenantSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Tenant
        fields = [
            'id', 'name', 'slug', 'plan', 'timezone', 'support_email',
            'phone', 'address', 'website', 'primary_color',
        ]
        read_only_fields = ['id', 'slug', 'plan']


class ClientOrgSerializer(serializers.ModelSerializer):
    total_tickets = serializers.SerializerMethodField()
    user_count    = serializers.SerializerMethodField()

    class Meta:
        model  = ClientOrganization
        fields = [
            'id', 'name', 'domain', 'timezone', 'business_hours',
            'contact_name', 'contact_email', 'phone', 'address',
            'is_active', 'created_at', 'total_tickets', 'user_count',
        ]

    def get_total_tickets(self, obj):
        return obj.tickets.count()

    def get_user_count(self, obj):
        return obj.users.filter(is_active=True).count()


class ClientOrgWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model  = ClientOrganization
        fields = ['name', 'domain', 'timezone', 'business_hours', 'contact_name', 'contact_email', 'phone', 'address', 'is_active']

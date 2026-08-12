from rest_framework import serializers
from .models import Event


class EventSerializer(serializers.ModelSerializer):
    creator_name    = serializers.SerializerMethodField()
    assigned_agents = serializers.SerializerMethodField()
    linked_ticket_ref     = serializers.SerializerMethodField()
    linked_ticket_subject = serializers.SerializerMethodField()

    def get_creator_name(self, obj):
        return obj.creator.full_name if obj.creator else None

    def get_assigned_agents(self, obj):
        return [
            {'id': str(a.id), 'full_name': a.full_name, 'role': a.role}
            for a in obj.assigned_agents.all()
        ]

    def get_linked_ticket_ref(self, obj):
        return obj.linked_ticket.ticket_ref if obj.linked_ticket else None

    def get_linked_ticket_subject(self, obj):
        return obj.linked_ticket.subject if obj.linked_ticket else None

    class Meta:
        model  = Event
        fields = [
            'id', 'title', 'description', 'event_dt', 'status',
            'creator_name', 'assigned_agents',
            'linked_ticket_ref', 'linked_ticket_subject',
            'created_at', 'updated_at',
        ]


class EventCreateSerializer(serializers.Serializer):
    title              = serializers.CharField(max_length=300)
    description        = serializers.CharField(required=False, allow_blank=True, default='')
    event_dt           = serializers.DateTimeField()
    assigned_agent_ids = serializers.ListField(
        child=serializers.UUIDField(), required=False, default=list
    )
    linked_ticket_ref  = serializers.CharField(required=False, allow_blank=True, default='')


class EventUpdateSerializer(serializers.Serializer):
    title              = serializers.CharField(max_length=300, required=False)
    description        = serializers.CharField(required=False, allow_blank=True)
    event_dt           = serializers.DateTimeField(required=False)
    status             = serializers.ChoiceField(choices=['pending', 'completed'], required=False)
    assigned_agent_ids = serializers.ListField(
        child=serializers.UUIDField(), required=False
    )
    linked_ticket_ref  = serializers.CharField(required=False, allow_blank=True, allow_null=True)

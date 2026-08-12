from rest_framework import serializers
from .models import DirectMessage, SupportSession, SupportMessage


class DMMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model  = DirectMessage
        fields = ['id', 'sender_id', 'recipient_id', 'body', 'is_read', 'created_at']


class SupportMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model  = SupportMessage
        fields = ['id', 'session_id', 'sender_id', 'sender_type', 'body', 'created_at']


class SupportSessionSerializer(serializers.ModelSerializer):
    user_info  = serializers.SerializerMethodField()
    agent_info = serializers.SerializerMethodField()

    def get_user_info(self, obj):
        u = obj.user
        return {'id': str(u.id), 'full_name': u.full_name, 'email': u.email}

    def get_agent_info(self, obj):
        if not obj.agent_id:
            return None
        a = obj.agent
        return {'id': str(a.id), 'full_name': a.full_name, 'email': a.email}

    class Meta:
        model  = SupportSession
        fields = [
            'id', 'session_number', 'user_info', 'agent_info',
            'status', 'initiated_by', 'created_at', 'ended_at',
        ]

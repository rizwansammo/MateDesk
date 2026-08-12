from rest_framework import serializers
from apps.users.permissions import MSP_ROLES
from .models import KBArticle, TicketKBLink, KBFolder, KBTag, KBArticleVersion


class KBTagSerializer(serializers.ModelSerializer):
    class Meta:
        model  = KBTag
        fields = ['id', 'name', 'color']


class KBFolderSerializer(serializers.ModelSerializer):
    class Meta:
        model  = KBFolder
        fields = ['id', 'name', 'parent_id', 'created_at', 'updated_at']

class KBFolderWriteSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    parent_id = serializers.UUIDField(required=False, allow_null=True)


class KBArticleSerializer(serializers.ModelSerializer):
    author_name  = serializers.SerializerMethodField()
    org_name     = serializers.SerializerMethodField()
    linked_tickets = serializers.SerializerMethodField()
    tags         = KBTagSerializer(many=True, read_only=True)

    def get_author_name(self, obj):
        return obj.author.full_name if obj.author else None

    def get_org_name(self, obj):
        return obj.client_org.name if obj.client_org else 'General / Walk-in'

    def get_linked_tickets(self, obj):
        request = self.context.get('request') if hasattr(self, 'context') else None
        if request is None or getattr(request.user, 'role', None) not in MSP_ROLES:
            return []
        return [
            {'id': str(lnk.ticket_id), 'ref': lnk.ticket.ticket_ref}
            for lnk in obj.ticket_links.select_related('ticket').all()
        ]

    class Meta:
        model  = KBArticle
        fields = [
            'id', 'category', 'document_type', 'title', 'content', 'status', 'visibility',
            'author_name', 'org_name', 'linked_tickets', 'folder_id', 'tags', 'created_at', 'updated_at',
        ]


class KBArticleWriteSerializer(serializers.Serializer):
    category   = serializers.ChoiceField(choices=['resolution', 'documentation', 'canned_response'], default='resolution')
    document_type = serializers.CharField(max_length=100, allow_blank=True, default='Article')
    title      = serializers.CharField(max_length=500)
    content    = serializers.CharField(allow_blank=True, default='')
    status     = serializers.ChoiceField(choices=['draft', 'published'], default='published')
    visibility = serializers.ChoiceField(choices=['internal', 'public'], default='internal')
    client_org_id = serializers.UUIDField(required=False, allow_null=True)
    folder_id  = serializers.UUIDField(required=False, allow_null=True)
    tags       = serializers.ListField(child=serializers.CharField(), required=False)


class KBArticleVersionListSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()
    preview         = serializers.SerializerMethodField()

    def get_created_by_name(self, obj):
        return obj.created_by.full_name if obj.created_by else None

    def get_preview(self, obj):
        import re
        text = re.sub(r'<[^>]+>', ' ', obj.content or '')
        text = re.sub(r'\s+', ' ', text).strip()
        return text[:140]

    class Meta:
        model  = KBArticleVersion
        fields = ['id', 'title', 'created_by_name', 'created_at', 'preview']


class KBArticleVersionDetailSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()

    def get_created_by_name(self, obj):
        return obj.created_by.full_name if obj.created_by else None

    class Meta:
        model  = KBArticleVersion
        fields = ['id', 'title', 'content', 'created_by_name', 'created_at']


class TicketKBLinkSerializer(serializers.ModelSerializer):
    ticket_ref = serializers.CharField(source='ticket.ticket_ref', read_only=True)
    article_title = serializers.CharField(source='article.title', read_only=True)

    class Meta:
        model  = TicketKBLink
        fields = ['id', 'ticket_id', 'ticket_ref', 'article_id', 'article_title', 'created_at']

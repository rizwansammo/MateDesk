from rest_framework import serializers
from .models import Ticket, Reply, Notification, Attachment, TimeLog, SupportGroup
from apps.users.permissions import MSP_ROLES, CLIENT_ROLES


class SupportGroupSerializer(serializers.ModelSerializer):
    ticket_count = serializers.SerializerMethodField()
    agents       = serializers.SerializerMethodField()

    def get_ticket_count(self, obj):
        return getattr(obj, 'ticket_count', obj.tickets.count())

    def get_agents(self, obj):
        return [
            {'id': str(a.id), 'full_name': a.full_name, 'role': a.role}
            for a in obj.agents.filter(is_active=True).order_by('first_name', 'last_name')
        ]

    class Meta:
        model  = SupportGroup
        fields = ['id', 'name', 'description', 'is_default', 'agents', 'ticket_count', 'created_at']


class AttachmentSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    def get_url(self, obj):
        request = self.context.get('request')
        path = f'/api/files/{obj.id}/'
        if request:
            return request.build_absolute_uri(path)
        return path

    class Meta:
        model  = Attachment
        fields = ['id', 'url', 'filename', 'size']


class NotificationSerializer(serializers.ModelSerializer):
    actor_name  = serializers.SerializerMethodField()
    ticket_ref  = serializers.SerializerMethodField()

    def get_actor_name(self, obj):
        return obj.actor.full_name if obj.actor else None

    def get_ticket_ref(self, obj):
        return obj.ticket.ticket_ref if obj.ticket else None

    class Meta:
        model  = Notification
        fields = ['id', 'notif_type', 'message', 'is_read', 'created_at', 'actor_name', 'ticket_ref', 'ticket_id']


class TimeLogSerializer(serializers.ModelSerializer):
    agent_name = serializers.SerializerMethodField()

    def get_agent_name(self, obj):
        return obj.agent.full_name if obj.agent else 'Unknown'

    class Meta:
        model  = TimeLog
        fields = ['id', 'agent_name', 'minutes', 'date', 'description', 'created_at']


class ReplySerializer(serializers.ModelSerializer):
    author_name     = serializers.SerializerMethodField()
    author_id       = serializers.SerializerMethodField()
    author_is_agent = serializers.SerializerMethodField()
    attachments     = AttachmentSerializer(many=True, read_only=True)

    author_email = serializers.SerializerMethodField()

    def get_author_name(self, obj):
        return obj.author.full_name if obj.author else 'System'

    def get_author_id(self, obj):
        return str(obj.author.id) if obj.author else None

    def get_author_is_agent(self, obj):
        return obj.author.is_msp_staff if obj.author else False

    def get_author_email(self, obj):
        return obj.author.email if obj.author else None

    class Meta:
        model  = Reply
        fields = ['id', 'type', 'body', 'body_html', 'author_name', 'author_id', 'author_email', 'author_is_agent', 'to_emails', 'cc_emails', 'created_at', 'attachments']


class TicketListSerializer(serializers.ModelSerializer):
    ref                        = serializers.CharField(source='ticket_ref', read_only=True)
    requester                  = serializers.SerializerMethodField()
    assignee                   = serializers.SerializerMethodField()
    assignee_id                = serializers.SerializerMethodField()
    client_org                 = serializers.SerializerMethodField()
    client_org_id              = serializers.SerializerMethodField()
    last_reply_author_is_agent = serializers.SerializerMethodField()
    from_email                 = serializers.SerializerMethodField()
    group_id                   = serializers.SerializerMethodField()
    group_name                 = serializers.SerializerMethodField()
    project_request_id         = serializers.SerializerMethodField()

    def get_project_request_id(self, obj):
        linked_id = getattr(obj, 'linked_project_request_id', None)
        return str(linked_id) if linked_id else None

    def get_requester(self, obj):
        return obj.requester_display

    def get_assignee(self, obj):
        return obj.assignee_display

    def get_assignee_id(self, obj):
        return str(obj.assignee_id) if obj.assignee_id else None

    def get_client_org(self, obj):
        return obj.client_org.name if obj.client_org else None

    def get_client_org_id(self, obj):
        return str(obj.client_org_id) if obj.client_org_id else None

    def get_from_email(self, obj):
        # Populated by Subquery annotation in TicketViewSet.list()
        val = getattr(obj, 'source_from_email', 'MISSING')
        if val == 'MISSING':
            src = obj.source_emails.order_by('processed_at').first()
            return src.from_email if src else None
        return val

    def get_group_id(self, obj):
        return str(obj.group_id) if obj.group_id else None

    def get_group_name(self, obj):
        return obj.group.name if obj.group_id and obj.group else None

    def get_last_reply_author_is_agent(self, obj):
        # Reads the author__role annotation added by TicketViewSet.list().
        # Falls back to a live query when the annotation is absent (e.g. tests).
        val = getattr(obj, 'last_reply_author_role', 'MISSING')
        if val == 'MISSING':
            last = obj.replies.filter(
                type__in=['public_reply', 'internal_note']
            ).order_by('-created_at').select_related('author').first()
            if last is None:
                return None
            return last.author.is_msp_staff if last.author else False
        if val is None:
            return None
        return val in MSP_ROLES

    class Meta:
        model  = Ticket
        fields = [
            'id', 'ref', 'subject', 'status', 'priority', 'level',
            'category', 'tags', 'requester', 'assignee', 'assignee_id',
            'client_org', 'client_org_id', 'from_email',
            'last_reply_author_is_agent', 'group_id', 'group_name',
            'sla_status', 'is_internal', 'project_request_id', 'created_at', 'updated_at',
        ]


class TicketDetailSerializer(serializers.ModelSerializer):
    ref              = serializers.CharField(source='ticket_ref', read_only=True)
    requester        = serializers.SerializerMethodField()
    assignee         = serializers.SerializerMethodField()
    client_org       = serializers.SerializerMethodField()
    secondary_agents = serializers.SerializerMethodField()
    replies          = serializers.SerializerMethodField()
    attachments      = AttachmentSerializer(many=True, read_only=True)
    timelogs         = serializers.SerializerMethodField()
    merge_info       = serializers.SerializerMethodField()
    linked_articles  = serializers.SerializerMethodField()
    group            = serializers.SerializerMethodField()

    def get_replies(self, obj):
        request = self.context.get('request')
        qs = obj.replies.prefetch_related('attachments').all()
        # Client-role users must not see internal notes
        if request and getattr(request.user, 'role', None) in CLIENT_ROLES:
            qs = qs.exclude(type='internal_note')
        return ReplySerializer(qs, many=True, context=self.context).data

    def get_requester(self, obj):
        if obj.requester:
            return {
                'id':        str(obj.requester.id),
                'full_name': obj.requester.full_name,
                'email':     obj.requester.email,
            }
        return {'id': None, 'full_name': obj.requester_name, 'email': ''}

    def get_assignee(self, obj):
        if obj.assignee:
            return {
                'id':        str(obj.assignee.id),
                'full_name': obj.assignee.full_name,
                'role':      obj.assignee.role,
            }
        return None

    def get_client_org(self, obj):
        if obj.client_org:
            return {'id': str(obj.client_org.id), 'name': obj.client_org.name, 'timezone': obj.client_org.timezone or ''}
        return None

    def get_secondary_agents(self, obj):
        return [
            {'id': str(a.id), 'full_name': a.full_name, 'role': a.role}
            for a in obj.secondary_agents.all()
        ]

    def get_timelogs(self, obj):
        return TimeLogSerializer(obj.timelogs.select_related('agent').all(), many=True).data

    def get_merge_info(self, obj):
        info = {'status': obj.merge_status}
        if obj.merge_status == 'secondary' and obj.merged_into:
            info['merged_into_ref']     = obj.merged_into.ticket_ref
            info['merged_into_subject'] = obj.merged_into.subject
        elif obj.merge_status == 'primary':
            info['absorbed_tickets'] = [
                {'ref': t.ticket_ref, 'subject': t.subject}
                for t in obj.absorbed_tickets.all()
            ]
        return info

    def get_linked_articles(self, obj):
        return [
            {'id': str(link.article.id), 'title': link.article.title}
            for link in obj.kb_links.select_related('article').all()
        ]

    def get_group(self, obj):
        if obj.group_id and obj.group:
            return {'id': str(obj.group.id), 'name': obj.group.name}
        return None

    source_cc_emails = serializers.SerializerMethodField()

    def get_source_cc_emails(self, obj):
        source = obj.source_emails.order_by('processed_at').first()
        if source:
            return source.cc_emails or []
        return []

    source_reply_to = serializers.SerializerMethodField()

    def get_source_reply_to(self, obj):
        """Provenance for a ticket opened via a trusted Reply-To — who actually
        sent the mail versus who it was sent on behalf of. None when the ticket
        came in normally, so the UI only shows it where it means something."""
        source = obj.source_emails.order_by('processed_at').first()
        if not source or not source.reply_to_email:
            return None
        return {
            'reply_to':   source.reply_to_email,
            'sent_by':    source.from_email,
            'raw_header': source.reply_to_raw,
        }

    sla_info = serializers.SerializerMethodField()

    def get_sla_info(self, obj):
        try:
            from apps.sla.services import get_matching_policy, _get_total_pause_minutes
            from datetime import timedelta
            policy = get_matching_policy(obj)
            if not policy:
                return None
            target = policy.targets.get(priority=obj.priority)
            pause_delta = timedelta(minutes=_get_total_pause_minutes(obj))
            first_response_due = obj.created_at + timedelta(minutes=target.first_response_minutes) + pause_delta
            resolution_due     = obj.created_at + timedelta(minutes=target.resolution_minutes)     + pause_delta
            return {
                'policy_name':        policy.name,
                'first_response_due': first_response_due.isoformat(),
                'resolution_due':     resolution_due.isoformat(),
            }
        except Exception:
            return None

    class Meta:
        model  = Ticket
        fields = [
            'id', 'ref', 'subject', 'description', 'description_html', 'status', 'priority', 'level',
            'category', 'tags', 'due_by', 'requester', 'assignee', 'secondary_agents',
            'client_org', 'group', 'replies', 'attachments', 'timelogs', 'merge_info',
            'linked_articles', 'sla_status', 'first_response_at', 'sla_info',
            'is_internal', 'source_cc_emails', 'source_reply_to',
            'created_at', 'updated_at', 'resolved_at',
        ]


class TicketCreateSerializer(serializers.Serializer):
    subject        = serializers.CharField(max_length=500)
    description    = serializers.CharField(required=False, allow_blank=True, default='')
    status         = serializers.ChoiceField(
        choices=['open', 'pending', 'in_progress', 'solved', 'closed'], default='open'
    )
    priority       = serializers.ChoiceField(
        choices=['low', 'normal', 'high', 'critical'], default='normal'
    )
    level          = serializers.ChoiceField(
        choices=['', 'L1', 'L2', 'L3'], required=False, allow_blank=True, default=''
    )
    category       = serializers.CharField(max_length=100, required=False, allow_blank=True, default='')
    tags           = serializers.ListField(
        child=serializers.CharField(max_length=50), required=False, default=list
    )
    is_internal    = serializers.BooleanField(required=False, default=False)
    client_org_id  = serializers.UUIDField(required=False, allow_null=True)
    requester_name = serializers.CharField(max_length=200, required=False, allow_blank=True, default='')
    assignee_id    = serializers.UUIDField(required=False, allow_null=True)
    due_by         = serializers.DateTimeField(required=False, allow_null=True)


class TicketUpdateSerializer(serializers.Serializer):
    subject       = serializers.CharField(max_length=500, required=False)
    description   = serializers.CharField(required=False, allow_blank=True)
    category      = serializers.CharField(max_length=100, required=False, allow_blank=True)
    status        = serializers.ChoiceField(
        choices=['open', 'pending', 'in_progress', 'waiting_on_customer', 'solved', 'closed'], required=False
    )
    priority      = serializers.ChoiceField(
        choices=['low', 'normal', 'high', 'critical'], required=False
    )
    level         = serializers.ChoiceField(
        choices=['', 'L1', 'L2', 'L3'], required=False, allow_blank=True
    )
    assignee_id   = serializers.UUIDField(required=False, allow_null=True)
    requester_id  = serializers.UUIDField(required=False, allow_null=True)
    client_org_id = serializers.UUIDField(required=False, allow_null=True)
    group_id      = serializers.UUIDField(required=False, allow_null=True)
    due_by        = serializers.DateTimeField(required=False, allow_null=True)


class ReplyCreateSerializer(serializers.Serializer):
    type = serializers.ChoiceField(
        choices=['public_reply', 'internal_note'], default='public_reply'
    )
    body = serializers.CharField()

"""Explicit input serializers prevent changing relationships through client payloads."""
from django.conf import settings
from rest_framework import serializers

from .models import Project, ProjectMember, ProjectMilestone, WorkItem, WorkItemComment


PROJECT_STATUSES = [item[0] for item in Project.STATUS]
PROJECT_VISIBILITY = [item[0] for item in Project.VISIBILITY]
MILESTONE_STATUSES = [item[0] for item in ProjectMilestone.STATUS]
MILESTONE_VISIBILITY = [item[0] for item in ProjectMilestone.VISIBILITY]
WORK_KINDS = [item[0] for item in WorkItem.KINDS]
WORK_STATUSES = [item[0] for item in WorkItem.STATUSES]
WORK_PRIORITIES = [item[0] for item in WorkItem.PRIORITIES]
WORK_VISIBILITY = [item[0] for item in WorkItem.VISIBILITY]
MEMBER_ROLES = [item[0] for item in ProjectMember.ROLES]


class ProjectReadSerializer(serializers.ModelSerializer):
    client_org_name = serializers.CharField(source='client_org.name', read_only=True)
    my_role = serializers.SerializerMethodField()
    can_manage = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()
    project_email_enabled = serializers.SerializerMethodField()
    status_indicator = serializers.SerializerMethodField()

    def get_status_indicator(self, obj):
        cached = self.context.get('status_indicators')
        if cached is not None:
            return cached.get(obj.pk)
        from .lifecycle import project_status_indicator
        return project_status_indicator(obj)

    def get_project_email_enabled(self, obj):
        return bool(settings.PROJECT_EMAIL_REPLIES_ENABLED)

    def get_my_role(self, obj):
        request = self.context.get('request')
        if request is None or not request.user.is_authenticated:
            return None
        return obj.members.filter(user=request.user).values_list('role', flat=True).first()

    def get_can_manage(self, obj):
        request = self.context.get('request')
        if request is None or not request.user.is_authenticated:
            return False
        from .permissions import can_manage_project
        return can_manage_project(request.user, obj)

    def get_can_edit(self, obj):
        request = self.context.get('request')
        if request is None or not request.user.is_authenticated:
            return False
        from .permissions import can_edit_work
        return can_edit_work(request.user, obj)

    class Meta:
        model = Project
        fields = [
            'id', 'client_org', 'client_org_name', 'key', 'name', 'description',
            'my_role', 'can_manage', 'can_edit', 'project_email_enabled',
            'status', 'status_indicator', 'visibility', 'start_date', 'due_date', 'completed_at', 'archived_at', 'reopened_at', 'created_at', 'updated_at',
        ]


class ProjectCreateSerializer(serializers.Serializer):
    client_org_id = serializers.UUIDField()
    key = serializers.RegexField(r'^[A-Za-z0-9]{2,12}$', max_length=12)
    name = serializers.CharField(max_length=200)
    description = serializers.CharField(required=False, allow_blank=True, default='')
    status = serializers.ChoiceField(choices=PROJECT_STATUSES, required=False, default='planned')
    visibility = serializers.ChoiceField(choices=PROJECT_VISIBILITY, required=False, default='internal')
    start_date = serializers.DateField(required=False, allow_null=True, default=None)
    due_date = serializers.DateField(required=False, allow_null=True, default=None)

    def validate_key(self, value):
        return value.upper()


class ProjectUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=200, required=False)
    description = serializers.CharField(required=False, allow_blank=True)
    status = serializers.ChoiceField(choices=PROJECT_STATUSES, required=False)
    visibility = serializers.ChoiceField(choices=PROJECT_VISIBILITY, required=False)
    start_date = serializers.DateField(required=False, allow_null=True)
    due_date = serializers.DateField(required=False, allow_null=True)


class ProjectMemberReadSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.full_name', read_only=True)
    user_email = serializers.EmailField(source='user.email', read_only=True)

    class Meta:
        model = ProjectMember
        fields = ['id', 'user', 'user_name', 'user_email', 'role', 'created_at']


class ProjectMemberWriteSerializer(serializers.Serializer):
    user_id = serializers.UUIDField()
    role = serializers.ChoiceField(choices=MEMBER_ROLES)


class ProjectMilestoneReadSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProjectMilestone
        fields = ['id', 'name', 'description', 'status', 'visibility', 'start_date', 'due_date', 'position', 'created_at', 'updated_at']


class ProjectMilestoneWriteSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=200, required=False)
    description = serializers.CharField(allow_blank=True, required=False)
    status = serializers.ChoiceField(choices=MILESTONE_STATUSES, required=False)
    visibility = serializers.ChoiceField(choices=MILESTONE_VISIBILITY, required=False)
    start_date = serializers.DateField(allow_null=True, required=False)
    due_date = serializers.DateField(allow_null=True, required=False)
    position = serializers.IntegerField(min_value=0, required=False)


class WorkItemReadSerializer(serializers.ModelSerializer):
    ref = serializers.ReadOnlyField()
    milestone_id = serializers.SerializerMethodField()
    estimated_minutes = serializers.SerializerMethodField()
    assignee_id = serializers.UUIDField(read_only=True)
    assignee_name = serializers.CharField(source='assignee.full_name', read_only=True, allow_null=True)
    is_blocked = serializers.SerializerMethodField()
    blocked_by_count = serializers.SerializerMethodField()
    checklist_total = serializers.SerializerMethodField()
    checklist_completed = serializers.SerializerMethodField()

    def _client_request(self):
        request = self.context.get('request')
        if request is None:
            return False
        from apps.users.permissions import CLIENT_ROLES
        return request.user.role in CLIENT_ROLES

    def get_milestone_id(self, obj):
        if not obj.milestone_id:
            return None
        if self._client_request() and obj.milestone.visibility != 'client':
            # A public Work Item may be attached to an internal Milestone.
            # Never expose the internal Milestone UUID via the legacy API.
            return None
        return str(obj.milestone_id)

    def get_estimated_minutes(self, obj):
        # Estimated effort is internal staff planning data, not Client metadata.
        return None if self._client_request() else obj.estimated_minutes

    def _progress(self, obj):
        cached = getattr(obj, '_advanced_progress', None)
        if cached is not None:
            return cached
        links = list(obj.dependency_edges.all())
        unfinished = [
            edge for edge in links if edge.prerequisite.status != 'done'
        ] if obj.status not in ('done', 'cancelled') else []
        all_entries = list(obj.checklist_entries.all())
        request = self.context.get('request')
        is_client = False
        if request is not None:
            from apps.users.permissions import CLIENT_ROLES
            is_client = request.user.role in CLIENT_ROLES
            if is_client:
                all_entries = [entry for entry in all_entries if entry.visibility == 'client']
        progress = {
            'is_blocked': bool(unfinished),
            # Client sees the generic indicator, not the number of hidden staff Tasks.
            'blocked_by_count': sum(
                1 for edge in unfinished if not is_client or edge.prerequisite.visibility == 'client'
            ),
            'checklist_total': len(all_entries),
            'checklist_completed': sum(1 for entry in all_entries if entry.is_done),
        }
        obj._advanced_progress = progress
        return progress

    def get_is_blocked(self, obj):
        return self._progress(obj)['is_blocked']

    def get_blocked_by_count(self, obj):
        # No prerequisite titles, IDs, or confidential checklist text exposed.
        return self._progress(obj)['blocked_by_count']

    def get_checklist_total(self, obj):
        return self._progress(obj)['checklist_total']

    def get_checklist_completed(self, obj):
        return self._progress(obj)['checklist_completed']

    class Meta:
        model = WorkItem
        fields = [
            'id', 'project', 'ref', 'number', 'milestone_id',
            'title', 'description', 'kind', 'status', 'priority', 'visibility',
            'assignee_id', 'assignee_name', 'start_date', 'due_date', 'estimated_minutes', 'position',
            'is_blocked', 'blocked_by_count', 'checklist_total', 'checklist_completed',
            'created_at', 'updated_at',
        ]


class WorkItemWriteSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=300, required=False)
    description = serializers.CharField(allow_blank=True, required=False)
    kind = serializers.ChoiceField(choices=WORK_KINDS, required=False)
    status = serializers.ChoiceField(choices=WORK_STATUSES, required=False)
    priority = serializers.ChoiceField(choices=WORK_PRIORITIES, required=False)
    estimated_minutes = serializers.IntegerField(min_value=0, max_value=1000000, required=False)
    visibility = serializers.ChoiceField(choices=WORK_VISIBILITY, required=False)
    milestone_id = serializers.UUIDField(allow_null=True, required=False)
    assignee_id = serializers.UUIDField(allow_null=True, required=False)
    start_date = serializers.DateField(allow_null=True, required=False)
    due_date = serializers.DateField(allow_null=True, required=False)
    position = serializers.IntegerField(min_value=0, required=False)


class WorkItemCommentReadSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source='author.full_name', read_only=True, allow_null=True)
    source = serializers.SerializerMethodField()

    def get_source(self, obj):
        return 'email' if hasattr(obj, 'email_reply') else 'web'

    class Meta:
        model = WorkItemComment
        fields = ['id', 'author', 'author_name', 'body', 'visibility', 'source', 'created_at']


class WorkItemCommentWriteSerializer(serializers.Serializer):
    body = serializers.CharField(max_length=10000, trim_whitespace=True)
    visibility = serializers.ChoiceField(choices=['internal', 'client'], required=False)

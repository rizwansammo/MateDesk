import uuid
from django.db import models

class AgentTodo(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='agent_todos')
    agent = models.ForeignKey('users.User', on_delete=models.CASCADE, related_name='todos')
    text = models.CharField(max_length=500)
    completed = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'agent_todos'
        ordering = ['created_at']

class Announcement(models.Model):
    MODES = [('all', 'All Agents'), ('specific', 'Specific Agents')]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='announcements')
    created_by = models.ForeignKey('users.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    title = models.CharField(max_length=200)
    body = models.TextField()
    recipient_mode = models.CharField(max_length=20, choices=MODES, default='all')
    recipients = models.ManyToManyField('users.User', blank=True, related_name='received_announcements')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'announcements'
        ordering = ['-created_at']

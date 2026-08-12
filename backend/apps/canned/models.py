import uuid
from django.db import models


class CannedCategory(models.Model):
    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant     = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='canned_categories')
    name       = models.CharField(max_length=100)
    created_by = models.ForeignKey('users.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table        = 'canned_categories'
        ordering        = ['name']
        unique_together = [('tenant', 'name')]

    def __str__(self):
        return self.name


class CannedResponse(models.Model):
    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant     = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='canned_responses')
    category   = models.ForeignKey(CannedCategory, on_delete=models.CASCADE, related_name='responses')
    title      = models.CharField(max_length=200)
    body       = models.TextField()
    created_by = models.ForeignKey('users.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'canned_responses'
        ordering = ['title']

    def __str__(self):
        return self.title

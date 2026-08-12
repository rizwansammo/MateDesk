import uuid
from django.db import models


CATEGORY_CHOICES = [
    ('resolution',      'Resolution'),
    ('documentation',   'Documentation'),
    ('canned_response', 'Canned Response'),
]

STATUS_CHOICES = [
    ('draft',     'Draft'),
    ('published', 'Published'),
]

VISIBILITY_CHOICES = [
    ('internal', 'Internal'),
    ('public',   'Public'),
]


class KBTag(models.Model):
    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant     = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='kb_tags')
    name       = models.CharField(max_length=100)
    color      = models.CharField(max_length=20, blank=True, default='#64748b')

    class Meta:
        db_table = 'kb_tags'
        unique_together = [['tenant', 'name']]

    def __str__(self):
        return self.name


class KBFolder(models.Model):
    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant     = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='kb_folders')
    name       = models.CharField(max_length=255)
    parent     = models.ForeignKey('self', on_delete=models.CASCADE, null=True, blank=True, related_name='subfolders')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'kb_folders'
        ordering = ['name']

    def __str__(self):
        return self.name


class KBArticle(models.Model):
    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant     = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='kb_articles')
    category   = models.CharField(max_length=30, choices=CATEGORY_CHOICES, default='resolution')
    title      = models.CharField(max_length=500)
    content    = models.TextField(blank=True)
    status     = models.CharField(max_length=20, choices=STATUS_CHOICES, default='published')
    visibility = models.CharField(max_length=20, choices=VISIBILITY_CHOICES, default='internal')
    document_type = models.CharField(max_length=100, blank=True, default='Article')
    folder     = models.ForeignKey(KBFolder, on_delete=models.CASCADE, null=True, blank=True, related_name='articles')
    tags       = models.ManyToManyField(KBTag, blank=True, related_name='articles')
    author     = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='kb_articles',
    )
    client_org = models.ForeignKey(
        'tenants.ClientOrganization', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='kb_articles',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'kb_articles'
        ordering = ['-created_at']

    def __str__(self):
        return self.title


class TicketKBLink(models.Model):
    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ticket     = models.ForeignKey('tickets.Ticket', on_delete=models.CASCADE, related_name='kb_links')
    article    = models.ForeignKey(KBArticle, on_delete=models.CASCADE, related_name='ticket_links')
    linked_by  = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='kb_links_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table        = 'kb_ticket_links'
        unique_together = [['ticket', 'article']]
        ordering        = ['-created_at']

    def __str__(self):
        return f'{self.ticket.ticket_ref} ↔ {self.article.title}'


class KBArticleVersion(models.Model):
    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    article    = models.ForeignKey(KBArticle, on_delete=models.CASCADE, related_name='versions')
    title      = models.CharField(max_length=500)
    content    = models.TextField(blank=True)
    created_by = models.ForeignKey('users.User', on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'kb_article_versions'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.article.title} - v{self.created_at}'

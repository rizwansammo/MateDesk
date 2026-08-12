import uuid
from django.db import models

PLAN_STARTER      = 'starter'
PLAN_PROFESSIONAL = 'professional'
PLAN_ENTERPRISE   = 'enterprise'

PLAN_CHOICES = [
    (PLAN_STARTER,      'Starter'),
    (PLAN_PROFESSIONAL, 'Professional'),
    (PLAN_ENTERPRISE,   'Enterprise'),
]

STATUS_CHOICES = [
    ('active',    'Active'),
    ('trial',     'Trial'),
    ('suspended', 'Suspended'),
    ('cancelled', 'Cancelled'),
]

BILLING_STATUS_CHOICES = [
    ('paid',      'Paid'),
    ('past_due',  'Past Due'),
    ('trial',     'Trial'),
    ('cancelled', 'Cancelled'),
]


class Tenant(models.Model):
    id            = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name          = models.CharField(max_length=200)
    slug          = models.SlugField(unique=True, max_length=63)  # becomes the subdomain
    plan          = models.CharField(max_length=30, choices=PLAN_CHOICES, default=PLAN_STARTER)
    is_active     = models.BooleanField(default=True)
    created_at    = models.DateTimeField(auto_now_add=True)
    # Branding
    primary_color = models.CharField(max_length=7, default='#2563eb')
    logo          = models.ImageField(upload_to='tenant_logos/', null=True, blank=True)
    # Contact / identity
    timezone      = models.CharField(max_length=64, default='UTC')
    support_email = models.EmailField(blank=True)
    phone         = models.CharField(max_length=30, blank=True)
    address       = models.TextField(blank=True)
    website       = models.URLField(blank=True)
    # SaaS / Platform Admin fields
    status              = models.CharField(max_length=20, choices=STATUS_CHOICES, default='trial')
    trial_ends_at       = models.DateField(null=True, blank=True)
    renewal_date        = models.DateField(null=True, blank=True)
    billing_status      = models.CharField(max_length=20, choices=BILLING_STATUS_CHOICES, default='trial')
    mateconnect_enabled    = models.BooleanField(default=False)
    matedesk_enabled       = models.BooleanField(default=True)
    max_organizations      = models.PositiveIntegerField(null=True, blank=True)
    max_users              = models.PositiveIntegerField(null=True, blank=True)
    max_tickets            = models.PositiveIntegerField(null=True, blank=True)
    max_devices            = models.PositiveIntegerField(null=True, blank=True)
    deletion_scheduled_at  = models.DateTimeField(null=True, blank=True)
    # Platform-controlled branding (logo sizes, custom text, etc.)
    branding            = models.JSONField(default=dict, blank=True)
    branding_md_logo    = models.ImageField(upload_to='branding/md/', null=True, blank=True)
    branding_mc_logo    = models.ImageField(upload_to='branding/mc/', null=True, blank=True)

    class Meta:
        db_table = 'tenants'

    def __str__(self):
        return f'{self.name} ({self.slug})'


class ClientOrganization(models.Model):
    id            = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant        = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='client_orgs')
    name          = models.CharField(max_length=200)
    domain        = models.CharField(max_length=200, blank=True)  # used for email-to-ticket routing
    contact_name  = models.CharField(max_length=200, blank=True)
    contact_email = models.EmailField(blank=True)
    phone         = models.CharField(max_length=30, blank=True)
    address       = models.TextField(blank=True)
    timezone       = models.CharField(max_length=64, blank=True, default='UTC')
    business_hours = models.JSONField(default=dict, blank=True)
    is_active      = models.BooleanField(default=True)
    created_at     = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table    = 'client_organizations'
        unique_together = [['tenant', 'name']]

    def __str__(self):
        return f'{self.name} [{self.tenant.slug}]'

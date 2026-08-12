from django.db import models
import uuid

ACTION_CHOICES = [
    ('tenant_created', 'Tenant Created'),
    ('tenant_updated', 'Tenant Updated'),
    ('tenant_deactivated', 'Tenant Deactivated'),
    ('tenant_reactivated', 'Tenant Reactivated'),
    ('tenant_deletion_scheduled', 'Tenant Deletion Scheduled'),
    ('tenant_deletion_cancelled', 'Tenant Deletion Cancelled'),
    ('tenant_deleted', 'Tenant Deleted'),
    ('plan_changed', 'Plan Changed'),
    ('subscription_updated', 'Subscription Updated'),
    ('owner_password_reset', 'Owner Password Reset'),
    ('admin_created', 'Admin Account Created'),
    ('admin_updated', 'Admin Account Updated'),
    ('admin_deactivated', 'Admin Account Deactivated'),
    ('admin_password_reset', 'Admin Password Reset'),
    ('msp_owner_password_reset', 'MSP Owner Password Reset'),
    ('mateconnect_enabled', 'MateConnect Enabled'),
    ('mateconnect_disabled', 'MateConnect Disabled'),
    ('platform_settings_updated', 'Platform Settings Updated'),
    ('plan_updated', 'Plan Updated'),
    ('admin_login', 'Admin Login'),
    ('admin_login_failed', 'Admin Login Failed'),
    ('admin_logout', 'Admin Logout'),
]


class PlatformSettings(models.Model):
    platform_name  = models.CharField(max_length=200, default='MateDesk')
    company_name   = models.CharField(max_length=200, default='NetaMate Solutions')
    version        = models.CharField(max_length=50, default='v2.0')
    platform_url   = models.CharField(max_length=200, default='matedesk.app')
    admin_panel_url = models.CharField(max_length=200, default='/platform-admin/')
    environment    = models.CharField(max_length=50, default='Production')
    operator       = models.CharField(max_length=200, default='NetaMate Solutions')
    support_email  = models.EmailField(default='support@netamate.com')
    status_text    = models.CharField(max_length=100, default='All Systems Operational')
    build_info     = models.CharField(max_length=200, default='MateDesk v2.0 — Django 4.x')
    email_poll_interval = models.IntegerField(
        default=60,
        choices=[(30, '30 seconds'), (60, '1 minute'), (120, '2 minutes'), (300, '5 minutes')],
    )
    # SMTP for Platform Admin emails (OTP codes, etc.)
    admin_smtp_host       = models.CharField(max_length=255, blank=True, default='')
    admin_smtp_port       = models.PositiveIntegerField(default=587)
    admin_smtp_username   = models.CharField(max_length=255, blank=True, default='')
    admin_smtp_password   = models.CharField(max_length=512, blank=True, default='')
    admin_smtp_use_tls    = models.BooleanField(default=True)
    admin_smtp_from_email = models.CharField(max_length=255, blank=True, default='')
    admin_smtp_from_name  = models.CharField(max_length=200, blank=True, default='MateDesk Admin')
    updated_at     = models.DateTimeField(auto_now=True)
    updated_by     = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='+'
    )

    class Meta:
        verbose_name = 'Platform Settings'

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(id=1)
        return obj


class PlatformPlan(models.Model):
    PLAN_CHOICES = [
        ('starter', 'Starter'),
        ('professional', 'Professional'),
        ('enterprise', 'Enterprise'),
    ]
    plan_key      = models.CharField(max_length=30, unique=True, choices=PLAN_CHOICES)
    name          = models.CharField(max_length=100)
    tagline       = models.CharField(max_length=500)
    price         = models.CharField(max_length=20)
    price_monthly = models.CharField(max_length=20, default='')
    annual_note   = models.CharField(max_length=200, default='')
    features      = models.JSONField(default=list)
    is_featured   = models.BooleanField(default=False)
    sort_order    = models.PositiveIntegerField(default=0)
    updated_at    = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['sort_order']

    def __str__(self):
        return self.name


class AdminActionLog(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    actor = models.ForeignKey(
        'users.User', on_delete=models.SET_NULL, null=True,
        related_name='admin_actions'
    )
    actor_email = models.CharField(max_length=255, blank=True)  # denormalized for history
    action = models.CharField(max_length=50, choices=ACTION_CHOICES)
    target_type = models.CharField(max_length=50, blank=True)
    target_id = models.CharField(max_length=100, blank=True)
    target_label = models.CharField(max_length=255, blank=True)
    target_tenant = models.ForeignKey(
        'tenants.Tenant', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='+'
    )
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    details = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Admin Action Log'
        verbose_name_plural = 'Admin Action Logs'

    def __str__(self):
        return f'{self.actor_email} — {self.action} at {self.created_at}'

    def get_action_display_label(self):
        for code, label in ACTION_CHOICES:
            if code == self.action:
                return label
        return self.action


class PlatformAdminOTP(models.Model):
    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user       = models.ForeignKey('users.User', on_delete=models.CASCADE, related_name='admin_otps')
    code       = models.CharField(max_length=6)
    expires_at = models.DateTimeField()
    is_used    = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

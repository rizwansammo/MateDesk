import uuid
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.db import models

from .managers import UserManager
from .permissions import ROLE_CHOICES, ROLE_END_USER, MSP_ROLES


class User(AbstractBaseUser, PermissionsMixin):
    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # tenant is nullable so platform superusers (NetaMate staff) can exist without a tenant
    tenant     = models.ForeignKey(
        'tenants.Tenant',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='users',
    )
    email      = models.EmailField()
    first_name = models.CharField(max_length=100)
    last_name  = models.CharField(max_length=100, blank=True)
    role       = models.CharField(max_length=30, choices=ROLE_CHOICES, default=ROLE_END_USER)
    client_org = models.ForeignKey(
        'tenants.ClientOrganization',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='users',
    )
    is_active   = models.BooleanField(default=True)
    is_staff    = models.BooleanField(default=False)  # Django admin access (platform staff only)
    date_joined = models.DateTimeField(auto_now_add=True)
    job_title        = models.CharField(max_length=100, blank=True)
    department       = models.CharField(max_length=100, blank=True)
    phone            = models.CharField(max_length=30, blank=True)
    employee_id      = models.CharField(max_length=100, blank=True)
    reports_to       = models.CharField(max_length=100, blank=True)
    business_impact  = models.CharField(max_length=200, blank=True)
    deleted_org_name = models.CharField(max_length=200, blank=True)
    is_vip           = models.BooleanField(default=False)
    totp_enabled     = models.BooleanField(default=False)
    email_2fa_enabled = models.BooleanField(default=False)
    totp_secret      = models.CharField(max_length=64, blank=True, default='')

    @property
    def two_fa_enabled(self):
        return self.totp_enabled or self.email_2fa_enabled

    objects = UserManager()

    USERNAME_FIELD  = 'email'
    REQUIRED_FIELDS = ['first_name']

    class Meta:
        db_table = 'users'
        constraints = [
            models.UniqueConstraint(fields=['tenant', 'email'], name='unique_email_per_tenant'),
        ]

    def __str__(self):
        tenant_slug = self.tenant.slug if self.tenant else 'platform'
        return f'{self.email} [{tenant_slug}]'

    @property
    def full_name(self) -> str:
        return f'{self.first_name} {self.last_name}'.strip()

    @property
    def is_msp_staff(self) -> bool:
        return self.role in MSP_ROLES

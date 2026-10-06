from django.contrib.auth import authenticate
from django.db import transaction
from django.utils.text import slugify
from rest_framework import serializers, exceptions
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.tokens import RefreshToken

from apps.tenants.domains import RESERVED_PLATFORM_SLUGS


class TenantTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    Extends SimpleJWT's default serializer to:
    - Accept an optional `tenant_slug` in the request body (used on localhost / dev)
    - Fall back to `request.tenant` resolved by TenantMiddleware (production subdomain)
    - Embed `tenant_id`, `role`, `email`, `full_name` in the JWT payload
    - Return a `user` object alongside the tokens for immediate frontend hydration
    """

    tenant_slug = serializers.CharField(required=False, write_only=True)

    def validate(self, attrs):
        request = self.context.get('request')
        tenant = getattr(request, 'tenant', None)

        email    = attrs.get('email') or attrs.get(self.username_field, '')
        password = attrs.get('password', '')

        if tenant is None:
            slug = attrs.pop('tenant_slug', None)
            if slug:
                # Explicit slug provided (dev mode / legacy)
                from apps.tenants.models import Tenant
                try:
                    tenant = Tenant.objects.get(slug=slug, is_active=True)
                except Tenant.DoesNotExist:
                    raise exceptions.AuthenticationFailed('Invalid email or password.')
            else:
                # Email-only login: resolve tenant from email globally
                from apps.users.models import User as UserModel
                try:
                    resolved = UserModel.objects.select_related('tenant').get(
                        email=email, is_active=True, tenant__isnull=False
                    )
                    if not resolved.tenant.is_active:
                        raise exceptions.AuthenticationFailed('Invalid email or password.')
                    tenant = resolved.tenant
                except UserModel.DoesNotExist:
                    raise exceptions.AuthenticationFailed('Invalid email or password.')
                except UserModel.MultipleObjectsReturned:
                    # Same email exists in multiple tenants — require an explicit workspace.
                    raise exceptions.AuthenticationFailed(
                        'Multiple accounts found for this email. Please sign in via your workspace URL.'
                    )
        else:
            attrs.pop('tenant_slug', None)

        user = authenticate(request=request, email=email, password=password, tenant=tenant)
        if not user:
            raise exceptions.AuthenticationFailed('Invalid email or password.')

        refresh = self.get_token(user)
        return {
            'refresh': str(refresh),
            'access':  str(refresh.access_token),
            'user': {
                'id':          str(user.id),
                'email':       user.email,
                'full_name':   user.full_name,
                'role':        user.role,
                'tenant_id':   str(user.tenant_id),
                'tenant_slug': user.tenant.slug,
                'tenant_name': user.tenant.name,
                'job_title':   user.job_title,
                'department':  user.department,
            },
        }

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['tenant_id']  = str(user.tenant_id) if user.tenant_id else None
        token['role']       = user.role
        token['email']      = user.email
        token['full_name']  = user.full_name
        return token


class TenantRegisterSerializer(serializers.Serializer):
    company_name = serializers.CharField(max_length=200)
    owner_name   = serializers.CharField(max_length=201)
    email        = serializers.EmailField()
    password     = serializers.CharField(min_length=8, write_only=True)
    tenant_slug  = serializers.CharField(max_length=30, required=False, allow_blank=True)

    def _unique_slug(self, base: str) -> str:
        from apps.tenants.models import Tenant
        slug = slugify(base)[:60] or 'workspace'
        candidate, n = slug, 2
        while (
            candidate in RESERVED_PLATFORM_SLUGS
            or Tenant.objects.filter(slug=candidate).exists()
        ):
            candidate = f'{slug}-{n}'
            n += 1
        return candidate

    def validate_tenant_slug(self, value: str) -> str:
        import re
        if not value:
            return value
        value = value.lower().strip()
        if not re.match(r'^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$|^[a-z0-9]{3,30}$', value):
            raise serializers.ValidationError(
                'Slug must be 3–30 characters: lowercase letters, digits, and hyphens only.'
            )
        if value in RESERVED_PLATFORM_SLUGS:
            raise serializers.ValidationError('This workspace slug is reserved by the platform.')
        from apps.tenants.models import Tenant
        if Tenant.objects.filter(slug=value).exists():
            raise serializers.ValidationError('This workspace slug is already taken.')
        return value

    def validate_email(self, value):
        value = value.lower()
        from apps.users.models import User
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError('An account with this email already exists.')
        return value

    @transaction.atomic
    def create(self, validated_data):
        from apps.tenants.models import Tenant
        from apps.users.models import User
        from apps.users.permissions import ROLE_MSP_OWNER

        company_name = validated_data['company_name']
        owner_name   = validated_data['owner_name'].strip()
        email        = validated_data['email']
        password     = validated_data['password']
        # Use the user-supplied slug if provided; otherwise derive from company name
        slug         = validated_data.get('tenant_slug') or self._unique_slug(company_name)

        parts      = owner_name.split(' ', 1)
        first_name = parts[0]
        last_name  = parts[1] if len(parts) > 1 else ''

        tenant = Tenant.objects.create(
            name=company_name,
            slug=slug,
        )
        user = User.objects.create_user(
            email=email,
            password=password,
            tenant=tenant,
            first_name=first_name,
            last_name=last_name,
            role=ROLE_MSP_OWNER,
        )

        # Bootstrap every new tenant with a Walk-In org (for email-sourced tickets
        # from senders whose domain doesn't match any known client organization)
        from apps.tenants.models import ClientOrganization
        ClientOrganization.objects.create(tenant=tenant, name='Walk-In', is_active=True)

        # Create blank email settings row so the settings page always finds one
        from apps.email_ingestion.models import TenantEmailSettings
        TenantEmailSettings.objects.create(tenant=tenant)

        refresh = TenantTokenObtainPairSerializer.get_token(user)
        return {
            'refresh': str(refresh),
            'access':  str(refresh.access_token),
            'user': {
                'id':          str(user.id),
                'email':       user.email,
                'full_name':   user.full_name,
                'role':        user.role,
                'tenant_id':   str(user.tenant_id),
                'tenant_slug': tenant.slug,
                'tenant_name': tenant.name,
                'job_title':   user.job_title,
                'department':  user.department,
            },
        }


class BetaApplicationSerializer(serializers.Serializer):
    company_name   = serializers.CharField(max_length=200)
    owner_name     = serializers.CharField(max_length=201)
    email          = serializers.EmailField()
    requested_slug = serializers.CharField(max_length=30)

    def validate_email(self, value):
        from apps.platform_admin.models import BetaApplication
        from apps.users.models import User

        value = value.strip().lower()
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError('An account with this email already exists.')
        if BetaApplication.objects.filter(email=value).exists():
            raise serializers.ValidationError('An application with this email has already been submitted.')
        return value

    def validate_requested_slug(self, value):
        import re
        from apps.platform_admin.models import BetaApplication
        from apps.tenants.models import Tenant

        value = value.lower().strip()
        if not re.match(r'^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$|^[a-z0-9]{3,30}
    id          = serializers.UUIDField()
    email       = serializers.EmailField()
    full_name   = serializers.CharField()
    role        = serializers.CharField()
    tenant_id   = serializers.UUIDField(allow_null=True)
    tenant_slug = serializers.SerializerMethodField()
    tenant_name = serializers.SerializerMethodField()
    job_title   = serializers.CharField()
    department  = serializers.CharField()
    phone       = serializers.CharField()
    date_joined = serializers.DateTimeField()

    def get_tenant_slug(self, obj):
        return obj.tenant.slug if obj.tenant else None

    def get_tenant_name(self, obj):
        return obj.tenant.name if obj.tenant else None
, value):
            raise serializers.ValidationError(
                'Subdomain must be 3–30 characters: lowercase letters, digits, and hyphens only.'
            )
        if value in RESERVED_PLATFORM_SLUGS:
            raise serializers.ValidationError('This workspace subdomain is reserved by the platform.')
        if Tenant.objects.filter(slug=value).exists():
            raise serializers.ValidationError('This workspace subdomain is already taken.')
        if BetaApplication.objects.filter(requested_slug=value).exists():
            raise serializers.ValidationError('This workspace subdomain has already been requested.')
        return value

    def create(self, validated_data):
        from apps.platform_admin.models import BetaApplication
        return BetaApplication.objects.create(**validated_data)


class UserMeSerializer(serializers.Serializer):
    id          = serializers.UUIDField()
    email       = serializers.EmailField()
    full_name   = serializers.CharField()
    role        = serializers.CharField()
    tenant_id   = serializers.UUIDField(allow_null=True)
    tenant_slug = serializers.SerializerMethodField()
    tenant_name = serializers.SerializerMethodField()
    job_title   = serializers.CharField()
    department  = serializers.CharField()
    phone       = serializers.CharField()
    date_joined = serializers.DateTimeField()

    def get_tenant_slug(self, obj):
        return obj.tenant.slug if obj.tenant else None

    def get_tenant_name(self, obj):
        return obj.tenant.name if obj.tenant else None

from django.contrib import admin
from .models import Tenant, ClientOrganization


@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    list_display  = ('name', 'slug', 'plan', 'is_active', 'created_at')
    list_filter   = ('plan', 'is_active')
    search_fields = ('name', 'slug', 'support_email')
    readonly_fields = ('id', 'created_at')
    prepopulated_fields = {'slug': ('name',)}


@admin.register(ClientOrganization)
class ClientOrganizationAdmin(admin.ModelAdmin):
    list_display  = ('name', 'tenant', 'contact_email', 'is_active', 'created_at')
    list_filter   = ('is_active', 'tenant')
    search_fields = ('name', 'domain', 'contact_email')
    readonly_fields = ('id', 'created_at')

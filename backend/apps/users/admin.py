from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display   = ('email', 'full_name', 'tenant', 'role', 'is_active', 'date_joined')
    list_filter    = ('role', 'is_active', 'tenant')
    search_fields  = ('email', 'first_name', 'last_name')
    ordering       = ('-date_joined',)
    readonly_fields = ('id', 'date_joined')

    fieldsets = (
        (None, {'fields': ('id', 'email', 'password')}),
        ('Identity', {'fields': ('first_name', 'last_name', 'job_title', 'department', 'phone')}),
        ('Tenant', {'fields': ('tenant', 'role', 'client_org')}),
        ('Access', {'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
        ('Dates', {'fields': ('date_joined', 'last_login')}),
    )

    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('email', 'first_name', 'tenant', 'role', 'password1', 'password2'),
        }),
    )

# Generated migration for AdminActionLog

import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('tenants', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='AdminActionLog',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('actor_email', models.CharField(blank=True, max_length=255)),
                ('action', models.CharField(choices=[
                    ('tenant_created', 'Tenant Created'),
                    ('tenant_updated', 'Tenant Updated'),
                    ('tenant_deactivated', 'Tenant Deactivated'),
                    ('tenant_reactivated', 'Tenant Reactivated'),
                    ('plan_changed', 'Plan Changed'),
                    ('owner_password_reset', 'Owner Password Reset'),
                    ('admin_created', 'Admin Account Created'),
                    ('admin_deactivated', 'Admin Account Deactivated'),
                    ('mateconnect_enabled', 'MateConnect Enabled'),
                    ('mateconnect_disabled', 'MateConnect Disabled'),
                    ('admin_login', 'Admin Login'),
                    ('admin_login_failed', 'Admin Login Failed'),
                    ('admin_logout', 'Admin Logout'),
                ], max_length=50)),
                ('target_type', models.CharField(blank=True, max_length=50)),
                ('target_id', models.CharField(blank=True, max_length=100)),
                ('target_label', models.CharField(blank=True, max_length=255)),
                ('ip_address', models.GenericIPAddressField(blank=True, null=True)),
                ('details', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('actor', models.ForeignKey(
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='admin_actions',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('target_tenant', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='+',
                    to='tenants.tenant',
                )),
            ],
            options={
                'verbose_name': 'Admin Action Log',
                'verbose_name_plural': 'Admin Action Logs',
                'ordering': ['-created_at'],
            },
        ),
    ]

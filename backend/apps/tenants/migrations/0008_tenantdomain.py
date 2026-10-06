# Generated for MateDesk native custom-domain support.
from django.db import migrations, models
import django.db.models.deletion
import apps.tenants.models
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('tenants', '0007_clientorganization_business_hours'),
    ]

    operations = [
        migrations.CreateModel(
            name='TenantDomain',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('domain', models.CharField(max_length=253, unique=True)),
                ('verification_token', models.CharField(default=apps.tenants.models.generate_domain_verification_token, editable=False, max_length=64, unique=True)),
                ('status', models.CharField(choices=[('pending', 'Pending DNS'), ('verified', 'Verified'), ('provisioning', 'Provisioning SSL'), ('active', 'Active'), ('failed', 'Provisioning Failed'), ('disabled', 'Disabled')], default='pending', max_length=20)),
                ('is_primary', models.BooleanField(default=False)),
                ('verified_at', models.DateTimeField(blank=True, null=True)),
                ('ssl_issued_at', models.DateTimeField(blank=True, null=True)),
                ('deprovisioned_at', models.DateTimeField(blank=True, null=True)),
                ('last_error', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('tenant', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='custom_domains', to='tenants.tenant')),
            ],
            options={
                'db_table': 'tenant_domains',
                'ordering': ['-is_primary', 'domain'],
            },
        ),
        migrations.AddConstraint(
            model_name='tenantdomain',
            constraint=models.UniqueConstraint(condition=models.Q(('is_primary', True)), fields=('tenant',), name='one_primary_custom_domain_per_tenant'),
        ),
        migrations.AddIndex(
            model_name='tenantdomain',
            index=models.Index(fields=['status'], name='tenant_domain_status_idx'),
        ),
    ]

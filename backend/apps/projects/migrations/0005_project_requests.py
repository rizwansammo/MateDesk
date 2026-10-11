# Phase 8A: client project requests and explicit MSP agent project creation permission.
import uuid
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('projects', '0004_milestone_visibility'),
    ]

    operations = [
        migrations.CreateModel(
            name='ProjectAgentPermission',
            fields=[
                ('id', models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('granted_by', models.ForeignKey(to='users.user', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='granted_project_permissions')),
                ('tenant', models.ForeignKey(to='tenants.tenant', on_delete=django.db.models.deletion.CASCADE, related_name='project_agent_permissions')),
                ('user', models.OneToOneField(to='users.user', on_delete=django.db.models.deletion.CASCADE, related_name='project_creation_permission')),
            ],
            options={'db_table': 'project_agent_permissions'},
        ),
        migrations.CreateModel(
            name='ProjectRequest',
            fields=[
                ('id', models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ('name', models.CharField(max_length=200)),
                ('kind', models.CharField(max_length=32, choices=[
                    ('web_development', 'Web Development'), ('app_development', 'App Development'),
                    ('website_redesign', 'Website Redesign'), ('infrastructure', 'Infrastructure'), ('other', 'Other')
                ], default='other')),
                ('requirements', models.TextField(blank=True)),
                ('budget', models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)),
                ('budget_currency', models.CharField(max_length=3, choices=[
                    ('USD', 'USD'), ('EUR', 'EUR'), ('GBP', 'GBP'), ('CAD', 'CAD'),
                    ('AUD', 'AUD'), ('BDT', 'BDT')
                ], default='USD')),
                ('expected_date', models.DateField(null=True, blank=True)),
                ('status', models.CharField(max_length=24, choices=[
                    ('submitted', 'Submitted'), ('under_review', 'Under Review'),
                    ('awaiting_details', 'Awaiting Details'), ('approved', 'Approved'),
                    ('rejected', 'Rejected'), ('converted', 'Converted')
                ], default='submitted')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('client_org', models.ForeignKey(to='tenants.clientorganization', on_delete=django.db.models.deletion.PROTECT, related_name='project_requests')),
                ('converted_project', models.OneToOneField(to='projects.project', on_delete=django.db.models.deletion.SET_NULL, null=True, blank=True, related_name='originating_request')),
                ('requested_by', models.ForeignKey(to='users.user', on_delete=django.db.models.deletion.SET_NULL, null=True, related_name='project_requests')),
                ('reviewed_by', models.ForeignKey(to='users.user', on_delete=django.db.models.deletion.SET_NULL, null=True, blank=True, related_name='reviewed_project_requests')),
                ('tenant', models.ForeignKey(to='tenants.tenant', on_delete=django.db.models.deletion.CASCADE, related_name='project_requests')),
                ('ticket', models.OneToOneField(to='tickets.ticket', on_delete=django.db.models.deletion.PROTECT, related_name='project_request')),
            ],
            options={'db_table': 'project_requests', 'ordering': ['-updated_at', '-created_at']},
        ),
        migrations.AddIndex(
            model_name='projectrequest',
            index=models.Index(fields=['tenant', 'status'], name='project_request_tenant_status'),
        ),
    ]

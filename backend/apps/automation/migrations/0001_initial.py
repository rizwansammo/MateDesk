import uuid
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        ('tenants', '0007_clientorganization_business_hours'),
    ]

    operations = [
        migrations.CreateModel(
            name='AutomationRule',
            fields=[
                ('id',              models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('name',            models.CharField(max_length=200)),
                ('description',     models.TextField(blank=True)),
                ('is_active',       models.BooleanField(default=True)),
                ('priority_order',  models.PositiveIntegerField(default=10)),
                ('trigger',         models.CharField(max_length=30, choices=[('ticket_created', 'Ticket Created'), ('ticket_updated', 'Ticket Updated'), ('reply_added', 'Reply Added')])),
                ('scope_type',      models.CharField(max_length=20, choices=[('all_orgs', 'All Organizations'), ('specific_org', 'Specific Organization')], default='all_orgs')),
                ('condition_match', models.CharField(max_length=10, choices=[('all', 'Match All (AND)'), ('any', 'Match Any (OR)')], default='all')),
                ('conditions',      models.JSONField(default=list)),
                ('actions',         models.JSONField(default=list)),
                ('stop_processing', models.BooleanField(default=False)),
                ('created_at',      models.DateTimeField(auto_now_add=True)),
                ('updated_at',      models.DateTimeField(auto_now=True)),
                ('tenant',          models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='automation_rules', to='tenants.tenant')),
                ('scope_org',       models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='automation_rules', to='tenants.clientorganization')),
            ],
            options={'db_table': 'automation_rules', 'ordering': ['priority_order', 'name']},
        ),
        migrations.CreateModel(
            name='AutomationLog',
            fields=[
                ('id',            models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('rule_name',     models.CharField(max_length=200)),
                ('ticket_ref',    models.CharField(max_length=50)),
                ('trigger',       models.CharField(max_length=30)),
                ('actions_taken', models.JSONField(default=list)),
                ('fired_at',      models.DateTimeField(auto_now_add=True)),
                ('tenant',        models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='automation_logs', to='tenants.tenant')),
                ('rule',          models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='logs', to='automation.automationrule')),
            ],
            options={'db_table': 'automation_logs', 'ordering': ['-fired_at']},
        ),
    ]

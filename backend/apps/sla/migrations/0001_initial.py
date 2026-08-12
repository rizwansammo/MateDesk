import uuid
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('tickets', '0008_ticket_sla_fields'),
        ('tenants', '0006_tenant_deletion_scheduled_at'),
    ]

    operations = [
        migrations.CreateModel(
            name='SLAPolicy',
            fields=[
                ('id',             models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('name',           models.CharField(max_length=200)),
                ('description',    models.TextField(blank=True)),
                ('is_active',      models.BooleanField(default=True)),
                ('priority_order', models.PositiveIntegerField(default=10)),
                ('scope_type',     models.CharField(
                    max_length=20,
                    choices=[
                        ('all_orgs',     'All Organizations'),
                        ('specific_org', 'Specific Organization'),
                        ('after_hours',  'After Hours'),
                    ],
                    default='all_orgs',
                )),
                ('clock_mode',    models.CharField(
                    max_length=20,
                    choices=[
                        ('real_time',      'Real Elapsed Time'),
                        ('business_hours', 'Business Hours'),
                    ],
                    default='real_time',
                )),
                ('breach_emails', models.JSONField(blank=True, default=list)),
                ('created_at',    models.DateTimeField(auto_now_add=True)),
                ('updated_at',    models.DateTimeField(auto_now=True)),
                ('tenant',     models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='sla_policies',  to='tenants.tenant')),
                ('scope_org',  models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='sla_policies', to='tenants.clientorganization')),
            ],
            options={'db_table': 'sla_policies', 'ordering': ['priority_order', 'name']},
        ),
        migrations.CreateModel(
            name='SLATarget',
            fields=[
                ('id',                     models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('priority',               models.CharField(max_length=20, choices=[('low', 'Low'), ('normal', 'Normal'), ('high', 'High'), ('critical', 'Critical')])),
                ('first_response_minutes', models.PositiveIntegerField(default=60)),
                ('resolution_minutes',     models.PositiveIntegerField(default=480)),
                ('due_soon_minutes',       models.PositiveIntegerField(default=30)),
                ('policy',                 models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='targets', to='sla.slapolicy')),
            ],
            options={'db_table': 'sla_targets'},
        ),
        migrations.AddConstraint(
            model_name='slatarget',
            constraint=models.UniqueConstraint(fields=['policy', 'priority'], name='uniq_target_per_policy_priority'),
        ),
        migrations.CreateModel(
            name='SLAPauseLog',
            fields=[
                ('id',         models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('paused_at',  models.DateTimeField()),
                ('resumed_at', models.DateTimeField(blank=True, null=True)),
                ('reason',     models.CharField(blank=True, max_length=100)),
                ('ticket',     models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='sla_pauses', to='tickets.ticket')),
            ],
            options={'db_table': 'sla_pause_logs', 'ordering': ['paused_at']},
        ),
        migrations.CreateModel(
            name='VIPRule',
            fields=[
                ('id',                  models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('name',                models.CharField(default='VIP Notification Rule', max_length=200)),
                ('is_active',           models.BooleanField(default=True)),
                ('notification_emails', models.JSONField(blank=True, default=list)),
                ('created_at',          models.DateTimeField(auto_now_add=True)),
                ('updated_at',          models.DateTimeField(auto_now=True)),
                ('tenant',              models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='vip_rule', to='tenants.tenant')),
            ],
            options={'db_table': 'sla_vip_rules'},
        ),
    ]

import uuid
import django.db.models.deletion
from django.db import migrations, models


def seed_default_groups(apps, schema_editor):
    Tenant = apps.get_model('tenants', 'Tenant')
    SupportGroup = apps.get_model('tickets', 'SupportGroup')
    Ticket = apps.get_model('tickets', 'Ticket')

    for tenant in Tenant.objects.all():
        group = SupportGroup.objects.create(
            id=uuid.uuid4(),
            tenant=tenant,
            name='Level 1',
            description='Default support group for all new tickets.',
            is_default=True,
        )
        Ticket.objects.filter(tenant=tenant).update(group=group)


class Migration(migrations.Migration):

    dependencies = [
        ('tickets', '0005_add_timelog_merge_fields'),
        ('tenants', '0006_tenant_deletion_scheduled_at'),
    ]

    operations = [
        migrations.CreateModel(
            name='SupportGroup',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('name', models.CharField(max_length=100)),
                ('description', models.TextField(blank=True)),
                ('is_default', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('tenant', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='support_groups',
                    to='tenants.tenant',
                )),
            ],
            options={'db_table': 'support_groups', 'ordering': ['name']},
        ),
        migrations.AddConstraint(
            model_name='supportgroup',
            constraint=models.UniqueConstraint(fields=['tenant', 'name'], name='uniq_group_name_per_tenant'),
        ),
        migrations.AddField(
            model_name='ticket',
            name='group',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='tickets',
                to='tickets.supportgroup',
            ),
        ),
        migrations.RunPython(seed_default_groups, migrations.RunPython.noop),
    ]

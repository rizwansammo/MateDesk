from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tenants', '0006_tenant_deletion_scheduled_at'),
    ]

    operations = [
        migrations.AddField(
            model_name='clientorganization',
            name='business_hours',
            field=models.JSONField(blank=True, default=dict),
        ),
    ]

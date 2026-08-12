from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tenants', '0002_tenant_saas_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='tenant',
            name='branding',
            field=models.JSONField(blank=True, default=dict),
        ),
    ]

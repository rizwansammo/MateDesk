from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tenants', '0004_tenant_branding_logos'),
    ]

    operations = [
        migrations.AddField(
            model_name='clientorganization',
            name='timezone',
            field=models.CharField(blank=True, default='UTC', max_length=64),
        ),
    ]

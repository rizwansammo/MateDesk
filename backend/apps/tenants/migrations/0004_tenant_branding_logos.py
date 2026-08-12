from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tenants', '0003_tenant_branding'),
    ]

    operations = [
        migrations.AddField(
            model_name='tenant',
            name='branding_md_logo',
            field=models.ImageField(blank=True, null=True, upload_to='branding/md/'),
        ),
        migrations.AddField(
            model_name='tenant',
            name='branding_mc_logo',
            field=models.ImageField(blank=True, null=True, upload_to='branding/mc/'),
        ),
    ]

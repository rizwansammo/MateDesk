from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('email_ingestion', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='tenantemailsettings',
            name='auth_method',
            field=models.CharField(
                choices=[('basic', 'Basic Auth (App Password)'), ('oauth2', 'OAuth2 / Modern Auth')],
                default='basic',
                max_length=10,
            ),
        ),
        migrations.AddField(
            model_name='tenantemailsettings',
            name='oauth_provider',
            field=models.CharField(blank=True, max_length=20),
        ),
        migrations.AddField(
            model_name='tenantemailsettings',
            name='oauth_client_id',
            field=models.CharField(blank=True, max_length=500),
        ),
        migrations.AddField(
            model_name='tenantemailsettings',
            name='oauth_client_secret',
            field=models.CharField(blank=True, max_length=500),
        ),
        migrations.AddField(
            model_name='tenantemailsettings',
            name='oauth_tenant_id',
            field=models.CharField(blank=True, max_length=255),
        ),
    ]

import uuid
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('platform_admin', '0004_platformsettings_email_poll_interval'),
        ('users', '0007_user_2fa_fields'),
    ]

    operations = [
        # SMTP fields on PlatformSettings
        migrations.AddField(
            model_name='platformsettings',
            name='admin_smtp_host',
            field=models.CharField(blank=True, default='', max_length=255),
        ),
        migrations.AddField(
            model_name='platformsettings',
            name='admin_smtp_port',
            field=models.PositiveIntegerField(default=587),
        ),
        migrations.AddField(
            model_name='platformsettings',
            name='admin_smtp_username',
            field=models.CharField(blank=True, default='', max_length=255),
        ),
        migrations.AddField(
            model_name='platformsettings',
            name='admin_smtp_password',
            field=models.CharField(blank=True, default='', max_length=512),
        ),
        migrations.AddField(
            model_name='platformsettings',
            name='admin_smtp_use_tls',
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name='platformsettings',
            name='admin_smtp_from_email',
            field=models.CharField(blank=True, default='', max_length=255),
        ),
        migrations.AddField(
            model_name='platformsettings',
            name='admin_smtp_from_name',
            field=models.CharField(blank=True, default='MateDesk Admin', max_length=200),
        ),
        # PlatformAdminOTP model
        migrations.CreateModel(
            name='PlatformAdminOTP',
            fields=[
                ('id', models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ('code', models.CharField(max_length=6)),
                ('expires_at', models.DateTimeField()),
                ('is_used', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('user', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='admin_otps',
                    to='users.user',
                )),
            ],
            options={'ordering': ['-created_at']},
        ),
    ]

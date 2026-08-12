from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('platform_admin', '0003_alter_adminactionlog_action_alter_platformplan_id_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='platformsettings',
            name='email_poll_interval',
            field=models.IntegerField(
                default=60,
                choices=[(30, '30 seconds'), (60, '1 minute'), (120, '2 minutes'), (300, '5 minutes')],
            ),
        ),
    ]

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('platform_admin', '0006_matedesk_brand_defaults'),
    ]

    operations = [
        migrations.AddField(
            model_name='platformsettings',
            name='signup_mode',
            field=models.CharField(
                choices=[
                    ('public_trial', 'Public Trial'),
                    ('private_beta', 'Private Beta'),
                ],
                default='public_trial',
                help_text='Controls whether the public site allows instant trials or requires private-beta approval.',
                max_length=30,
            ),
        ),
    ]

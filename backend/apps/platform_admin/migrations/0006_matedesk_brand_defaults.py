from django.db import migrations, models


def rebrand_existing_rows(apps, schema_editor):
    PlatformSettings = apps.get_model('platform_admin', 'PlatformSettings')
    for settings_row in PlatformSettings.objects.all():
        changed = False
        if settings_row.platform_name == 'MateDesk Pro':
            settings_row.platform_name = 'MateDesk'
            changed = True
        if 'MateDesk Pro' in (settings_row.build_info or ''):
            settings_row.build_info = settings_row.build_info.replace('MateDesk Pro', 'MateDesk')
            changed = True
        if changed:
            settings_row.save(update_fields=['platform_name', 'build_info'])


class Migration(migrations.Migration):

    dependencies = [
        ('platform_admin', '0005_platformsettings_smtp_and_otp'),
    ]

    operations = [
        migrations.AlterField(
            model_name='platformsettings',
            name='platform_name',
            field=models.CharField(default='MateDesk', max_length=200),
        ),
        migrations.AlterField(
            model_name='platformsettings',
            name='build_info',
            field=models.CharField(default='MateDesk v2.0 — Django 4.x', max_length=200),
        ),
        migrations.RunPython(rebrand_existing_rows, migrations.RunPython.noop),
    ]

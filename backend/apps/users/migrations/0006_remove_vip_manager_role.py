from django.db import migrations


def migrate_vip_manager_to_end_user(apps, schema_editor):
    User = apps.get_model('users', 'User')
    User.objects.filter(role='vip_manager').update(role='end_user', is_vip=True)


def migrate_client_owner_vip(apps, schema_editor):
    User = apps.get_model('users', 'User')
    User.objects.filter(role='client_owner', is_vip=False).update(is_vip=True)


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0005_user_is_vip'),
    ]

    operations = [
        migrations.RunPython(migrate_vip_manager_to_end_user, migrations.RunPython.noop),
        migrations.RunPython(migrate_client_owner_vip, migrations.RunPython.noop),
    ]

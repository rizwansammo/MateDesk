from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0004_user_global_email_uniqueness'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='is_vip',
            field=models.BooleanField(default=False),
        ),
    ]

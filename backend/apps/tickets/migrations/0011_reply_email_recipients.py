from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tickets', '0010_ticket_is_internal'),
    ]

    operations = [
        migrations.AddField(
            model_name='reply',
            name='to_emails',
            field=models.JSONField(default=list, blank=True),
        ),
        migrations.AddField(
            model_name='reply',
            name='cc_emails',
            field=models.JSONField(default=list, blank=True),
        ),
    ]

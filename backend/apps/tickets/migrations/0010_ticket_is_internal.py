from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tickets', '0009_ticket_sla_breach_notified'),
    ]

    operations = [
        migrations.AddField(
            model_name='ticket',
            name='is_internal',
            field=models.BooleanField(default=False),
        ),
    ]

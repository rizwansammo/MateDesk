from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tickets', '0008_ticket_sla_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='ticket',
            name='sla_breach_notified',
            field=models.BooleanField(default=False),
        ),
    ]

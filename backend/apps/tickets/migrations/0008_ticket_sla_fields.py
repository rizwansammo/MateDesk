from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tickets', '0007_supportgroup_agents'),
    ]

    operations = [
        migrations.AlterField(
            model_name='ticket',
            name='status',
            field=models.CharField(
                max_length=20,
                choices=[
                    ('open',                'Open'),
                    ('pending',             'Pending'),
                    ('in_progress',         'In Progress'),
                    ('waiting_on_customer', 'Waiting on Customer'),
                    ('solved',              'Solved'),
                    ('closed',              'Closed'),
                ],
                default='open',
            ),
        ),
        migrations.AddField(
            model_name='ticket',
            name='first_response_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='ticket',
            name='sla_status',
            field=models.CharField(
                max_length=20,
                choices=[
                    ('not_applied', 'Not Applied'),
                    ('on_track',    'On Track'),
                    ('due_soon',    'Due Soon'),
                    ('breached',    'Breached'),
                    ('completed',   'Completed'),
                ],
                default='not_applied',
            ),
        ),
    ]

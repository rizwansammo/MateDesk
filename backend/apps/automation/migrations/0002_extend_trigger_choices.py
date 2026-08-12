from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('automation', '0001_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='automationrule',
            name='trigger',
            field=models.CharField(
                max_length=30,
                choices=[
                    ('ticket_created',    'Ticket Created'),
                    ('ticket_updated',    'Ticket Updated'),
                    ('ticket_closed',     'Ticket Closed'),
                    ('ticket_solved',     'Ticket Solved'),
                    ('ticket_assigned',   'Ticket Assigned'),
                    ('ticket_unassigned', 'Ticket Unassigned'),
                    ('priority_escalated','Priority Escalated'),
                    ('sla_breached',      'SLA Breached'),
                    ('reply_added',       'Reply Added'),
                    ('customer_replied',  'Customer Replied'),
                    ('ticket_overdue',    'Ticket Overdue'),
                    ('ticket_stale',      'Ticket Stale (no update 24h+)'),
                ],
            ),
        ),
    ]

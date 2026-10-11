"""Keep preexisting milestones internal until a manager publishes them."""
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('projects', '0003_email_notifications')]

    operations = [
        migrations.AddField(
            model_name='projectmilestone',
            name='visibility',
            field=models.CharField(
                max_length=20, default='internal',
                choices=[('internal', 'Internal'), ('client', 'Client Visible')],
            ),
        ),
    ]

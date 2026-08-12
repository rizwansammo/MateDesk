from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tenants', '0005_clientorganization_timezone'),
    ]

    operations = [
        migrations.AddField(
            model_name='tenant',
            name='deletion_scheduled_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]

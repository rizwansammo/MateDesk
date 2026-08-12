from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('email_ingestion', '0004_alter_knownsender_id'),
    ]

    operations = [
        migrations.AddField(
            model_name='processedemail',
            name='cc_emails',
            field=models.JSONField(default=list, blank=True),
        ),
    ]

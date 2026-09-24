from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tickets', '0011_reply_email_recipients'),
    ]

    operations = [
        migrations.AddField(
            model_name='ticket',
            name='description_html',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AddField(
            model_name='reply',
            name='body_html',
            field=models.TextField(blank=True, default=''),
        ),
    ]

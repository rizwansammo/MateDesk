from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0002_user_deleted_org_name'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='employee_id',
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name='user',
            name='reports_to',
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name='user',
            name='business_impact',
            field=models.CharField(blank=True, max_length=200),
        ),
    ]

import uuid

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('platform_admin', '0007_platformsettings_signup_mode'),
    ]

    operations = [
        migrations.CreateModel(
            name='BetaApplication',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('company_name', models.CharField(max_length=200)),
                ('owner_name', models.CharField(max_length=201)),
                ('email', models.EmailField(max_length=254, unique=True)),
                ('requested_slug', models.SlugField(max_length=30, unique=True)),
                ('status', models.CharField(
                    choices=[
                        ('pending', 'Pending'),
                        ('approved', 'Approved'),
                        ('rejected', 'Rejected'),
                        ('activated', 'Activated'),
                    ],
                    default='pending',
                    max_length=20,
                )),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'Private Beta Application',
                'verbose_name_plural': 'Private Beta Applications',
                'ordering': ['-created_at'],
            },
        ),
    ]

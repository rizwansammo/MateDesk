# Migration: Add SaaS platform fields to Tenant model

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tenants', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='tenant',
            name='status',
            field=models.CharField(
                choices=[
                    ('active', 'Active'),
                    ('trial', 'Trial'),
                    ('suspended', 'Suspended'),
                    ('cancelled', 'Cancelled'),
                ],
                default='trial',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='tenant',
            name='trial_ends_at',
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='tenant',
            name='renewal_date',
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='tenant',
            name='billing_status',
            field=models.CharField(
                choices=[
                    ('paid', 'Paid'),
                    ('past_due', 'Past Due'),
                    ('trial', 'Trial'),
                    ('cancelled', 'Cancelled'),
                ],
                default='trial',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='tenant',
            name='mateconnect_enabled',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='tenant',
            name='matedesk_enabled',
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name='tenant',
            name='max_organizations',
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='tenant',
            name='max_users',
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='tenant',
            name='max_tickets',
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='tenant',
            name='max_devices',
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
    ]

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('platform_admin', '0008_betaapplication'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='betaapplication',
            name='review_note',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AddField(
            model_name='betaapplication',
            name='reviewed_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='betaapplication',
            name='reviewed_by',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='beta_applications_reviewed',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name='adminactionlog',
            name='action',
            field=models.CharField(
                choices=[
                    ('tenant_created', 'Tenant Created'),
                    ('tenant_updated', 'Tenant Updated'),
                    ('tenant_deactivated', 'Tenant Deactivated'),
                    ('tenant_reactivated', 'Tenant Reactivated'),
                    ('tenant_deletion_scheduled', 'Tenant Deletion Scheduled'),
                    ('tenant_deletion_cancelled', 'Tenant Deletion Cancelled'),
                    ('tenant_deleted', 'Tenant Deleted'),
                    ('plan_changed', 'Plan Changed'),
                    ('subscription_updated', 'Subscription Updated'),
                    ('owner_password_reset', 'Owner Password Reset'),
                    ('admin_created', 'Admin Account Created'),
                    ('admin_updated', 'Admin Updated'),
                    ('admin_deactivated', 'Admin Deactivated'),
                    ('admin_password_reset', 'Admin Password Reset'),
                    ('msp_owner_password_reset', 'MSP Owner Password Reset'),
                    ('mateconnect_enabled', 'MateConnect Enabled'),
                    ('mateconnect_disabled', 'MateConnect Disabled'),
                    ('platform_settings_updated', 'Platform Settings Updated'),
                    ('beta_application_approved', 'Beta Application Approved'),
                    ('beta_application_rejected', 'Beta Application Rejected'),
                    ('plan_updated', 'Plan Updated'),
                    ('admin_login', 'Admin Login'),
                    ('admin_login_failed', 'Admin Login Failed'),
                    ('admin_logout', 'Admin Logout'),
                ],
                max_length=50,
            ),
        ),
    ]

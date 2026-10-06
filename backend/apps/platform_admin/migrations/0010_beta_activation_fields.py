from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('platform_admin', '0009_betaapplication_review'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='betaapplication',
            name='activated_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='betaapplication',
            name='activation_email_last_error',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AddField(
            model_name='betaapplication',
            name='activation_email_sent_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='betaapplication',
            name='owner_user',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='beta_application_owner',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name='betaapplication',
            name='provisioned_tenant',
            field=models.OneToOneField(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='beta_application',
                to='tenants.tenant',
            ),
        ),
        migrations.AddField(
            model_name='betaapplication',
            name='receipt_email_last_error',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AddField(
            model_name='betaapplication',
            name='receipt_email_sent_at',
            field=models.DateTimeField(blank=True, null=True),
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
                    ('admin_updated', 'Admin Account Updated'),
                    ('admin_deactivated', 'Admin Account Deactivated'),
                    ('admin_password_reset', 'Admin Password Reset'),
                    ('msp_owner_password_reset', 'MSP Owner Password Reset'),
                    ('mateconnect_enabled', 'MateConnect Enabled'),
                    ('mateconnect_disabled', 'MateConnect Disabled'),
                    ('platform_settings_updated', 'Platform Settings Updated'),
                    ('beta_application_approved', 'Beta Application Approved'),
                    ('beta_application_rejected', 'Beta Application Rejected'),
                    ('beta_workspace_provisioned', 'Beta Workspace Provisioned'),
                    ('beta_activation_email_sent', 'Beta Activation Email Sent'),
                    ('beta_activation_email_failed', 'Beta Activation Email Failed'),
                    ('beta_application_activated', 'Beta Application Activated'),
                    ('plan_updated', 'Plan Updated'),
                    ('admin_login', 'Admin Login'),
                    ('admin_login_failed', 'Admin Login Failed'),
                    ('admin_logout', 'Admin Logout'),
                ],
                max_length=50,
            ),
        ),
    ]

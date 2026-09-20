from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("email_ingestion", "0007_processedemail_reply_to_email_and_more")]

    operations = [
        migrations.AlterField(
            model_name="tenantemailsettings",
            name="auth_method",
            field=models.CharField(
                choices=[
                    ("basic", "Basic Auth (App Password)"),
                    ("oauth2", "OAuth2 / Modern Auth"),
                    ("matemail", "MateMail Connected App"),
                ],
                default="basic",
                max_length=10,
            ),
        ),
        migrations.AddField(
            model_name="tenantemailsettings",
            name="matemail_tenant_id",
            field=models.CharField(blank=True, max_length=64),
        ),
        migrations.AddField(
            model_name="tenantemailsettings",
            name="matemail_mailbox_id",
            field=models.CharField(blank=True, max_length=64),
        ),
        migrations.AddField(
            model_name="tenantemailsettings",
            name="matemail_mailbox_email",
            field=models.EmailField(blank=True, max_length=254),
        ),
        migrations.AddField(
            model_name="tenantemailsettings",
            name="matemail_mailbox_name",
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name="tenantemailsettings",
            name="matemail_permissions",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name="tenantemailsettings",
            name="matemail_access_token",
            field=models.CharField(blank=True, max_length=1024),
        ),
        migrations.AddField(
            model_name="tenantemailsettings",
            name="matemail_connected_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]

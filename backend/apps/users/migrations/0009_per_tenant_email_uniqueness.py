from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0008_fix_2fa_fields"),
    ]

    operations = [
        # Remove the global unique index on email (added in 0004)
        migrations.AlterField(
            model_name="user",
            name="email",
            field=models.EmailField(max_length=254),
        ),
        # Restore per-tenant uniqueness: (tenant, email) must be unique
        # NULL tenant (platform superusers) is exempt — SQL NULL != NULL
        migrations.AddConstraint(
            model_name="user",
            constraint=models.UniqueConstraint(
                fields=["tenant", "email"],
                name="unique_email_per_tenant",
            ),
        ),
    ]

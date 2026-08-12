from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0007_user_2fa_fields'),
    ]

    # Plain RunSQL statements — no SeparateDatabaseAndState.
    # State is already correct from the rewritten 0007 (has totp_enabled +
    # email_2fa_enabled). These ops only fix the production DB which had the
    # OLD 0007 applied (two_fa_enabled / two_fa_method columns instead).
    # IF NOT EXISTS / IF EXISTS makes every statement safe on fresh installs.
    operations = [
        migrations.RunSQL(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled boolean NOT NULL DEFAULT false",
            reverse_sql=migrations.RunSQL.noop,
        ),
        migrations.RunSQL(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_2fa_enabled boolean NOT NULL DEFAULT false",
            reverse_sql=migrations.RunSQL.noop,
        ),
        migrations.RunSQL(
            "ALTER TABLE users DROP COLUMN IF EXISTS two_fa_enabled",
            reverse_sql=migrations.RunSQL.noop,
        ),
        migrations.RunSQL(
            "ALTER TABLE users DROP COLUMN IF EXISTS two_fa_method",
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]

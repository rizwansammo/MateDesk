from django.db import migrations, models


def deduplicate_emails(apps, schema_editor):
    """
    Before adding the global unique constraint on email, rename any duplicate
    emails that were created back when per-tenant uniqueness was allowed.
    Non-MSP-owner duplicates get a suffix so the constraint can be applied.
    If two accounts share an email, the MSP owner (or first-created) keeps
    the original; others get '<email>.dup<id>' so they remain resolvable.
    """
    User = apps.get_model('users', 'User')
    from django.db.models import Count

    dupes = (
        User.objects
        .values('email')
        .annotate(cnt=Count('id'))
        .filter(cnt__gt=1)
        .values_list('email', flat=True)
    )

    for email in dupes:
        users = list(
            User.objects
            .filter(email=email)
            .order_by('date_joined')  # keep oldest (most likely the MSP owner)
        )
        # Keep the first one; rename the rest
        for u in users[1:]:
            suffix = str(u.id)[:8]
            new_email = f'{email}.dup{suffix}'
            u.email = new_email
            u.save(update_fields=['email'])


class Migration(migrations.Migration):
    """
    Enforces global email uniqueness across ALL tenants.
    Duplicate emails created under the old per-tenant uniqueness rules are
    renamed automatically before the constraint is applied.
    """

    dependencies = [
        ('users', '0003_user_extended_fields'),
    ]

    operations = [
        # Rename any cross-tenant email duplicates first
        migrations.RunPython(deduplicate_emails, migrations.RunPython.noop),
        # Remove the per-tenant composite unique index
        migrations.AlterUniqueTogether(
            name='user',
            unique_together=set(),
        ),
        # Add a global unique constraint on email alone
        migrations.AlterField(
            model_name='user',
            name='email',
            field=models.EmailField(max_length=254, unique=True),
        ),
    ]

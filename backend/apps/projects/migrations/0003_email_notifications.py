"""Audited outbound Project notifications and accepted inbound replies."""
import uuid
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ('projects', '0002_ticket_associations'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='ProjectEmailNotification',
            fields=[
                ('id', models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ('idempotency_key', models.UUIDField()),
                ('message_id', models.CharField(max_length=998, blank=True, null=True)),
                ('subject', models.CharField(max_length=500)),
                ('note', models.TextField(blank=True)),
                ('status', models.CharField(max_length=12, default='pending', choices=[
                    ('pending', 'Pending'), ('sent', 'Sent'), ('failed', 'Failed'),
                ])),
                ('last_error', models.CharField(max_length=200, blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('sent_at', models.DateTimeField(blank=True, null=True)),
                ('tenant', models.ForeignKey(to='tenants.tenant', related_name='project_email_notifications', on_delete=django.db.models.deletion.CASCADE)),
                ('work_item', models.ForeignKey(to='projects.workitem', related_name='email_notifications', on_delete=django.db.models.deletion.CASCADE)),
                ('recipient', models.ForeignKey(to=settings.AUTH_USER_MODEL, related_name='received_project_emails', on_delete=django.db.models.deletion.PROTECT)),
                ('sent_by', models.ForeignKey(to=settings.AUTH_USER_MODEL, related_name='sent_project_emails', null=True, on_delete=django.db.models.deletion.SET_NULL)),
            ],
            options={'db_table': 'project_email_notifications', 'ordering': ['-created_at']},
        ),
        migrations.CreateModel(
            name='ProjectEmailReply',
            fields=[
                ('id', models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ('message_id', models.CharField(max_length=998)),
                ('from_email', models.EmailField(max_length=254)),
                ('received_at', models.DateTimeField(auto_now_add=True)),
                ('tenant', models.ForeignKey(to='tenants.tenant', related_name='project_email_replies', on_delete=django.db.models.deletion.CASCADE)),
                ('notification', models.ForeignKey(to='projects.projectemailnotification', related_name='email_replies', on_delete=django.db.models.deletion.PROTECT)),
                ('comment', models.OneToOneField(to='projects.workitemcomment', related_name='email_reply', on_delete=django.db.models.deletion.CASCADE)),
            ],
            options={'db_table': 'project_email_replies', 'ordering': ['received_at']},
        ),
        migrations.AddConstraint(
            model_name='projectemailnotification',
            constraint=models.UniqueConstraint(fields=('tenant', 'idempotency_key'), name='unique_project_email_idempotency'),
        ),
        migrations.AddConstraint(
            model_name='projectemailnotification',
            constraint=models.UniqueConstraint(fields=('tenant', 'message_id'), name='unique_project_email_message_id'),
        ),
        migrations.AddConstraint(
            model_name='projectemailreply',
            constraint=models.UniqueConstraint(fields=('tenant', 'message_id'), name='unique_project_inbound_message_id'),
        ),
    ]

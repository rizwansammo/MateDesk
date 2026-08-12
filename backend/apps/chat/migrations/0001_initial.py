import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('tenants', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='SupportSession',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('session_number', models.CharField(max_length=25, unique=True)),
                ('status', models.CharField(
                    choices=[('waiting', 'Waiting'), ('active', 'Active'), ('ended', 'Ended')],
                    default='waiting', max_length=10,
                )),
                ('initiated_by', models.CharField(
                    choices=[('user', 'User'), ('agent', 'Agent')],
                    max_length=5,
                )),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('ended_at', models.DateTimeField(blank=True, null=True)),
                ('tenant', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='support_sessions',
                    to='tenants.tenant',
                )),
                ('user', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='support_sessions_as_user',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('agent', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='support_sessions_as_agent',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'db_table': 'chat_support_sessions',
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='SupportMessage',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('sender_type', models.CharField(
                    choices=[('user', 'User'), ('agent', 'Agent')],
                    max_length=5,
                )),
                ('body', models.TextField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('session', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='messages',
                    to='chat.supportsession',
                )),
                ('sender', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='support_messages_sent',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'db_table': 'chat_support_messages',
                'ordering': ['created_at'],
            },
        ),
        migrations.CreateModel(
            name='DirectMessage',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('body', models.TextField()),
                ('is_read', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('tenant', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='direct_messages',
                    to='tenants.tenant',
                )),
                ('sender', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='sent_dms',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('recipient', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='received_dms',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'db_table': 'chat_direct_messages',
                'ordering': ['created_at'],
            },
        ),
    ]

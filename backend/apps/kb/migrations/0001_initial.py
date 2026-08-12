import uuid
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('tenants', '0005_clientorganization_timezone'),
        ('tickets', '0004_ticket_secondary_agents'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='KBArticle',
            fields=[
                ('id',         models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ('category',   models.CharField(choices=[('resolution', 'Resolution'), ('documentation', 'Documentation'), ('canned_response', 'Canned Response')], default='resolution', max_length=30)),
                ('title',      models.CharField(max_length=500)),
                ('content',    models.TextField(blank=True)),
                ('status',     models.CharField(choices=[('draft', 'Draft'), ('published', 'Published')], default='published', max_length=20)),
                ('visibility', models.CharField(choices=[('internal', 'Internal'), ('public', 'Public')], default='internal', max_length=20)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('tenant',     models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='kb_articles', to='tenants.tenant')),
                ('author',     models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='kb_articles', to=settings.AUTH_USER_MODEL)),
                ('client_org', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='kb_articles', to='tenants.clientorganization')),
            ],
            options={'db_table': 'kb_articles', 'ordering': ['-created_at']},
        ),
        migrations.CreateModel(
            name='TicketKBLink',
            fields=[
                ('id',         models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('ticket',     models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='kb_links', to='tickets.ticket')),
                ('article',    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='ticket_links', to='kb.kbarticle')),
                ('linked_by',  models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='kb_links_created', to=settings.AUTH_USER_MODEL)),
            ],
            options={'db_table': 'kb_ticket_links', 'ordering': ['-created_at']},
        ),
        migrations.AlterUniqueTogether(
            name='ticketkblink',
            unique_together={('ticket', 'article')},
        ),
    ]

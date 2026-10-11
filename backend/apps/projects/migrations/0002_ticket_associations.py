"""Support Ticket association is isolated from existing ticket fields and email threading."""
import uuid

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ('projects', '0001_initial'),
        ('tickets', '0012_email_html_bodies'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='TicketProjectAssociation',
            fields=[
                ('id', models.UUIDField(primary_key=True, serialize=False, editable=False, default=uuid.uuid4)),
                ('source', models.CharField(max_length=20, default='manual', choices=[
                    ('manual', 'Manual'), ('automation', 'Automation'),
                ])),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('linked_by', models.ForeignKey(
                    null=True, blank=True, related_name='linked_ticket_projects',
                    to=settings.AUTH_USER_MODEL, on_delete=django.db.models.deletion.SET_NULL,
                )),
                ('project', models.ForeignKey(
                    related_name='ticket_associations', to='projects.project',
                    on_delete=django.db.models.deletion.PROTECT,
                )),
                ('ticket', models.OneToOneField(
                    related_name='project_association', to='tickets.ticket',
                    on_delete=django.db.models.deletion.CASCADE,
                )),
            ],
            options={'db_table': 'project_ticket_associations'},
        ),
        migrations.CreateModel(
            name='TicketWorkItemLink',
            fields=[
                ('id', models.UUIDField(primary_key=True, serialize=False, editable=False, default=uuid.uuid4)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('linked_by', models.ForeignKey(
                    null=True, blank=True, related_name='linked_ticket_work_items',
                    to=settings.AUTH_USER_MODEL, on_delete=django.db.models.deletion.SET_NULL,
                )),
                ('ticket', models.ForeignKey(
                    related_name='project_work_item_links', to='tickets.ticket',
                    on_delete=django.db.models.deletion.CASCADE,
                )),
                ('work_item', models.ForeignKey(
                    related_name='support_ticket_links', to='projects.workitem',
                    on_delete=django.db.models.deletion.CASCADE,
                )),
            ],
            options={
                'db_table': 'project_ticket_work_item_links',
                'ordering': ['created_at', 'id'],
            },
        ),
        migrations.AddConstraint(
            model_name='ticketworkitemlink',
            constraint=models.UniqueConstraint(
                fields=('ticket', 'work_item'), name='unique_ticket_work_item_link',
            ),
        ),
    ]

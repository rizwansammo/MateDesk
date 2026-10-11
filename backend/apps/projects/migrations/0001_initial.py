# Core project management schema. No changes to existing Ticket or email models.
import uuid
import django.core.validators
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        ('tenants', '0008_tenantdomain'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='Project',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('key', models.CharField(max_length=12, validators=[django.core.validators.RegexValidator('^[A-Z0-9]{2,12}$', message='Use 2 to 12 uppercase letters or numbers.')])),
                ('name', models.CharField(max_length=200)),
                ('description', models.TextField(blank=True)),
                ('status', models.CharField(choices=[('planned', 'Planned'), ('active', 'Active'), ('on_hold', 'On Hold'), ('completed', 'Completed'), ('archived', 'Archived')], default='planned', max_length=20)),
                ('visibility', models.CharField(choices=[('internal', 'Internal'), ('client', 'Client Visible')], default='internal', max_length=20)),
                ('start_date', models.DateField(blank=True, null=True)),
                ('due_date', models.DateField(blank=True, null=True)),
                ('next_item_number', models.PositiveIntegerField(default=1, editable=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('client_org', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='projects', to='tenants.clientorganization')),
                ('created_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='created_projects', to=settings.AUTH_USER_MODEL)),
                ('tenant', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='projects', to='tenants.tenant')),
            ],
            options={'db_table': 'projects', 'ordering': ['name', 'id']},
        ),
        migrations.CreateModel(
            name='ProjectMember',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('role', models.CharField(choices=[('manager', 'Project Manager'), ('contributor', 'Contributor'), ('viewer', 'Viewer'), ('client_reviewer', 'Client Reviewer')], default='viewer', max_length=24)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('project', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='members', to='projects.project')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='project_memberships', to=settings.AUTH_USER_MODEL)),
            ],
            options={'db_table': 'project_members', 'ordering': ['created_at', 'id']},
        ),
        migrations.CreateModel(
            name='ProjectMilestone',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('name', models.CharField(max_length=200)),
                ('description', models.TextField(blank=True)),
                ('status', models.CharField(choices=[('planned', 'Planned'), ('in_progress', 'In Progress'), ('completed', 'Completed')], default='planned', max_length=20)),
                ('due_date', models.DateField(blank=True, null=True)),
                ('position', models.PositiveIntegerField(default=0)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('project', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='milestones', to='projects.project')),
            ],
            options={'db_table': 'project_milestones', 'ordering': ['position', 'created_at', 'id']},
        ),
        migrations.CreateModel(
            name='WorkItem',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('number', models.PositiveIntegerField(editable=False)),
                ('title', models.CharField(max_length=300)),
                ('description', models.TextField(blank=True)),
                ('kind', models.CharField(choices=[('feature', 'Feature'), ('task', 'Task'), ('bug', 'Bug'), ('improvement', 'Improvement')], default='task', max_length=20)),
                ('status', models.CharField(choices=[('backlog', 'Backlog'), ('todo', 'To Do'), ('in_progress', 'In Progress'), ('in_review', 'In Review'), ('done', 'Done'), ('cancelled', 'Cancelled')], default='backlog', max_length=20)),
                ('priority', models.CharField(choices=[('low', 'Low'), ('normal', 'Normal'), ('high', 'High'), ('urgent', 'Urgent')], default='normal', max_length=20)),
                ('visibility', models.CharField(choices=[('internal', 'Internal'), ('client', 'Client Visible')], default='internal', max_length=20)),
                ('due_date', models.DateField(blank=True, null=True)),
                ('position', models.PositiveIntegerField(default=0)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('assignee', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='assigned_work_items', to=settings.AUTH_USER_MODEL)),
                ('created_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='created_work_items', to=settings.AUTH_USER_MODEL)),
                ('milestone', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='work_items', to='projects.projectmilestone')),
                ('project', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='work_items', to='projects.project')),
            ],
            options={'db_table': 'project_work_items', 'ordering': ['position', 'created_at', 'id']},
        ),
        migrations.CreateModel(
            name='WorkItemComment',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('body', models.TextField()),
                ('visibility', models.CharField(choices=[('internal', 'Internal'), ('client', 'Client Visible')], default='internal', max_length=20)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('author', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='work_item_comments', to=settings.AUTH_USER_MODEL)),
                ('work_item', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='comments', to='projects.workitem')),
            ],
            options={'db_table': 'project_work_item_comments', 'ordering': ['created_at', 'id']},
        ),
        migrations.AddConstraint(
            model_name='project',
            constraint=models.UniqueConstraint(fields=('tenant', 'key'), name='unique_project_key_per_tenant'),
        ),
        migrations.AddConstraint(
            model_name='projectmember',
            constraint=models.UniqueConstraint(fields=('project', 'user'), name='unique_project_member'),
        ),
        migrations.AddConstraint(
            model_name='workitem',
            constraint=models.UniqueConstraint(fields=('project', 'number'), name='unique_work_item_number'),
        ),
    ]

# Phase 2 Project Document Management
import uuid

from django.db import migrations, models
import django.db.models.deletion
import apps.projects.models


class Migration(migrations.Migration):
    dependencies = [
        ('projects', '0008_add_reopened_marker'),
    ]

    operations = [
        migrations.CreateModel(
            name='ProjectDocument',
            fields=[
                ('id', models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ('category', models.CharField(max_length=20, choices=[('library', 'Project Library'), ('work_item', 'Work Item Attachment'), ('delivery', 'Delivery File')])),
                ('title', models.CharField(max_length=255)),
                ('visibility', models.CharField(max_length=12, choices=[('internal', 'Staff Only'), ('client', 'Client Visible')], default='internal')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('archived_at', models.DateTimeField(blank=True, null=True)),
                ('project', models.ForeignKey(to='projects.project', on_delete=django.db.models.deletion.CASCADE, related_name='documents')),
                ('work_item', models.ForeignKey(to='projects.workitem', on_delete=django.db.models.deletion.PROTECT, related_name='documents', blank=True, null=True)),
                ('delivery_review', models.ForeignKey(to='projects.projectdeliveryreview', on_delete=django.db.models.deletion.PROTECT, related_name='documents', blank=True, null=True)),
                ('created_by', models.ForeignKey(to='users.user', on_delete=django.db.models.deletion.SET_NULL, null=True, related_name='project_documents')),
            ],
            options={'db_table': 'project_documents', 'ordering': ['-created_at', '-id']},
        ),
        migrations.CreateModel(
            name='ProjectDocumentVersion',
            fields=[
                ('id', models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ('number', models.PositiveIntegerField()),
                ('blob', models.FileField(upload_to=apps.projects.models.project_document_upload_path, max_length=500)),
                ('original_name', models.CharField(max_length=255)),
                ('content_type', models.CharField(max_length=100)),
                ('size', models.PositiveBigIntegerField()),
                ('sha256', models.CharField(max_length=64)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('document', models.ForeignKey(to='projects.projectdocument', on_delete=django.db.models.deletion.CASCADE, related_name='versions')),
                ('created_by', models.ForeignKey(to='users.user', on_delete=django.db.models.deletion.SET_NULL, null=True, related_name='project_document_versions')),
            ],
            options={'db_table': 'project_document_versions', 'ordering': ['-number', '-created_at']},
        ),
        migrations.AddIndex('projectdocument', models.Index(fields=['project', 'category', 'created_at'], name='proj_docs_by_cat')),
        migrations.AddIndex('projectdocument', models.Index(fields=['project', 'work_item'], name='proj_docs_by_work')),
        migrations.AddConstraint('projectdocumentversion', models.UniqueConstraint(fields=('document', 'number'), name='unique_project_document_version')),
    ]

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('email_ingestion', '0002_oauth2_fields'),
        ('tenants', '0004_tenant_branding_logos'),
    ]

    operations = [
        migrations.CreateModel(
            name='KnownSender',
            fields=[
                ('id',         models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ('email',      models.EmailField()),
                ('name',       models.CharField(blank=True, max_length=200)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('client_org', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='known_senders',
                    to='tenants.clientorganization',
                )),
                ('tenant', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='known_senders',
                    to='tenants.tenant',
                )),
            ],
            options={'db_table': 'known_senders'},
        ),
        migrations.AlterUniqueTogether(
            name='knownsender',
            unique_together={('tenant', 'email')},
        ),
    ]

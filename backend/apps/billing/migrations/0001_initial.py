import uuid
from decimal import Decimal
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('tenants', '0006_tenant_deletion_scheduled_at'),
    ]

    operations = [
        migrations.CreateModel(
            name='BillingProfile',
            fields=[
                ('id',            models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('company_name',  models.CharField(blank=True, max_length=200)),
                ('address',       models.TextField(blank=True)),
                ('email',         models.EmailField(blank=True, max_length=254)),
                ('phone',         models.CharField(blank=True, max_length=30)),
                ('payment_terms', models.TextField(blank=True, default='Payment due within 30 days of invoice date.')),
                ('updated_at',    models.DateTimeField(auto_now=True)),
                ('tenant',        models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='billing_profile', to='tenants.tenant')),
            ],
            options={'db_table': 'billing_profiles'},
        ),
        migrations.CreateModel(
            name='OrgBillingRate',
            fields=[
                ('id',          models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('mode',        models.CharField(choices=[('hourly', 'By Hour'), ('per_ticket', 'By Ticket')], default='per_ticket', max_length=20)),
                ('currency',    models.CharField(choices=[('USD','USD'),('GBP','GBP'),('EUR','EUR'),('CAD','CAD'),('AUD','AUD'),('NZD','NZD'),('SGD','SGD'),('AED','AED'),('INR','INR'),('PKR','PKR')], default='USD', max_length=3)),
                ('hourly_rate', models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True)),
                ('l1_rate',     models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True)),
                ('l2_rate',     models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True)),
                ('l3_rate',     models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True)),
                ('updated_at',  models.DateTimeField(auto_now=True)),
                ('tenant',      models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='org_billing_rates', to='tenants.tenant')),
                ('org',         models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='billing_rate', to='tenants.clientorganization')),
            ],
            options={'db_table': 'org_billing_rates'},
        ),
        migrations.CreateModel(
            name='Invoice',
            fields=[
                ('id',             models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('invoice_number', models.CharField(max_length=50)),
                ('period_from',    models.DateField()),
                ('period_to',      models.DateField()),
                ('status',         models.CharField(choices=[('draft','Draft'),('sent','Sent'),('paid','Paid')], default='draft', max_length=20)),
                ('currency',       models.CharField(default='USD', max_length=3)),
                ('subtotal',       models.DecimalField(decimal_places=2, default=Decimal('0.00'), max_digits=12)),
                ('tax_rate',       models.DecimalField(decimal_places=2, default=Decimal('0.00'), max_digits=5)),
                ('tax_amount',     models.DecimalField(decimal_places=2, default=Decimal('0.00'), max_digits=12)),
                ('total',          models.DecimalField(decimal_places=2, default=Decimal('0.00'), max_digits=12)),
                ('created_at',     models.DateTimeField(auto_now_add=True)),
                ('tenant',         models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='invoices', to='tenants.tenant')),
                ('org',            models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='invoices', to='tenants.clientorganization')),
            ],
            options={'db_table': 'billing_invoices', 'ordering': ['-created_at']},
        ),
        migrations.AddConstraint(
            model_name='invoice',
            constraint=models.UniqueConstraint(fields=['tenant', 'invoice_number'], name='uniq_invoice_number_per_tenant'),
        ),
        migrations.CreateModel(
            name='InvoiceLineItem',
            fields=[
                ('id',             models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('description',    models.CharField(max_length=500)),
                ('unit_rate',      models.DecimalField(decimal_places=2, max_digits=10)),
                ('amount',         models.DecimalField(decimal_places=2, max_digits=12)),
                ('ticket_ref',     models.CharField(blank=True, max_length=50)),
                ('ticket_subject', models.CharField(blank=True, max_length=500)),
                ('ticket_level',   models.CharField(blank=True, max_length=10)),
                ('log_date',       models.DateField(blank=True, null=True)),
                ('agent_name',     models.CharField(blank=True, max_length=200)),
                ('minutes',        models.PositiveIntegerField(blank=True, null=True)),
                ('invoice',        models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='line_items', to='billing.invoice')),
            ],
            options={'db_table': 'billing_invoice_line_items', 'ordering': ['id']},
        ),
    ]

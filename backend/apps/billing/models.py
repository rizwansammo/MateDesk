import uuid
from decimal import Decimal
from django.db import models

RATE_MODE_CHOICES = [
    ('hourly',     'By Hour'),
    ('per_ticket', 'By Ticket'),
]

INVOICE_STATUS_CHOICES = [
    ('draft', 'Draft'),
    ('sent',  'Sent'),
    ('paid',  'Paid'),
]

CURRENCY_CHOICES = [
    ('USD', 'USD'), ('GBP', 'GBP'), ('EUR', 'EUR'),
    ('CAD', 'CAD'), ('AUD', 'AUD'), ('NZD', 'NZD'),
    ('SGD', 'SGD'), ('AED', 'AED'), ('INR', 'INR'),
    ('PKR', 'PKR'),
]


class BillingProfile(models.Model):
    tenant        = models.OneToOneField('tenants.Tenant', on_delete=models.CASCADE, related_name='billing_profile')
    company_name  = models.CharField(max_length=200, blank=True)
    address       = models.TextField(blank=True)
    email         = models.EmailField(blank=True)
    phone         = models.CharField(max_length=30, blank=True)
    payment_terms = models.TextField(blank=True, default='Payment due within 30 days of invoice date.')
    updated_at    = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'billing_profiles'

    def __str__(self):
        return f'BillingProfile({self.tenant.slug})'


class OrgBillingRate(models.Model):
    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant      = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='org_billing_rates')
    org         = models.OneToOneField('tenants.ClientOrganization', on_delete=models.CASCADE, related_name='billing_rate')
    mode        = models.CharField(max_length=20, choices=RATE_MODE_CHOICES, default='per_ticket')
    currency    = models.CharField(max_length=3, choices=CURRENCY_CHOICES, default='USD')
    hourly_rate = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    l1_rate     = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    l2_rate     = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    l3_rate     = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'org_billing_rates'

    def __str__(self):
        return f'{self.org.name} – {self.mode}'


class Invoice(models.Model):
    id             = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant         = models.ForeignKey('tenants.Tenant', on_delete=models.CASCADE, related_name='invoices')
    org            = models.ForeignKey('tenants.ClientOrganization', on_delete=models.CASCADE, related_name='invoices')
    invoice_number = models.CharField(max_length=50)
    period_from    = models.DateField()
    period_to      = models.DateField()
    status         = models.CharField(max_length=20, choices=INVOICE_STATUS_CHOICES, default='draft')
    currency       = models.CharField(max_length=3, default='USD')
    subtotal       = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    tax_rate       = models.DecimalField(max_digits=5,  decimal_places=2, default=Decimal('0.00'))
    tax_amount     = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    total          = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    created_at     = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table        = 'billing_invoices'
        ordering        = ['-created_at']
        unique_together = [['tenant', 'invoice_number']]

    def __str__(self):
        return self.invoice_number


class InvoiceLineItem(models.Model):
    id             = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    invoice        = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name='line_items')
    description    = models.CharField(max_length=500)
    unit_rate      = models.DecimalField(max_digits=10, decimal_places=2)
    amount         = models.DecimalField(max_digits=12, decimal_places=2)
    ticket_ref     = models.CharField(max_length=50,  blank=True)
    ticket_subject = models.CharField(max_length=500, blank=True)
    ticket_level   = models.CharField(max_length=10,  blank=True)
    log_date       = models.DateField(null=True, blank=True)
    agent_name     = models.CharField(max_length=200, blank=True)
    minutes        = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        db_table = 'billing_invoice_line_items'
        ordering = ['id']

    def __str__(self):
        return f'{self.invoice.invoice_number} – {self.description[:40]}'

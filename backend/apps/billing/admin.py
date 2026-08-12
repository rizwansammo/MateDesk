from django.contrib import admin
from .models import BillingProfile, OrgBillingRate, Invoice, InvoiceLineItem

admin.site.register(BillingProfile)
admin.site.register(OrgBillingRate)
admin.site.register(Invoice)
admin.site.register(InvoiceLineItem)

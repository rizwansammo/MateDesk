from rest_framework import serializers
from .models import BillingProfile, OrgBillingRate, Invoice, InvoiceLineItem


class BillingProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model  = BillingProfile
        fields = ['company_name', 'address', 'email', 'phone', 'payment_terms', 'updated_at']
        read_only_fields = ['updated_at']


class OrgBillingRateSerializer(serializers.ModelSerializer):
    org_id   = serializers.UUIDField(source='org.id',   read_only=True)
    org_name = serializers.CharField(source='org.name', read_only=True)

    class Meta:
        model  = OrgBillingRate
        fields = ['id', 'org_id', 'org_name', 'mode', 'currency',
                  'hourly_rate', 'l1_rate', 'l2_rate', 'l3_rate', 'updated_at']
        read_only_fields = ['id', 'org_id', 'org_name', 'updated_at']


class InvoiceLineItemSerializer(serializers.ModelSerializer):
    class Meta:
        model  = InvoiceLineItem
        fields = ['id', 'description', 'unit_rate', 'amount',
                  'ticket_ref', 'ticket_subject', 'ticket_level',
                  'log_date', 'agent_name', 'minutes']


class InvoiceSerializer(serializers.ModelSerializer):
    org_id     = serializers.UUIDField(source='org.id',   read_only=True)
    org_name   = serializers.CharField(source='org.name', read_only=True)
    line_items = InvoiceLineItemSerializer(many=True, read_only=True)
    source = serializers.SerializerMethodField()

    def get_source(self, invoice):
        return 'project_time' if hasattr(invoice, 'project_time_run') else 'ticket'

    class Meta:
        model  = Invoice
        fields = ['id', 'invoice_number', 'source', 'org_id', 'org_name',
                  'period_from', 'period_to', 'status', 'currency',
                  'subtotal', 'tax_rate', 'tax_amount', 'total',
                  'line_items', 'created_at']

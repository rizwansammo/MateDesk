from decimal import Decimal, ROUND_HALF_UP
from datetime import date

from django.http import HttpResponse
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.permissions import IsTenantUser, MSP_ROLES
from apps.tenants.models import ClientOrganization
from apps.tickets.models import Ticket, TimeLog

from .models import BillingProfile, OrgBillingRate, Invoice, InvoiceLineItem
from .serializers import BillingProfileSerializer, OrgBillingRateSerializer, InvoiceSerializer
from .pdf import generate_invoice_pdf


def _tenant(request):
    return getattr(request, 'tenant', None) or getattr(request.user, 'tenant', None)


def _next_invoice_number(tenant) -> str:
    yr   = date.today().year
    last = (Invoice.objects
            .filter(tenant=tenant, invoice_number__startswith=f'INV-{yr}-')
            .order_by('-invoice_number')
            .first())
    seq = 1
    if last:
        try:
            seq = int(last.invoice_number.split('-')[-1]) + 1
        except (ValueError, IndexError):
            pass
    return f'INV-{yr}-{seq:04d}'


class BillingProfileView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request):
        tenant = _tenant(request)
        if not tenant:
            return Response({'detail': 'No tenant.'}, status=400)
        profile, _ = BillingProfile.objects.get_or_create(tenant=tenant)
        return Response(BillingProfileSerializer(profile).data)

    def patch(self, request):
        tenant = _tenant(request)
        if not tenant:
            return Response({'detail': 'No tenant.'}, status=400)
        if request.user.role not in MSP_ROLES:
            return Response({'detail': 'MSP staff only.'}, status=403)
        profile, _ = BillingProfile.objects.get_or_create(tenant=tenant)
        ser = BillingProfileSerializer(profile, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)


class OrgRateListView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request):
        tenant = _tenant(request)
        if not tenant:
            return Response({'detail': 'No tenant.'}, status=400)
        orgs  = ClientOrganization.objects.filter(tenant=tenant, is_active=True).order_by('name')
        rates = {r.org_id: r for r in OrgBillingRate.objects.filter(tenant=tenant)}
        result = []
        for org in orgs:
            rate = rates.get(org.id)
            result.append({
                'org_id':   str(org.id),
                'org_name': org.name,
                'rate':     OrgBillingRateSerializer(rate).data if rate else None,
            })
        return Response(result)


class OrgRateDetailView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def _get_org(self, request, org_id):
        tenant = _tenant(request)
        return ClientOrganization.objects.filter(id=org_id, tenant=tenant).first(), tenant

    def get(self, request, org_id):
        org, _tenant = self._get_org(request, org_id)
        if not org:
            return Response({'detail': 'Not found.'}, status=404)
        rate = OrgBillingRate.objects.filter(org=org).first()
        return Response(OrgBillingRateSerializer(rate).data if rate else None)

    def put(self, request, org_id):
        org, tenant = self._get_org(request, org_id)
        if not org:
            return Response({'detail': 'Not found.'}, status=404)
        if request.user.role not in MSP_ROLES:
            return Response({'detail': 'MSP staff only.'}, status=403)
        rate, _ = OrgBillingRate.objects.get_or_create(org=org, defaults={'tenant': tenant})
        ser = OrgBillingRateSerializer(rate, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        rate = ser.save()
        return Response(OrgBillingRateSerializer(rate).data)


class InvoiceListView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request):
        tenant = _tenant(request)
        if not tenant:
            return Response({'detail': 'No tenant.'}, status=400)
        qs = (Invoice.objects
              .filter(tenant=tenant)
              .select_related('org')
              .prefetch_related('line_items'))
        org_id = request.query_params.get('org_id')
        if org_id:
            qs = qs.filter(org_id=org_id)
        return Response(InvoiceSerializer(qs, many=True).data)

    def post(self, request):
        tenant = _tenant(request)
        if not tenant:
            return Response({'detail': 'No tenant.'}, status=400)
        if request.user.role not in MSP_ROLES:
            return Response({'detail': 'MSP staff only.'}, status=403)

        org_id      = request.data.get('org_id')
        period_from = request.data.get('period_from')
        period_to   = request.data.get('period_to')
        tax_rate    = Decimal(str(request.data.get('tax_rate') or '0'))

        if not all([org_id, period_from, period_to]):
            return Response({'detail': 'org_id, period_from and period_to are required.'}, status=400)

        org = ClientOrganization.objects.filter(id=org_id, tenant=tenant).first()
        if not org:
            return Response({'detail': 'Organization not found.'}, status=404)

        rate = OrgBillingRate.objects.filter(org=org, tenant=tenant).first()
        if not rate:
            return Response({'detail': 'No billing rate configured for this organization.'}, status=400)

        line_items_data = []
        subtotal        = Decimal('0.00')

        if rate.mode == 'hourly':
            hourly = rate.hourly_rate or Decimal('0.00')
            logs   = (TimeLog.objects
                      .filter(tenant=tenant, ticket__client_org=org,
                              date__gte=period_from, date__lte=period_to)
                      .select_related('agent', 'ticket')
                      .order_by('date', 'ticket__ticket_ref'))

            for log in logs:
                hrs    = Decimal(log.minutes) / Decimal(60)
                amount = (hrs * hourly).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                subtotal += amount
                line_items_data.append(dict(
                    description    = log.description or log.ticket.subject,
                    unit_rate      = hourly,
                    amount         = amount,
                    log_date       = log.date,
                    agent_name     = log.agent.full_name if log.agent else 'Unknown',
                    minutes        = log.minutes,
                    ticket_ref     = log.ticket.ticket_ref,
                    ticket_subject = log.ticket.subject,
                ))
        else:
            tickets = (Ticket.objects
                       .filter(tenant=tenant, client_org=org,
                               status__in=['solved', 'closed'],
                               updated_at__date__gte=period_from,
                               updated_at__date__lte=period_to)
                       .order_by('updated_at'))

            rate_map = {
                'L1': rate.l1_rate or Decimal('0.00'),
                'L2': rate.l2_rate or Decimal('0.00'),
                'L3': rate.l3_rate or Decimal('0.00'),
            }

            for ticket in tickets:
                lvl    = ticket.level or 'L1'
                amount = rate_map.get(lvl, Decimal('0.00'))
                subtotal += amount
                line_items_data.append(dict(
                    description    = ticket.subject,
                    unit_rate      = amount,
                    amount         = amount,
                    ticket_ref     = ticket.ticket_ref,
                    ticket_subject = ticket.subject,
                    ticket_level   = ticket.level or '',
                ))

        tax_amount = (subtotal * tax_rate / Decimal('100')).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        total      = subtotal + tax_amount

        invoice = Invoice.objects.create(
            tenant         = tenant,
            org            = org,
            invoice_number = _next_invoice_number(tenant),
            period_from    = period_from,
            period_to      = period_to,
            currency       = rate.currency,
            subtotal       = subtotal,
            tax_rate       = tax_rate,
            tax_amount     = tax_amount,
            total          = total,
        )

        for item_data in line_items_data:
            InvoiceLineItem.objects.create(invoice=invoice, **item_data)

        inv = (Invoice.objects
               .filter(pk=invoice.pk)
               .select_related('org')
               .prefetch_related('line_items')
               .first())
        return Response(InvoiceSerializer(inv).data, status=201)


class InvoiceDetailView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def _get(self, request, pk):
        tenant = _tenant(request)
        return (Invoice.objects
                .filter(id=pk, tenant=tenant)
                .select_related('org')
                .prefetch_related('line_items')
                .first())

    def patch(self, request, pk):
        invoice = self._get(request, pk)
        if not invoice:
            return Response({'detail': 'Not found.'}, status=404)
        if request.user.role not in MSP_ROLES:
            return Response({'detail': 'MSP staff only.'}, status=403)
        new_status = request.data.get('status')
        if new_status not in ('draft', 'sent', 'paid'):
            return Response({'detail': 'Invalid status.'}, status=400)
        invoice.status = new_status
        invoice.save(update_fields=['status'])
        return Response(InvoiceSerializer(invoice).data)

    def delete(self, request, pk):
        invoice = self._get(request, pk)
        if not invoice:
            return Response({'detail': 'Not found.'}, status=404)
        if request.user.role not in MSP_ROLES:
            return Response({'detail': 'MSP staff only.'}, status=403)
        invoice.delete()
        return Response(status=204)


class InvoicePDFView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request, pk):
        tenant  = _tenant(request)
        invoice = (Invoice.objects
                   .filter(id=pk, tenant=tenant)
                   .select_related('org', 'tenant', 'tenant__billing_profile')
                   .prefetch_related('line_items')
                   .first())
        if not invoice:
            return Response({'detail': 'Not found.'}, status=404)

        try:
            pdf_bytes = generate_invoice_pdf(invoice)
        except Exception as exc:
            return Response({'detail': f'PDF generation failed: {exc}'}, status=500)
        response  = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{invoice.invoice_number}.pdf"'
        return response

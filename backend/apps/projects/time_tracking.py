"""Project staff time, manager review, and explicit invoicing via existing Billing."""
from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from django.db.models import Sum, Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.billing.models import Invoice, InvoiceLineItem
from apps.billing.serializers import InvoiceSerializer
from apps.billing.views import _next_invoice_number
from apps.tenants.models import Tenant
from apps.users.models import User
from apps.users.permissions import MSP_ROLES, IsTenantUser

from .models import (
    Project, ProjectTimeEntry, ProjectTimeRate, ProjectTimeInvoiceRun, WorkItem,
)
from .permissions import can_edit_work, can_manage_project, visible_projects


CENTS = Decimal('0.01')
MAX_TOTAL = Decimal('9999999999.99')


class TimeWriteSerializer(serializers.Serializer):
    work_item_id = serializers.UUIDField()
    spent_on = serializers.DateField()
    minutes = serializers.IntegerField(min_value=1, max_value=1440)
    description = serializers.CharField(min_length=1, max_length=2000, trim_whitespace=True)
    billable = serializers.BooleanField(default=False)
    staff_id = serializers.UUIDField(required=False)
    request_id = serializers.UUIDField()


class TimeEditSerializer(serializers.Serializer):
    spent_on = serializers.DateField(required=False)
    minutes = serializers.IntegerField(min_value=1, max_value=1440, required=False)
    description = serializers.CharField(min_length=1, max_length=2000, trim_whitespace=True, required=False)
    billable = serializers.BooleanField(required=False)


class TimeReviewSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(choices=['approved', 'rejected'])
    note = serializers.CharField(max_length=1000, allow_blank=True, required=False, default='')


class TimeRateSerializer(serializers.Serializer):
    hourly_rate = serializers.DecimalField(max_digits=10, decimal_places=2,
                                          min_value=Decimal('0.01'))
    currency = serializers.ChoiceField(choices=ProjectTimeRate.CURRENCIES)


class ProjectInvoiceInputSerializer(serializers.Serializer):
    period_from = serializers.DateField()
    period_to = serializers.DateField()
    tax_rate = serializers.DecimalField(
        max_digits=5, decimal_places=2, min_value=Decimal('0.00'),
        max_value=Decimal('100.00'), default=Decimal('0.00'),
    )
    request_id = serializers.UUIDField()

    def validate(self, attrs):
        if attrs['period_from'] > attrs['period_to']:
            raise serializers.ValidationError({
                'period_to': 'End date must be on or after start date.',
            })
        return attrs


def _details(entry, viewer):
    return {
        'id': str(entry.pk),
        'project_id': str(entry.project_id),
        'work_item_id': str(entry.work_item_id),
        'work_item_ref': entry.work_item.ref,
        'work_item_title': entry.work_item.title,
        'staff_id': str(entry.staff_id) if entry.staff_id else None,
        'staff_name': entry.staff_name,
        'spent_on': entry.spent_on,
        'minutes': entry.minutes,
        'description': entry.description,
        'billable': entry.billable,
        'review_state': entry.review_state,
        'review_note': entry.review_note,
        'reviewed_by_name': entry.reviewed_by.full_name if entry.reviewed_by_id else None,
        'invoice_number': entry.invoice_line.invoice.invoice_number if entry.invoice_line_id else None,
        'is_invoiced': bool(entry.invoice_line_id),
        'is_mine': entry.staff_id == viewer.pk,
        'created_at': entry.created_at,
        'updated_at': entry.updated_at,
    }


class TimeAccess(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def _project(self, request, pk, *, manager=False):
        project = get_object_or_404(visible_projects(request), pk=pk)
        if request.user.role not in MSP_ROLES:
            raise PermissionDenied('Project time and costs are staff only.')
        if manager:
            if not can_manage_project(request.user, project):
                raise PermissionDenied('Only a Project Manager can perform this action.')
        elif not can_edit_work(request.user, project):
            raise PermissionDenied('Project contributor access required.')
        return project

    def _entries(self, request, project):
        rows = ProjectTimeEntry.objects.filter(project=project).select_related(
            'project', 'work_item__project', 'staff', 'reviewed_by', 'invoice_line__invoice',
        )
        if not can_manage_project(request.user, project):
            rows = rows.filter(staff=request.user)
        return rows


class ProjectTimeEntriesView(TimeAccess):
    def get(self, request, pk):
        project = self._project(request, pk)
        qs = self._entries(request, project)
        work_item_id = request.query_params.get('work_item_id')
        if work_item_id:
            try:
                work_item_id = serializers.UUIDField().run_validation(work_item_id)
            except serializers.ValidationError as exc:
                raise ValidationError({'work_item_id': 'Invalid UUID.'}) from exc
            if not WorkItem.objects.filter(project=project, pk=work_item_id).exists():
                raise ValidationError({'work_item_id': 'Invalid Project Work Item.'})
            qs = qs.filter(work_item_id=work_item_id)
        try:
            page = int(request.query_params.get('page', '1'))
        except (TypeError, ValueError):
            raise ValidationError({'page': 'Page must be a positive number.'})
        if page < 1 or page > 10000:
            raise ValidationError({'page': 'Page is outside the supported range.'})
        count = qs.count()
        rows = qs[(page - 1) * 25:page * 25]
        return Response({
            'count': count, 'page': page, 'page_size': 25,
            'has_more': page * 25 < count,
            'results': [_details(row, request.user) for row in rows],
            'can_manage': can_manage_project(request.user, project),
        })

    def post(self, request, pk):
        project = self._project(request, pk)
        data = TimeWriteSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        attrs = data.validated_data
        manager = can_manage_project(request.user, project)
        staff_id = attrs.get('staff_id', request.user.pk)
        if staff_id != request.user.pk and not manager:
            raise PermissionDenied('Only Project Managers can log time for another staff member.')
        if attrs['spent_on'] > timezone.localdate():
            raise ValidationError({'spent_on': 'Future work time cannot be recorded.'})
        with transaction.atomic():
            project = Project.objects.select_for_update().get(pk=project.pk)
            if project.status == 'archived':
                raise PermissionDenied('Archived projects are read only.')
            existing = ProjectTimeEntry.objects.filter(
                project=project, logged_by=request.user, request_id=attrs['request_id'],
            ).select_related('work_item', 'invoice_line__invoice', 'reviewed_by').first()
            if existing:
                if (existing.staff_id != staff_id
                        or existing.work_item_id != attrs['work_item_id']
                        or existing.spent_on != attrs['spent_on']
                        or existing.minutes != attrs['minutes']
                        or existing.billable != attrs['billable']
                        or existing.description != attrs['description']):
                    raise ValidationError({'request_id': 'This request ID was already used.'})
                return Response(_details(existing, request.user), status=status.HTTP_200_OK)
            item = get_object_or_404(WorkItem, project=project, pk=attrs['work_item_id'])
            staff = get_object_or_404(User, pk=staff_id, tenant=project.tenant,
                                     is_active=True, role__in=MSP_ROLES)
            entry = ProjectTimeEntry(
                project=project, work_item=item, staff=staff,
                staff_name=staff.full_name or staff.email,
                logged_by=request.user,
                spent_on=attrs['spent_on'], minutes=attrs['minutes'],
                description=attrs['description'], billable=attrs['billable'],
                request_id=attrs['request_id'],
                review_state='approved' if manager else 'pending',
                reviewed_by=request.user if manager else None,
                reviewed_at=timezone.now() if manager else None,
            )
            self._save(entry)
        return Response(_details(entry, request.user), status=status.HTTP_201_CREATED)

    @staticmethod
    def _save(model):
        from django.core.exceptions import ValidationError as DjangoValidationError
        try:
            model.save()
        except DjangoValidationError as exc:
            raise ValidationError(
                getattr(exc, 'message_dict', None) or exc.messages
            ) from exc


class ProjectTimeEntryDetailView(ProjectTimeEntriesView):
    def patch(self, request, pk, entry_id):
        project = self._project(request, pk)
        data = TimeEditSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        if not data.validated_data:
            raise ValidationError({'detail': 'No time changes provided.'})
        manager = can_manage_project(request.user, project)
        with transaction.atomic():
            Project.objects.select_for_update().get(pk=project.pk)
            entry = get_object_or_404(self._entries(request, project).select_for_update(of=('self',)),
                                      pk=entry_id)
            if project.status == 'archived':
                raise PermissionDenied('Archived projects are read only.')
            if entry.invoice_line_id:
                raise ValidationError({'detail': 'Invoiced time cannot be changed.'})
            for key, value in data.validated_data.items():
                setattr(entry, key, value)
            if entry.spent_on > timezone.localdate():
                raise ValidationError({'spent_on': 'Future work time cannot be recorded.'})
            entry.review_state = 'approved' if manager else 'pending'
            entry.reviewed_by = request.user if manager else None
            entry.reviewed_at = timezone.now() if manager else None
            entry.review_note = ''
            self._save(entry)
        return Response(_details(entry, request.user))


class ProjectTimeReviewView(TimeAccess):
    def post(self, request, pk, entry_id):
        project = self._project(request, pk, manager=True)
        data = TimeReviewSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        with transaction.atomic():
            Project.objects.select_for_update().get(pk=project.pk)
            entry = get_object_or_404(
                self._entries(request, project).select_for_update(of=('self',)), pk=entry_id,
            )
            if project.status == 'archived':
                raise PermissionDenied('Archived projects are read only.')
            if entry.invoice_line_id:
                raise ValidationError({'detail': 'Invoiced time is locked.'})
            entry.review_state = data.validated_data['decision']
            entry.review_note = data.validated_data['note']
            entry.reviewed_by = request.user
            entry.reviewed_at = timezone.now()
            ProjectTimeEntriesView._save(entry)
        return Response(_details(entry, request.user))


class ProjectTimeSummaryView(TimeAccess):
    def get(self, request, pk):
        project = self._project(request, pk)
        qs = self._entries(request, project)
        manager = can_manage_project(request.user, project)
        totals = qs.aggregate(
            entries=Count('id'), total_minutes=Sum('minutes'),
            billable_minutes=Sum('minutes', filter=Q(billable=True)),
            non_billable_minutes=Sum('minutes', filter=Q(billable=False)),
            approved_minutes=Sum('minutes', filter=Q(review_state='approved')),
            pending_minutes=Sum('minutes', filter=Q(review_state='pending')),
        )
        response = {
            'entries': totals['entries'],
            'total_minutes': totals['total_minutes'] or 0,
            'billable_minutes': totals['billable_minutes'] or 0,
            'non_billable_minutes': totals['non_billable_minutes'] or 0,
            'approved_minutes': totals['approved_minutes'] or 0,
            'pending_minutes': totals['pending_minutes'] or 0,
            'by_work_item': [{
                'work_item_id': str(row['work_item_id']),
                'work_item_ref': f"{project.key}-{row['work_item__number']}",
                'minutes': row['minutes'] or 0,
            } for row in qs.values('work_item_id', 'work_item__number')
                .annotate(minutes=Sum('minutes')).order_by('work_item__number')],
            'by_staff': [{
                'staff_name': row['staff_name'],
                'minutes': row['minutes'] or 0,
            } for row in qs.values('staff_name').annotate(minutes=Sum('minutes'))
                .order_by('staff_name')],
            'can_manage': manager,
        }
        if manager:
            rate = ProjectTimeRate.objects.filter(project=project).first()
            approved = qs.filter(billable=True, review_state='approved',
                                 invoice_line__isnull=True)
            eligible = list(approved.values_list('minutes', flat=True))
            response.update({
                'ready_minutes': sum(eligible),
                'ready_entries': len(eligible),
                'hourly_rate': str(rate.hourly_rate) if rate else None,
                'currency': rate.currency if rate else None,
                'estimated_unbilled_amount': str(sum(
                    ((Decimal(minutes) * rate.hourly_rate / Decimal(60)).quantize(
                        CENTS, rounding=ROUND_HALF_UP
                    ) for minutes in eligible), Decimal('0.00'),
                )) if rate else None,
            })
        return Response(response)


class ProjectTimeRateView(TimeAccess):
    def get(self, request, pk):
        project = self._project(request, pk, manager=True)
        row = ProjectTimeRate.objects.filter(project=project).first()
        return Response({
            'hourly_rate': str(row.hourly_rate) if row else None,
            'currency': row.currency if row else 'USD',
            'updated_at': row.updated_at if row else None,
        })

    def put(self, request, pk):
        project = self._project(request, pk, manager=True)
        if project.status == 'archived':
            raise PermissionDenied('Archived projects are read only.')
        data = TimeRateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        with transaction.atomic():
            Project.objects.select_for_update().get(pk=project.pk)
            row = ProjectTimeRate.objects.filter(project=project).first()
            if row is None:
                row = ProjectTimeRate(project=project)
            row.hourly_rate = data.validated_data['hourly_rate']
            row.currency = data.validated_data['currency']
            row.updated_by = request.user
            ProjectTimeEntriesView._save(row)
        return Response({
            'hourly_rate': str(row.hourly_rate),
            'currency': row.currency,
            'updated_at': row.updated_at,
        })


class ProjectTimeInvoicesView(TimeAccess):
    def get(self, request, pk):
        project = self._project(request, pk, manager=True)
        runs = ProjectTimeInvoiceRun.objects.filter(project=project).select_related(
            'invoice', 'created_by',
        )[:100]
        return Response([{
            'invoice_id': str(row.invoice_id),
            'invoice_number': row.invoice.invoice_number,
            'status': row.invoice.status,
            'currency': row.invoice.currency,
            'total': str(row.invoice.total),
            'period_from': row.invoice.period_from,
            'period_to': row.invoice.period_to,
            'created_at': row.created_at,
        } for row in runs])

    def post(self, request, pk):
        project = self._project(request, pk, manager=True)
        if project.status == 'archived':
            raise PermissionDenied('Archived projects are read only.')
        data = ProjectInvoiceInputSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        attrs = data.validated_data
        with transaction.atomic():
            # Serializes invoice numbering and invoice requests across this tenant.
            Tenant.objects.select_for_update().get(pk=project.tenant_id)
            project = Project.objects.select_for_update().get(pk=project.pk)
            previous = ProjectTimeInvoiceRun.objects.filter(
                project=project, request_id=attrs['request_id'],
            ).select_related('invoice').first()
            if previous:
                inv = previous.invoice
                if (inv.period_from != attrs['period_from']
                        or inv.period_to != attrs['period_to']
                        or inv.tax_rate != attrs['tax_rate']):
                    raise ValidationError({'request_id': 'This invoice request was already used.'})
                return Response(InvoiceSerializer(inv).data, status=status.HTTP_200_OK)
            rate = ProjectTimeRate.objects.filter(project=project).first()
            if not rate:
                raise ValidationError({'hourly_rate': 'Configure a Project hourly rate first.'})
            eligible = list(ProjectTimeEntry.objects.select_for_update().filter(
                project=project, billable=True, review_state='approved',
                spent_on__gte=attrs['period_from'], spent_on__lte=attrs['period_to'],
                invoice_line__isnull=True,
            ).select_related('work_item').order_by('spent_on', 'created_at', 'id'))
            if not eligible:
                raise ValidationError({
                    'detail': 'No approved unbilled Project time is available for this period.',
                })
            prices = [
                (Decimal(row.minutes) * rate.hourly_rate / Decimal(60)).quantize(
                    CENTS, rounding=ROUND_HALF_UP,
                ) for row in eligible
            ]
            subtotal = sum(prices, Decimal('0.00'))
            if subtotal <= 0:
                raise ValidationError({'detail': 'The billable amount is below the minimum charge.'})
            tax = (subtotal * attrs['tax_rate'] / Decimal(100)).quantize(
                CENTS, rounding=ROUND_HALF_UP,
            )
            total = subtotal + tax
            if total > MAX_TOTAL:
                raise ValidationError({'detail': 'Invoice amount exceeds supported limits.'})
            invoice = Invoice.objects.create(
                tenant=project.tenant, org=project.client_org,
                invoice_number=_next_invoice_number(project.tenant),
                period_from=attrs['period_from'], period_to=attrs['period_to'],
                currency=rate.currency, subtotal=subtotal,
                tax_rate=attrs['tax_rate'], tax_amount=tax, total=total,
                status='draft',
            )
            for row, price in zip(eligible, prices):
                label = f"Project {project.key} · {row.work_item.ref}: {row.description}"[:500]
                line = InvoiceLineItem.objects.create(
                    invoice=invoice, description=label,
                    unit_rate=rate.hourly_rate, amount=price,
                    log_date=row.spent_on, agent_name=row.staff_name[:200],
                    minutes=row.minutes,
                )
                # Intentional audited internal association; ordinary record.save()
                # rejects editing an already invoiced time entry.
                ProjectTimeEntry.objects.filter(pk=row.pk, invoice_line__isnull=True).update(
                    invoice_line=line,
                )
            ProjectTimeEntriesView._save(ProjectTimeInvoiceRun(
                project=project, invoice=invoice, request_id=attrs['request_id'],
                created_by=request.user,
            ))
        return Response(InvoiceSerializer(invoice).data, status=status.HTTP_201_CREATED)


class ProjectTimeInvoiceVoidView(TimeAccess):
    def post(self, request, pk, invoice_id):
        project = self._project(request, pk, manager=True)
        with transaction.atomic():
            Tenant.objects.select_for_update().get(pk=project.tenant_id)
            Project.objects.select_for_update().get(pk=project.pk)
            run = get_object_or_404(
                ProjectTimeInvoiceRun.objects.select_related('invoice'),
                project=project, invoice_id=invoice_id,
            )
            invoice = Invoice.objects.select_for_update().get(pk=run.invoice_id)
            if invoice.status != 'draft':
                raise ValidationError({
                    'detail': 'Sent or paid Project invoices cannot be voided here.',
                })
            ProjectTimeEntry.objects.filter(invoice_line__invoice=invoice).update(invoice_line=None)
            invoice.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

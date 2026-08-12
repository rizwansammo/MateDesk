from django.urls import path
from .views import (
    BillingProfileView,
    OrgRateListView, OrgRateDetailView,
    InvoiceListView, InvoiceDetailView, InvoicePDFView,
)

urlpatterns = [
    path('billing/profile/',                    BillingProfileView.as_view()),
    path('billing/rates/',                      OrgRateListView.as_view()),
    path('billing/rates/<uuid:org_id>/',        OrgRateDetailView.as_view()),
    path('billing/invoices/',                   InvoiceListView.as_view()),
    path('billing/invoices/<uuid:pk>/',         InvoiceDetailView.as_view()),
    path('billing/invoices/<uuid:pk>/pdf/',     InvoicePDFView.as_view()),
]

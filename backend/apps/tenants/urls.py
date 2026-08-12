from django.urls import path
from rest_framework.routers import SimpleRouter
from .views import ClientOrgViewSet, OrgUsersView, TenantBrandingView, TenantDetailView, TransferOwnershipView

router = SimpleRouter(trailing_slash=True)
router.register(r'organizations', ClientOrgViewSet, basename='org')

urlpatterns = router.urls + [
    path('organizations/<uuid:pk>/users/', OrgUsersView.as_view(),           name='org_users'),
    path('tenant/',                        TenantDetailView.as_view(),       name='tenant_detail'),
    path('tenant/branding/',               TenantBrandingView.as_view(),     name='tenant_branding'),
    path('tenant/transfer-ownership/',     TransferOwnershipView.as_view(), name='tenant_transfer_ownership'),
]

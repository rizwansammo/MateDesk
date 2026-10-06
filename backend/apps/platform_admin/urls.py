from django.urls import path
from . import views

app_name = 'platform_admin'

urlpatterns = [
    path('', views.login_view, name='login_redirect'),
    path('login/', views.login_view, name='login'),
    path('logout/', views.logout_view, name='logout'),
    path('dashboard/', views.dashboard, name='dashboard'),

    # Tenants
    path('tenants/', views.tenants_list, name='tenants_list'),
    path('tenants/create/', views.tenant_create, name='tenant_create'),
    path('tenants/<uuid:pk>/', views.tenant_detail, name='tenant_detail'),
    path('tenants/<uuid:pk>/delete/', views.tenant_delete, name='tenant_delete'),
    path('tenants/<uuid:pk>/schedule-delete/', views.tenant_schedule_delete, name='tenant_schedule_delete'),
    path('tenants/<uuid:pk>/cancel-delete/', views.tenant_cancel_delete, name='tenant_cancel_delete'),
    path('tenants/<uuid:pk>/deactivate/', views.tenant_deactivate, name='tenant_deactivate'),
    path('tenants/<uuid:pk>/reactivate/', views.tenant_reactivate, name='tenant_reactivate'),
    path('tenants/<uuid:pk>/reset-password/', views.tenant_reset_owner_password, name='tenant_reset_password'),
    path('tenants/<uuid:pk>/change-plan/', views.tenant_change_plan, name='tenant_change_plan'),
    path('tenants/<uuid:pk>/update-subscription/', views.tenant_update_subscription, name='tenant_update_subscription'),
    path('tenants/<uuid:pk>/branding/', views.tenant_update_branding, name='tenant_update_branding'),
    path('tenants/<uuid:pk>/domains/add/', views.tenant_domain_add, name='tenant_domain_add'),
    path('tenants/<uuid:pk>/domains/<uuid:domain_id>/verify/', views.tenant_domain_verify, name='tenant_domain_verify'),
    path('tenants/<uuid:pk>/domains/<uuid:domain_id>/retry/', views.tenant_domain_retry, name='tenant_domain_retry'),
    path('tenants/<uuid:pk>/domains/<uuid:domain_id>/disable/', views.tenant_domain_disable, name='tenant_domain_disable'),
    path('tenants/<uuid:pk>/domains/<uuid:domain_id>/reenable/', views.tenant_domain_reenable, name='tenant_domain_reenable'),
    path('tenants/<uuid:pk>/domains/<uuid:domain_id>/primary/', views.tenant_domain_set_primary, name='tenant_domain_set_primary'),
    path('tenants/<uuid:pk>/domains/<uuid:domain_id>/remove/', views.tenant_domain_remove, name='tenant_domain_remove'),

    # Subscriptions
    path('subscriptions/plans/', views.plans_list, name='plans_list'),
    path('subscriptions/plans/<int:pk>/update/', views.plan_update, name='plan_update'),
    path('subscriptions/', views.subscriptions_list, name='subscriptions_list'),

    # Accounts
    path('accounts/admins/', views.admins_list, name='admins_list'),
    path('accounts/admins/create/', views.admin_create, name='admin_create'),
    path('accounts/admins/<uuid:pk>/deactivate/', views.admin_deactivate, name='admin_deactivate'),
    path('accounts/admins/<uuid:pk>/update/', views.admin_update, name='admin_update'),
    path('accounts/admins/<uuid:pk>/reset-password/', views.admin_reset_password, name='admin_reset_password'),
    path('accounts/msp-owners/', views.msp_owners_list, name='msp_owners'),
    path('accounts/msp-owners/<uuid:pk>/reset-password/', views.msp_owner_reset_password, name='msp_owner_reset_password'),
    path('accounts/msp-managers/', views.msp_managers_list, name='msp_managers'),
    path('accounts/msp-agents/', views.msp_agents_list, name='msp_agents'),
    path('accounts/client-users/', views.client_users_list, name='client_users'),

    # Organizations
    path('organizations/', views.organizations_list, name='organizations_list'),

    # Helpdesk
    path('helpdesk/overview/', views.helpdesk_overview, name='helpdesk_overview'),
    path('helpdesk/email-health/', views.email_health, name='email_health'),

    # 2FA (login flow — no auth required)
    path('auth/2fa/', views.two_fa_verify, name='two_fa_verify'),

    # 2FA Setup (requires login)
    path('security/2fa/', views.two_fa_setup, name='two_fa_setup'),
    path('security/2fa/setup-totp/', views.two_fa_setup_totp, name='two_fa_setup_totp'),
    path('security/2fa/enable-email/', views.two_fa_enable_email, name='two_fa_enable_email'),
    path('security/2fa/disable-totp/', views.two_fa_disable_totp, name='two_fa_disable_totp'),
    path('security/2fa/disable-email/', views.two_fa_disable_email, name='two_fa_disable_email'),

    # Security
    path('security/audit-logs/', views.audit_logs, name='audit_logs'),
    path('security/login-activity/', views.login_activity, name='login_activity'),

    # Settings
    path('settings/', views.settings_index, name='settings'),
    path('settings/update/', views.settings_update, name='settings_update'),
]

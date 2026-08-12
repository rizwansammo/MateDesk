from django.urls import path

from .views import TenantLoginView, TenantTokenRefreshView, TenantRegisterView, MeView, LogoutView, UserDetailView, UserListView, StaffCreateView, ResetPasswordView

urlpatterns = [
    path('auth/register/', TenantRegisterView.as_view(),     name='auth_register'),
    path('auth/login/',    TenantLoginView.as_view(),        name='auth_login'),
    path('auth/refresh/',  TenantTokenRefreshView.as_view(), name='auth_refresh'),
    path('auth/logout/',   LogoutView.as_view(),             name='auth_logout'),
    path('auth/me/',       MeView.as_view(),                 name='auth_me'),
    path('users/',           UserListView.as_view(),         name='user_list'),
    path('users/<uuid:pk>/', UserDetailView.as_view(),       name='user_detail'),
    path('users/<uuid:pk>/reset-password/', ResetPasswordView.as_view(), name='user_reset_password'),
    path('staff/',           StaffCreateView.as_view(),      name='staff_create'),
]


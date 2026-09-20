from django.shortcuts import get_object_or_404

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.throttling import AnonRateThrottle
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError, InvalidToken

from .serializers import TenantTokenObtainPairSerializer, TenantRegisterSerializer, UserMeSerializer
from .permissions import IsTenantUser


class LoginRateThrottle(AnonRateThrottle):
    scope = 'auth_login'


class RegisterRateThrottle(AnonRateThrottle):
    scope = 'auth_register'


class TenantLoginView(TokenObtainPairView):
    permission_classes = [AllowAny]
    serializer_class   = TenantTokenObtainPairSerializer
    throttle_classes   = [LoginRateThrottle]


class TenantTokenRefreshView(TokenRefreshView):
    """
    Extends the default TokenRefreshView to validate that the refresh token
    was issued for the tenant resolved from the current subdomain, preventing
    cross-workspace token refresh.
    """
    def post(self, request, *args, **kwargs):
        req_tenant = getattr(request, 'tenant', None)
        if req_tenant is not None:
            raw = request.data.get('refresh', '')
            if raw:
                try:
                    token = RefreshToken(raw)
                    token_tenant_id = token.get('tenant_id')
                    if token_tenant_id and str(token_tenant_id) != str(req_tenant.id):
                        raise InvalidToken('Token does not belong to this workspace.')
                except TokenError as exc:
                    raise InvalidToken(exc.args[0]) from exc
        return super().post(request, *args, **kwargs)


class MeView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request):
        serializer = UserMeSerializer(request.user)
        return Response(serializer.data)


class TenantRegisterView(APIView):
    permission_classes = [AllowAny]
    throttle_classes   = [RegisterRateThrottle]

    def post(self, request):
        from django.conf import settings
        if not getattr(settings, 'PUBLIC_REGISTRATION_ENABLED', True):
            return Response({'detail': 'Not found.'}, status=404)

        serializer = TenantRegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.create(serializer.validated_data)
        return Response(data, status=201)


class LogoutView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def post(self, request):
        refresh_token = request.data.get('refresh')
        if refresh_token:
            try:
                token = RefreshToken(refresh_token)
                token.blacklist()
            except TokenError:
                # Already blacklisted or invalid — still proceed with logout
                pass
        return Response({'detail': 'Logged out successfully.'})


def _user_profile_response(user, tenant):
    from apps.tickets.models import Ticket
    MSP_ROLES = {'msp_owner', 'msp_manager', 'msp_agent'}
    is_staff  = user.role in MSP_ROLES
    qs = Ticket.objects.filter(tenant=tenant, assignee=user) if is_staff \
         else Ticket.objects.filter(tenant=tenant, requester=user)
    return {
        'id':              str(user.id),
        'full_name':       user.full_name,
        'first_name':      user.first_name,
        'last_name':       user.last_name,
        'email':           user.email,
        'role':            user.role,
        'job_title':       user.job_title,
        'department':      user.department,
        'phone':           user.phone,
        'employee_id':     user.employee_id,
        'reports_to':      user.reports_to,
        'business_impact': user.business_impact,
        'is_active':       user.is_active,
        'is_msp_staff':    is_staff,
        'date_joined':     user.date_joined.isoformat(),
        'org_id':          str(user.client_org.id) if user.client_org else None,
        'org_name':        user.client_org.name    if user.client_org else None,
        'total_tickets':   qs.count(),
        'open_tickets':    qs.filter(status__in=['open', 'in_progress', 'pending']).count(),
        'solved_tickets':  qs.filter(status='solved').count(),
        'closed_tickets':  qs.filter(status='closed').count(),
        'overdue_tickets': qs.filter(status__in=['open', 'in_progress', 'pending']).count(),
    }


class UserListView(APIView):
    """GET /api/users/?org=unattached|<uuid>  — list all client users for the tenant."""
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request):
        tenant = getattr(request, 'tenant', None) or getattr(request.user, 'tenant', None)
        if tenant is None:
            return Response([])
        if request.user.role not in {'msp_owner', 'msp_manager', 'msp_agent'}:
            return Response({'detail': 'Permission denied.'}, status=403)

        from .models import User
        MSP = {'msp_owner', 'msp_manager', 'msp_agent'}
        qs = (
            User.objects
            .filter(tenant=tenant)
            .exclude(role__in=MSP)
            .select_related('client_org')
            .order_by('first_name', 'last_name')
        )

        org_filter = request.query_params.get('org', '').strip()
        if org_filter == 'unattached':
            qs = qs.filter(client_org__isnull=True)
        elif org_filter:
            qs = qs.filter(client_org_id=org_filter)

        return Response([
            {
                'id':               str(u.id),
                'full_name':        u.full_name,
                'email':            u.email,
                'role':             u.role,
                'org_id':           str(u.client_org_id) if u.client_org_id else None,
                'org_name':         u.client_org.name    if u.client_org    else None,
                'deleted_org_name': u.deleted_org_name,
                'job_title':        u.job_title,
                'department':       u.department,
                'is_active':        u.is_active,
                'is_vip':           u.is_vip,
                'date_joined':      u.date_joined.isoformat(),
            }
            for u in qs
        ])


class UserDetailView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request, pk):
        tenant = getattr(request, 'tenant', None) or getattr(request.user, 'tenant', None)
        if tenant is None:
            return Response({'detail': 'No tenant context.'}, status=400)

        from .models import User
        from .permissions import CLIENT_ROLES
        user = get_object_or_404(User, pk=pk, tenant=tenant)

        # Client users can only view their own profile
        if request.user.role in CLIENT_ROLES and str(user.pk) != str(request.user.pk):
            return Response({'detail': 'Permission denied.'}, status=403)

        return Response(_user_profile_response(user, tenant))

    def delete(self, request, pk):
        tenant = getattr(request, 'tenant', None) or getattr(request.user, 'tenant', None)
        if tenant is None:
            return Response({'detail': 'No tenant context.'}, status=400)
        if request.user.role not in {'msp_owner', 'msp_manager', 'msp_agent'}:
            return Response({'detail': 'Permission denied.'}, status=403)

        from .models import User
        user = get_object_or_404(User, pk=pk, tenant=tenant)
        if str(user.pk) == str(request.user.pk):
            return Response({'detail': 'You cannot delete your own account.'}, status=400)
        if user.role in {'msp_owner', 'msp_manager', 'msp_agent'}:
            return Response({'detail': 'Cannot delete MSP staff from this endpoint.'}, status=400)
        user.delete()
        return Response(status=204)

    def patch(self, request, pk):
        tenant = getattr(request, 'tenant', None) or getattr(request.user, 'tenant', None)
        if tenant is None:
            return Response({'detail': 'No tenant context.'}, status=400)

        from .models import User
        from .permissions import MSP_ROLES, CLIENT_ROLES
        from apps.tenants.models import ClientOrganization

        user = get_object_or_404(User, pk=pk, tenant=tenant)
        data = request.data

        # ── Client-role users: can only edit their own profile, limited fields ──
        if request.user.role in CLIENT_ROLES:
            if str(user.pk) != str(request.user.pk):
                return Response({'detail': 'Permission denied: you can only edit your own profile.'}, status=403)
            # Sensitive fields client users must never change
            BLOCKED = {'role', 'is_active', 'client_org_id', 'email'}
            for blocked in BLOCKED:
                if blocked in data:
                    return Response(
                        {'detail': f"Field '{blocked}' cannot be changed by client users."},
                        status=403,
                    )
            # Only these profile fields are allowed for self-edit
            ALLOWED_SELF = {'first_name', 'last_name', 'phone', 'job_title', 'department',
                            'employee_id', 'reports_to', 'business_impact'}
            for field in ALLOWED_SELF:
                if field in data:
                    setattr(user, field, data[field])
            user.save()
            return Response(_user_profile_response(user, tenant))

        # ── MSP staff: full update capability (rank-gated) ──────────────────────
        VALID_ROLES = {'msp_owner', 'msp_manager', 'msp_agent', 'client_owner', 'end_user'}
        ROLE_RANK = {'end_user': 0, 'client_owner': 1, 'msp_agent': 2, 'msp_manager': 3, 'msp_owner': 4}

        actor_rank  = ROLE_RANK.get(request.user.role, 0)
        target_rank = ROLE_RANK.get(user.role, 0)
        is_self     = str(user.pk) == str(request.user.pk)

        # Privileged fields may only be changed by owners/managers, and never on a
        # user who currently outranks the actor — stops an agent promoting themselves
        # or disabling/editing more senior staff.
        ADMIN_FIELDS = {'role', 'is_active', 'client_org_id', 'is_vip', 'email'}
        if any(f in data for f in ADMIN_FIELDS):
            if request.user.role not in {'msp_owner', 'msp_manager'}:
                return Response(
                    {'detail': 'Only MSP owners or managers can change role, status, organization, or email.'},
                    status=403,
                )
            if target_rank > actor_rank:
                return Response(
                    {'detail': 'You cannot modify a user who outranks you.'},
                    status=403,
                )

        for field in ('first_name', 'last_name', 'phone', 'job_title', 'department',
                      'employee_id', 'reports_to', 'business_impact'):
            if field in data:
                setattr(user, field, data[field])

        if 'email' in data:
            new_email = data['email'].lower().strip()
            if new_email != user.email:
                if User.objects.filter(email=new_email).exclude(pk=user.pk).exists():
                    return Response({'detail': 'An account with this email already exists.'}, status=400)
                user.email = new_email

        if 'role' in data:
            new_role = data['role']
            if new_role not in VALID_ROLES:
                return Response({'detail': f"Invalid role '{new_role}'."}, status=400)
            if is_self:
                return Response({'detail': 'You cannot change your own role.'}, status=403)
            if ROLE_RANK.get(new_role, 0) > actor_rank:
                return Response({'detail': 'You cannot assign a role higher than your own.'}, status=403)
            user.role = new_role
            if new_role == 'client_owner' and not user.is_vip:
                user.is_vip = True

        if 'is_active' in data:
            if is_self:
                return Response({'detail': 'You cannot change your own active status.'}, status=403)
            user.is_active = bool(data['is_active'])

        if 'client_org_id' in data:
            org_id = data['client_org_id']
            if not org_id:
                user.client_org = None
            else:
                org = ClientOrganization.objects.filter(id=org_id, tenant=tenant).first()
                if org:
                    user.client_org = org

        if 'is_vip' in data:
            user.is_vip = bool(data['is_vip'])

        user.save()
        return Response(_user_profile_response(user, tenant))


class StaffCreateView(APIView):
    """POST /api/staff/ — create an MSP staff account directly (no invite flow)."""
    permission_classes = [IsAuthenticated, IsTenantUser]
    throttle_scope     = 'staff_create'

    def post(self, request):
        from .models import User
        tenant = getattr(request, 'tenant', None) or getattr(request.user, 'tenant', None)
        if tenant is None:
            return Response({'detail': 'No tenant context.'}, status=400)

        if request.user.role not in {'msp_owner', 'msp_manager'}:
            return Response({'detail': 'Permission denied.'}, status=403)

        first_name = request.data.get('first_name', '').strip()
        last_name  = request.data.get('last_name', '').strip()
        email      = request.data.get('email', '').strip().lower()
        password   = request.data.get('password', '')
        role       = request.data.get('role', '').strip()

        if not email or not password:
            return Response({'detail': 'Email and password are required.'}, status=400)
        if len(password) < 8:
            return Response({'detail': 'Password must be at least 8 characters.'}, status=400)

        ALLOWED_ROLES = {'msp_owner', 'msp_manager', 'msp_agent'}
        if request.user.role == 'msp_manager':
            ALLOWED_ROLES = {'msp_manager', 'msp_agent'}
        if role not in ALLOWED_ROLES:
            return Response({'detail': f"Invalid role. Allowed: {', '.join(sorted(ALLOWED_ROLES))}."}, status=400)

        if User.objects.filter(email=email).exists():
            return Response({'detail': 'An account with this email already exists.'}, status=400)

        user = User(
            tenant=tenant,
            email=email,
            first_name=first_name,
            last_name=last_name,
            role=role,
            is_active=True,
        )
        user.set_password(password)
        user.save()

        return Response({
            'id':        str(user.pk),
            'full_name': user.full_name,
            'email':     user.email,
            'role':      user.role,
        }, status=201)


class ResetPasswordView(APIView):
    """POST /api/users/<uuid>/reset-password/ — MSP staff resets a user's password."""
    permission_classes = [IsAuthenticated, IsTenantUser]
    throttle_scope     = 'password_reset'

    def post(self, request, pk):
        import secrets
        import string

        tenant = getattr(request, 'tenant', None) or getattr(request.user, 'tenant', None)
        if tenant is None:
            return Response({'detail': 'No tenant context.'}, status=400)
        if request.user.role not in {'msp_owner', 'msp_manager', 'msp_agent'}:
            return Response({'detail': 'Permission denied.'}, status=403)

        from .models import User
        user = get_object_or_404(User, pk=pk, tenant=tenant)

        if str(user.pk) == str(request.user.pk):
            return Response({'detail': 'You cannot reset your own password from here.'}, status=400)

        # Rank gate: only reset users strictly below your own role level. Stops an
        # agent from resetting (and reading) a manager's or owner's password.
        ROLE_RANK = {'end_user': 0, 'client_owner': 1, 'msp_agent': 2, 'msp_manager': 3, 'msp_owner': 4}
        if ROLE_RANK.get(user.role, 0) >= ROLE_RANK.get(request.user.role, 0):
            return Response(
                {'detail': 'You cannot reset the password of a user at or above your role level.'},
                status=403,
            )

        # Generate a random 12-character password
        alphabet = string.ascii_letters + string.digits + '!@#$%&'
        new_password = ''.join(secrets.choice(alphabet) for _ in range(12))

        user.set_password(new_password)
        user.save(update_fields=['password'])

        return Response({
            'detail': 'Password reset successfully.',
            'generated_password': new_password,
        })

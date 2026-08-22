from django.shortcuts import get_object_or_404

from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users.permissions import IsTenantUser
from apps.users.models import User
from apps.tickets.models import Ticket
from .models import ClientOrganization
from .serializers import ClientOrgSerializer, ClientOrgWriteSerializer, TenantSerializer


def _resolve_tenant(request):
    return getattr(request, 'tenant', None) or getattr(request.user, 'tenant', None)


class ClientOrgViewSet(viewsets.GenericViewSet):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get_queryset(self):
        tenant = _resolve_tenant(self.request)
        if tenant is None:
            return ClientOrganization.objects.none()
        return ClientOrganization.objects.filter(tenant=tenant).order_by('name')

    def list(self, request):
        qs = self.get_queryset()
        search = request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(name__icontains=search)
        return Response(ClientOrgSerializer(qs, many=True).data)

    def create(self, request):
        tenant = _resolve_tenant(request)
        if tenant is None:
            return Response({'detail': 'No tenant context.'}, status=400)
        serializer = ClientOrgWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        org = serializer.save(tenant=tenant)
        return Response(ClientOrgSerializer(org).data, status=201)

    def retrieve(self, request, pk=None):
        org = get_object_or_404(self.get_queryset(), pk=pk)
        return Response(ClientOrgSerializer(org).data)

    def partial_update(self, request, pk=None):
        org = get_object_or_404(self.get_queryset(), pk=pk)
        serializer = ClientOrgWriteSerializer(org, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        org = serializer.save()
        return Response(ClientOrgSerializer(org).data)

    def destroy(self, request, pk=None):
        org = get_object_or_404(self.get_queryset(), pk=pk)
        delete_users = request.data.get('delete_users', False)

        if delete_users:
            User.objects.filter(client_org=org, tenant=org.tenant).delete()
        else:
            # Stamp the org name on users before the FK is nulled by CASCADE
            User.objects.filter(client_org=org, tenant=org.tenant).update(deleted_org_name=org.name)

        org.delete()
        return Response(status=204)


class TenantDetailView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request):
        tenant = _resolve_tenant(request)
        if tenant is None:
            return Response({'detail': 'No tenant context.'}, status=400)
        return Response(TenantSerializer(tenant).data)

    def patch(self, request):
        tenant = _resolve_tenant(request)
        if tenant is None:
            return Response({'detail': 'No tenant context.'}, status=400)
        data = request.data.copy() if hasattr(request.data, 'copy') else dict(request.data)
        if 'name' in data and getattr(request.user, 'role', None) != 'msp_owner':
            return Response({'detail': 'Only an MSP Owner can change the organization name.'}, status=403)
        serializer = TenantSerializer(tenant, data=data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class TenantBrandingView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    _DEFAULTS = {
        'md_icon_size': 24, 'md_font_size': 19, 'md_line_height': 0,
        'mc_icon_size': 32, 'mc_font_size': 30, 'mc_line_height': 0,
        'md_custom_text': '', 'mc_custom_text': '',
        'md_logo_url': '', 'mc_logo_url': '',
    }

    def get(self, request):
        tenant = _resolve_tenant(request)
        if tenant is None:
            return Response({'detail': 'No tenant context.'}, status=400)
        data = {**self._DEFAULTS, **(tenant.branding or {})}
        data['md_logo_url'] = tenant.branding_md_logo.url if tenant.branding_md_logo else ''
        data['mc_logo_url'] = tenant.branding_mc_logo.url if tenant.branding_mc_logo else ''
        return Response(data)


class TransferOwnershipView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def post(self, request):
        tenant = _resolve_tenant(request)
        if tenant is None:
            return Response({'detail': 'No tenant context.'}, status=400)
        if getattr(request.user, 'role', None) != 'msp_owner':
            return Response({'detail': 'Only an MSP Owner can transfer ownership.'}, status=403)

        new_owner_id = request.data.get('new_owner_id', '').strip()
        if not new_owner_id:
            return Response({'detail': 'new_owner_id is required.'}, status=400)

        new_owner = User.objects.filter(pk=new_owner_id, tenant=tenant).first()
        if not new_owner:
            return Response({'detail': 'User not found in this tenant.'}, status=404)
        if str(new_owner.pk) == str(request.user.pk):
            return Response({'detail': 'You are already the owner.'}, status=400)

        request.user.role = 'msp_manager'
        request.user.save(update_fields=['role'])
        new_owner.role = 'msp_owner'
        new_owner.save(update_fields=['role'])

        return Response({'detail': f'Ownership transferred to {new_owner.email}.'})


def _org_user_dict(u, tenant):
    qs = Ticket.objects.filter(tenant=tenant, requester=u)
    return {
        'id':            str(u.id),
        'full_name':     u.full_name,
        'email':         u.email,
        'role':          u.role,
        'job_title':     u.job_title,
        'department':    u.department,
        'phone':         u.phone,
        'is_active':     u.is_active,
        'date_joined':   u.date_joined.isoformat(),
        'total_tickets': qs.count(),
        'open_tickets':  qs.filter(status__in=['open', 'in_progress', 'pending']).count(),
    }


CLIENT_ROLES = {'client_owner', 'end_user'}


class OrgUsersView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request, pk):
        tenant = _resolve_tenant(request)
        if tenant is None:
            return Response({'detail': 'No tenant context.'}, status=400)
        org = get_object_or_404(ClientOrganization, pk=pk, tenant=tenant)
        users = (
            User.objects
            .filter(client_org=org, tenant=tenant)
            .order_by('first_name', 'last_name')
        )
        return Response([_org_user_dict(u, tenant) for u in users])

    def post(self, request, pk):
        import secrets
        import string
        from apps.users.permissions import MSP_ROLES
        tenant = _resolve_tenant(request)
        if tenant is None:
            return Response({'detail': 'No tenant context.'}, status=400)
        if request.user.role not in MSP_ROLES:
            return Response({'detail': 'Permission denied.'}, status=403)

        org = get_object_or_404(ClientOrganization, pk=pk, tenant=tenant)

        email      = (request.data.get('email') or '').strip().lower()
        first_name = (request.data.get('first_name') or '').strip()
        last_name  = (request.data.get('last_name') or '').strip()
        role       = (request.data.get('role') or 'end_user').strip()
        job_title  = (request.data.get('job_title') or '').strip()
        department = (request.data.get('department') or '').strip()
        phone      = (request.data.get('phone') or '').strip()

        if not email:
            return Response({'detail': 'Email is required.'}, status=400)
        if not first_name:
            return Response({'detail': 'First name is required.'}, status=400)
        if role not in CLIENT_ROLES:
            return Response({'detail': f"Invalid role '{role}'."}, status=400)
        if User.objects.filter(email=email).exists():
            return Response({'detail': 'A user with this email already exists.'}, status=400)

        # Generate a random 12-character password for the new user
        alphabet = string.ascii_letters + string.digits + '!@#$%&'
        raw_password = ''.join(secrets.choice(alphabet) for _ in range(12))

        user = User.objects.create_user(
            email=email,
            password=raw_password,
            tenant=tenant,
            first_name=first_name,
            last_name=last_name,
            role=role,
            client_org=org,
            job_title=job_title,
            department=department,
            phone=phone,
            is_active=True,
            is_vip=(role == 'client_owner'),
        )
        resp = _org_user_dict(user, tenant)
        # Include the generated password in the response (one-time, never stored in plain text)
        resp['generated_password'] = raw_password
        return Response(resp, status=201)

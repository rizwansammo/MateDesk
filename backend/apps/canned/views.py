from django.db.models import Q
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from apps.users.permissions import IsTenantUser, MSP_ROLES
from .models import CannedCategory, CannedResponse
from .serializers import CannedCategorySerializer, CannedResponseSerializer


def _tenant(request):
    return getattr(request, 'tenant', None) or getattr(request.user, 'tenant', None)


class CategoryListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request):
        tenant = _tenant(request)
        if tenant is None:
            return Response([])
        qs = CannedCategory.objects.filter(tenant=tenant)
        return Response(CannedCategorySerializer(qs, many=True).data)

    def post(self, request):
        if request.user.role not in MSP_ROLES:
            return Response({'detail': 'MSP staff only.'}, status=403)
        tenant = _tenant(request)
        if tenant is None:
            return Response({'detail': 'Tenant not found.'}, status=400)
        name = request.data.get('name', '').strip()
        if not name:
            return Response({'detail': 'Name is required.'}, status=400)
        if CannedCategory.objects.filter(tenant=tenant, name__iexact=name).exists():
            return Response({'detail': 'A category with this name already exists.'}, status=400)
        cat = CannedCategory.objects.create(tenant=tenant, name=name, created_by=request.user)
        return Response(CannedCategorySerializer(cat).data, status=201)


class CategoryDetailView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def _get(self, request, pk):
        tenant = _tenant(request)
        try:
            return CannedCategory.objects.get(pk=pk, tenant=tenant)
        except CannedCategory.DoesNotExist:
            return None

    def patch(self, request, pk):
        if request.user.role not in MSP_ROLES:
            return Response({'detail': 'MSP staff only.'}, status=403)
        cat = self._get(request, pk)
        if cat is None:
            return Response({'detail': 'Not found.'}, status=404)
        name = request.data.get('name', '').strip()
        if not name:
            return Response({'detail': 'Name is required.'}, status=400)
        cat.name = name
        cat.save()
        return Response(CannedCategorySerializer(cat).data)

    def delete(self, request, pk):
        if request.user.role not in MSP_ROLES:
            return Response({'detail': 'MSP staff only.'}, status=403)
        cat = self._get(request, pk)
        if cat is None:
            return Response({'detail': 'Not found.'}, status=404)
        cat.delete()
        return Response(status=204)


class ResponseListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def get(self, request):
        tenant = _tenant(request)
        if tenant is None:
            return Response([])
        qs = CannedResponse.objects.filter(tenant=tenant).select_related('category')
        cat_id = request.query_params.get('category', '').strip()
        if cat_id:
            qs = qs.filter(category_id=cat_id)
        q = request.query_params.get('q', '').strip()
        if q:
            qs = qs.filter(Q(title__icontains=q) | Q(body__icontains=q))
        return Response(CannedResponseSerializer(qs, many=True).data)

    def post(self, request):
        if request.user.role not in MSP_ROLES:
            return Response({'detail': 'MSP staff only.'}, status=403)
        tenant = _tenant(request)
        if tenant is None:
            return Response({'detail': 'Tenant not found.'}, status=400)
        category_id = request.data.get('category', '').strip()
        title       = request.data.get('title', '').strip()
        body        = request.data.get('body', '').strip()
        if not category_id:
            return Response({'detail': 'Category is required.'}, status=400)
        if not title:
            return Response({'detail': 'Title is required.'}, status=400)
        if not body:
            return Response({'detail': 'Body is required.'}, status=400)
        try:
            cat = CannedCategory.objects.get(pk=category_id, tenant=tenant)
        except CannedCategory.DoesNotExist:
            return Response({'detail': 'Category not found.'}, status=404)
        resp = CannedResponse.objects.create(
            tenant=tenant, category=cat, title=title, body=body, created_by=request.user,
        )
        return Response(CannedResponseSerializer(resp).data, status=201)


class ResponseDetailView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser]

    def _get(self, request, pk):
        tenant = _tenant(request)
        try:
            return CannedResponse.objects.get(pk=pk, tenant=tenant)
        except CannedResponse.DoesNotExist:
            return None

    def patch(self, request, pk):
        if request.user.role not in MSP_ROLES:
            return Response({'detail': 'MSP staff only.'}, status=403)
        resp = self._get(request, pk)
        if resp is None:
            return Response({'detail': 'Not found.'}, status=404)
        if 'title' in request.data:
            t = request.data['title'].strip()
            if t:
                resp.title = t
        if 'body' in request.data:
            b = request.data['body'].strip()
            if b:
                resp.body = b
        if 'category' in request.data:
            tenant = _tenant(request)
            try:
                resp.category = CannedCategory.objects.get(pk=request.data['category'], tenant=tenant)
            except CannedCategory.DoesNotExist:
                pass
        resp.save()
        return Response(CannedResponseSerializer(resp).data)

    def delete(self, request, pk):
        if request.user.role not in MSP_ROLES:
            return Response({'detail': 'MSP staff only.'}, status=403)
        resp = self._get(request, pk)
        if resp is None:
            return Response({'detail': 'Not found.'}, status=404)
        resp.delete()
        return Response(status=204)

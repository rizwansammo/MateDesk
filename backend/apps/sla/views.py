from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.shortcuts import get_object_or_404
from rest_framework.permissions import IsAuthenticated

from apps.users.permissions import IsMSPUser, IsTenantUser
from .models import SLAPolicy, VIPRule
from .serializers import SLAPolicySerializer, VIPRuleSerializer


class SLAPolicyListView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser, IsMSPUser]

    def get(self, request):
        policies = SLAPolicy.objects.filter(
            tenant=request.tenant
        ).prefetch_related('targets', 'scope_org')
        return Response(SLAPolicySerializer(policies, many=True, context={'request': request}).data)

    def post(self, request):
        ser = SLAPolicySerializer(data=request.data, context={'request': request})
        ser.is_valid(raise_exception=True)
        ser.save(tenant=request.tenant)
        return Response(ser.data, status=status.HTTP_201_CREATED)


class SLAPolicyDetailView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser, IsMSPUser]

    def _policy(self, request, pk):
        return get_object_or_404(
            SLAPolicy.objects.prefetch_related('targets', 'scope_org'),
            pk=pk, tenant=request.tenant,
        )

    def get(self, request, pk):
        return Response(SLAPolicySerializer(self._policy(request, pk), context={'request': request}).data)

    def patch(self, request, pk):
        policy = self._policy(request, pk)
        ser = SLAPolicySerializer(policy, data=request.data, partial=True, context={'request': request})
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)

    def delete(self, request, pk):
        self._policy(request, pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class VIPRuleView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser, IsMSPUser]

    def get(self, request):
        rule, _ = VIPRule.objects.get_or_create(tenant=request.tenant)
        return Response(VIPRuleSerializer(rule).data)

    def patch(self, request):
        rule, _ = VIPRule.objects.get_or_create(tenant=request.tenant)
        ser = VIPRuleSerializer(rule, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)

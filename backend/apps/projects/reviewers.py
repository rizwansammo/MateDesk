"""Project Manager reviewer onboarding from existing client organization users.

Project membership grants access only; it never creates a new client account or
changes tenant roles. User accounts are managed in the existing organization UI.
"""
from django.shortcuts import get_object_or_404
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import PermissionDenied

from apps.users.models import User
from apps.users.permissions import CLIENT_ROLES, IsMSPUser, IsTenantUser
from .permissions import can_manage_project, visible_projects


class ProjectReviewerCandidatesView(APIView):
    permission_classes = [IsAuthenticated, IsTenantUser, IsMSPUser]

    def get(self, request, pk):
        project = get_object_or_404(visible_projects(request), pk=pk)
        if not can_manage_project(request.user, project):
            raise PermissionDenied('Project management permission required.')

        if not project.client_org.is_active:
            return Response([])

        candidates = User.objects.filter(
            tenant=project.tenant,
            client_org=project.client_org,
            is_active=True,
            role__in=CLIENT_ROLES,
        ).exclude(
            project_memberships__project=project,
        ).order_by('first_name', 'last_name', 'email')

        return Response([{
            'id': str(user.id),
            'name': user.full_name,
            'email': user.email,
            'role': user.role,
        } for user in candidates])

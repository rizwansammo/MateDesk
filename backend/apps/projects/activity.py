"""Project activity feed and per-user attention state.

Activities are independent of Helpdesk Ticket SLA and ticket notification rules.
Every client-facing query reapplies current Project visibility and source access,
so withdrawing a published Work Item or reviewer permission cannot leak history.
"""
from django.db.models import Max, Q
from django.utils import timezone

from apps.users.permissions import CLIENT_ROLES, MSP_ROLES

from .models import Project, ProjectActivity, ProjectActivityRead


STAFF_ATTENTION_KINDS = (
    'client_feedback',
    'support_ticket_created',
    'client_ticket_reply',
    'delivery_approved',
    'scope_approved',
    'scope_changes_requested',
    'scope_change_requested',
    'delivery_changes_requested',
)
CLIENT_ATTENTION_KINDS = (
    'staff_feedback',
    'staff_ticket_reply',
    'delivery_submitted',
    'scope_proposed',
    'scope_rejected',
    'scope_change_reviewed',
)


def record_activity(project, *, kind, actor=None, summary, visibility='internal',
                    ticket=None, work_item=None, milestone=None):
    """Write an event and move the Project's queue timestamp atomically."""
    if project is None:
        return None
    activity = ProjectActivity(
        project=project, actor=actor, kind=kind,
        summary=summary[:320], visibility=visibility, ticket=ticket,
        work_item=work_item, milestone=milestone,
    )
    activity.save()
    Project.objects.filter(pk=project.pk).update(updated_at=timezone.now())
    return activity


def visible_activities(request, project):
    user = request.user
    rows = ProjectActivity.objects.filter(project=project).select_related(
        'actor', 'work_item', 'ticket', 'milestone',
    )
    if user.role in MSP_ROLES:
        return rows
    if user.role not in CLIENT_ROLES:
        return rows.none()

    rows = rows.filter(
        visibility='client', project__visibility='client',
        project__client_org__is_active=True,
    ).filter(
        Q(work_item__isnull=True) | Q(work_item__visibility='client')
    ).filter(
        Q(milestone__isnull=True) | Q(milestone__visibility='client')
    ).filter(
        Q(ticket__isnull=True) | Q(ticket__is_internal=False)
    )
    if user.role == 'client_owner' or (user.role == 'end_user' and user.is_vip):
        return rows.filter(
            Q(ticket__isnull=True) | Q(ticket__client_org_id=user.client_org_id)
        )
    return rows.filter(Q(ticket__isnull=True) | Q(ticket__requester=user))


def _events_needing_attention(request, project_ids):
    """Query relevant latest events in a batch, not one query per Project."""
    ids = list(project_ids)
    if not ids:
        return {}
    user = request.user
    if user.role in MSP_ROLES:
        qs = ProjectActivity.objects.filter(
            project_id__in=ids, kind__in=STAFF_ATTENTION_KINDS,
        )
    else:
        qs = ProjectActivity.objects.filter(
            project_id__in=ids, kind__in=CLIENT_ATTENTION_KINDS,
        )
        # Apply the same visibility rules used by the Activity Feed.
        qs = qs.filter(
            visibility='client', project__visibility='client',
            project__client_org__is_active=True,
        ).filter(
            Q(work_item__isnull=True) | Q(work_item__visibility='client')
        ).filter(
            Q(ticket__isnull=True) | Q(ticket__is_internal=False)
        )
        if user.role == 'client_owner' or (user.role == 'end_user' and user.is_vip):
            qs = qs.filter(
                Q(ticket__isnull=True) | Q(ticket__client_org_id=user.client_org_id)
            )
        else:
            qs = qs.filter(
                Q(ticket__isnull=True) | Q(ticket__requester=user)
            )
    latest = dict(
        qs.exclude(actor_id=user.id).values('project_id')
        .annotate(last_activity=Max('created_at'))
        .values_list('project_id', 'last_activity')
    )
    cursors = dict(ProjectActivityRead.objects.filter(
        project_id__in=ids, user=user,
    ).values_list('project_id', 'last_seen_at'))
    return {
        pk: occurred for pk, occurred in latest.items()
        if not cursors.get(pk) or occurred > cursors[pk]
    }


def attention_projects(request, project_ids):
    return set(_events_needing_attention(request, project_ids))


def activity_read_cursor(user, project):
    return ProjectActivityRead.objects.filter(
        project=project, user=user
    ).values_list('last_seen_at', flat=True).first()


def mark_project_activity_read(request, project):
    latest = visible_activities(request, project).aggregate(
        newest=Max('created_at')
    )['newest']
    if latest is None:
        return None
    row, _ = ProjectActivityRead.objects.get_or_create(
        project=project, user=request.user,
    )
    if row.last_seen_at is None or latest > row.last_seen_at:
        row.last_seen_at = latest
        row.save(update_fields=['last_seen_at', 'updated_at'])
    return row.last_seen_at

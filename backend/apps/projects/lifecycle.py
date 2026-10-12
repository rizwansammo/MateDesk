"""Project lifecycle presentation and safe automatic progress transitions.

Work progress can activate a planned project. Completion, hold/resume and archive
are business decisions and must only use their existing authorized workflows.
"""
from .activity import record_activity


def activate_on_work_start(project, *, actor, work_item):
    """Auto-start once, only while planned. Caller must lock project in a transaction."""
    if project.status != 'planned' or work_item.status != 'in_progress':
        return False
    project.status = 'active'
    project.save(update_fields=['status', 'updated_at'])
    record_activity(
        project, kind='project_updated', actor=actor,
        summary=f'Project automatically started when {work_item.ref} began',
        visibility='client' if project.visibility == 'client' and work_item.visibility == 'client' else 'internal',
    )
    return True


def project_status_indicator(project):
    """A read-only indicator; never mutates project status or approval history."""
    if project.status != 'active':
        return None

    from .delivery import check_delivery_readiness, latest_review
    review = latest_review(project)
    if review and review.status == 'pending':
        return 'awaiting_client_review'
    if review and review.status == 'changes_requested':
        return 'changes_requested'
    if review and review.status == 'approved':
        # A client approval awaits an explicit manager completion action.
        return None
    if check_delivery_readiness(project)['ready']:
        return 'ready_for_delivery'
    return None


def project_status_indicators(projects):
    """Bulk status calculation for project directories, avoiding per-row DB queries.

    Uses the same conditions as delivery readiness, without exposing blocker
    details or confidential work items to client-facing serializers.
    """
    from django.db.models import Count, F, Q
    from .models import (
        ProjectDeliveryReview, ProjectMember, ProjectMilestone,
        TicketProjectAssociation, WorkItem,
    )

    result = {project.pk: None for project in projects}
    active_ids = [project.pk for project in projects if project.status == 'active']
    if not active_ids:
        return result

    latest = {}
    reviews = (
        ProjectDeliveryReview.objects.filter(project_id__in=active_ids)
        .order_by('project_id', '-round_number', '-id')
        .values_list('project_id', 'status')
    )
    for project_id, review_status in reviews:
        if project_id not in latest:
            latest[project_id] = review_status

    pending_readiness = []
    for project_id in active_ids:
        decision = latest.get(project_id)
        if decision == 'pending':
            result[project_id] = 'awaiting_client_review'
        elif decision == 'changes_requested':
            result[project_id] = 'changes_requested'
        elif not decision:
            pending_readiness.append(project_id)

    if not pending_readiness:
        return result

    items = {
        row['project_id']: row for row in WorkItem.objects.filter(
            project_id__in=pending_readiness,
        ).values('project_id').annotate(
            done=Count('id', filter=Q(status='done')),
            unfinished=Count('id', filter=~Q(status__in=('done', 'cancelled'))),
        )
    }
    incomplete_milestones = set(
        ProjectMilestone.objects.filter(project_id__in=pending_readiness)
        .exclude(status='completed').values_list('project_id', flat=True).distinct()
    )
    open_support = set(
        TicketProjectAssociation.objects.filter(
            project_id__in=pending_readiness, ticket__category='Project Support',
        ).exclude(ticket__status__in=('solved', 'closed'))
        .values_list('project_id', flat=True).distinct()
    )
    active_reviewers = set(
        ProjectMember.objects.filter(
            project_id__in=pending_readiness, role='client_reviewer',
            user__is_active=True, user__client_org_id=F('project__client_org_id'),
        ).values_list('project_id', flat=True).distinct()
    )
    for project_id in pending_readiness:
        work = items.get(project_id)
        if (
            work and work['done'] > 0 and work['unfinished'] == 0
            and project_id not in incomplete_milestones
            and project_id not in open_support
            and project_id in active_reviewers
        ):
            result[project_id] = 'ready_for_delivery'
    return result

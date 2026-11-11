from django.urls import path
from .requests import (
    ProjectRequestListView, ProjectRequestDetailView, ProjectRequestClaimView,
    ProjectRequestConvertView, ProjectCapabilitiesView, ProjectAgentPermissionsView,
    UnifiedRequestsView,
)
from .support import ProjectSupportTicketsView, ProjectActivityView, ProjectActivityReadView
from .delivery import (ProjectDeliveryView, ProjectDeliverySubmitView,
    ProjectDeliveryDecisionView, ProjectDeliveryCompleteView,
    ProjectDeliveryArchiveView, ProjectDeliveryReopenView)
from .reviewers import ProjectReviewerCandidatesView
from .files import (ProjectFilesView, ProjectFileDetailView,
                    ProjectFileVersionsView, ProjectFileDownloadView)
from .work_advanced import (
    WorkItemDependenciesView, WorkItemDependencyDetailView,
    WorkItemChecklistView, WorkItemChecklistDetailView,
)
from .scope import (
    ProjectScopeView, ProjectScopeProposalsView, ProjectScopeDecisionView,
    ProjectScopeChangeRequestsView, ProjectScopeChangeReviewView,
)
from .email_views import WorkItemNotificationView
from .communication import ProjectConversationView, ProjectNotificationInboxView

from .ticket_links import (
    TicketProjectAssociationView, TicketWorkItemLinkView,
    TicketWorkItemLinkDetailView, TicketCreateLinkedWorkItemView,
    WorkItemSupportTicketsView,
)

from .views import (
    ProjectListView, ProjectDetailView,
    ProjectMembersView, ProjectMemberDetailView,
    ProjectMilestonesView, ProjectMilestoneDetailView,
    ProjectWorkItemsView, WorkItemDetailView, WorkItemCommentsView,
)

urlpatterns = [
    path('requests/workspace/', UnifiedRequestsView.as_view(), name='requests-workspace'),
    path('project-requests/', ProjectRequestListView.as_view(), name='project-requests-list'),
    path('project-requests/<uuid:pk>/', ProjectRequestDetailView.as_view(), name='project-requests-detail'),
    path('project-requests/<uuid:pk>/claim/', ProjectRequestClaimView.as_view(), name='project-requests-claim'),
    path('project-requests/<uuid:pk>/convert/', ProjectRequestConvertView.as_view(), name='project-requests-convert'),
    path('projects/capabilities/', ProjectCapabilitiesView.as_view(), name='project-capabilities'),
    path('projects/agent-permissions/', ProjectAgentPermissionsView.as_view(), name='project-agent-permissions'),
    path('projects/agent-permissions/<uuid:user_id>/', ProjectAgentPermissionsView.as_view(), name='project-agent-permission-detail'),
    path('projects/<uuid:pk>/scope/', ProjectScopeView.as_view(), name='project-scope'),
    path('projects/<uuid:pk>/scope/proposals/', ProjectScopeProposalsView.as_view(), name='project-scope-proposals'),
    path('projects/<uuid:pk>/scope/proposals/<uuid:proposal_id>/decision/', ProjectScopeDecisionView.as_view(), name='project-scope-decision'),
    path('projects/<uuid:pk>/scope/change-requests/', ProjectScopeChangeRequestsView.as_view(), name='project-scope-change-requests'),
    path('projects/<uuid:pk>/scope/change-requests/<uuid:change_id>/review/', ProjectScopeChangeReviewView.as_view(), name='project-scope-change-review'),
    path('projects/<uuid:pk>/files/', ProjectFilesView.as_view(), name='project-files'),
    path('projects/<uuid:pk>/files/<uuid:document_id>/', ProjectFileDetailView.as_view(), name='project-file-detail'),
    path('projects/<uuid:pk>/files/<uuid:document_id>/versions/', ProjectFileVersionsView.as_view(), name='project-file-versions'),
    path('projects/<uuid:pk>/files/<uuid:document_id>/versions/<uuid:version_id>/download/', ProjectFileDownloadView.as_view(), name='project-file-download'),
    path('projects/<uuid:pk>/delivery/', ProjectDeliveryView.as_view(), name='project-delivery'),
    path('projects/<uuid:pk>/delivery/submit/', ProjectDeliverySubmitView.as_view(), name='project-delivery-submit'),
    path('projects/<uuid:pk>/delivery/decision/', ProjectDeliveryDecisionView.as_view(), name='project-delivery-decision'),
    path('projects/<uuid:pk>/delivery/complete/', ProjectDeliveryCompleteView.as_view(), name='project-delivery-complete'),
    path('projects/<uuid:pk>/delivery/archive/', ProjectDeliveryArchiveView.as_view(), name='project-delivery-archive'),
    path('projects/<uuid:pk>/delivery/reopen/', ProjectDeliveryReopenView.as_view(), name='project-delivery-reopen'),
    path('projects/<uuid:pk>/support-tickets/', ProjectSupportTicketsView.as_view(), name='project-support-tickets'),
    path('projects/<uuid:pk>/activity/', ProjectActivityView.as_view(), name='project-activity'),
    path('projects/notifications/', ProjectNotificationInboxView.as_view(), name='project-notification-inbox'),
    path('projects/<uuid:pk>/conversation/', ProjectConversationView.as_view(), name='project-conversation'),
    path('projects/<uuid:pk>/activity/read/', ProjectActivityReadView.as_view(), name='project-activity-read'),
    path('projects/<uuid:pk>/reviewer-candidates/', ProjectReviewerCandidatesView.as_view(), name='project-reviewer-candidates'),
    path('work-items/<uuid:pk>/email-notifications/', WorkItemNotificationView.as_view(), name='work-item-email-notifications'),
    path('tickets/<str:ticket_ref>/project-association/', TicketProjectAssociationView.as_view(), name='ticket-project-association'),
    path('tickets/<str:ticket_ref>/project-work-items/', TicketWorkItemLinkView.as_view(), name='ticket-project-work-items'),
    path('tickets/<str:ticket_ref>/project-work-items/create/', TicketCreateLinkedWorkItemView.as_view(), name='ticket-create-project-work-item'),
    path('tickets/<str:ticket_ref>/project-work-items/<uuid:work_item_id>/', TicketWorkItemLinkDetailView.as_view(), name='ticket-project-work-item-detail'),
    path('work-items/<uuid:work_item_id>/support-tickets/', WorkItemSupportTicketsView.as_view(), name='work-item-support-tickets'),
    path('projects/', ProjectListView.as_view(), name='projects-list'),
    path('projects/<uuid:pk>/', ProjectDetailView.as_view(), name='projects-detail'),
    path('projects/<uuid:pk>/members/', ProjectMembersView.as_view(), name='projects-members'),
    path('projects/<uuid:pk>/members/<uuid:member_id>/', ProjectMemberDetailView.as_view(), name='projects-member-detail'),
    path('projects/<uuid:pk>/milestones/', ProjectMilestonesView.as_view(), name='projects-milestones'),
    path('projects/<uuid:pk>/milestones/<uuid:milestone_id>/', ProjectMilestoneDetailView.as_view(), name='projects-milestone-detail'),
    path('projects/<uuid:pk>/work-items/', ProjectWorkItemsView.as_view(), name='projects-work-items'),
    path('work-items/<uuid:pk>/', WorkItemDetailView.as_view(), name='work-items-detail'),
    path('work-items/<uuid:pk>/dependencies/', WorkItemDependenciesView.as_view(), name='work-item-dependencies'),
    path('work-items/<uuid:pk>/dependencies/<uuid:dependency_id>/', WorkItemDependencyDetailView.as_view(), name='work-item-dependency-detail'),
    path('work-items/<uuid:pk>/checklist/', WorkItemChecklistView.as_view(), name='work-item-checklist'),
    path('work-items/<uuid:pk>/checklist/<uuid:entry_id>/', WorkItemChecklistDetailView.as_view(), name='work-item-checklist-detail'),
    path('work-items/<uuid:pk>/comments/', WorkItemCommentsView.as_view(), name='work-items-comments'),
]

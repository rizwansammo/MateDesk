from django.urls import path
from .email_views import WorkItemNotificationView

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
    path('work-items/<uuid:pk>/comments/', WorkItemCommentsView.as_view(), name='work-items-comments'),
]

"""
Pre-built rule templates.
Returned by AutomationTemplatesView — never stored in the DB.
Group/Agent actions have value='' so the user fills them in from dropdowns after applying.
"""

AUTOMATION_TEMPLATES = [

    # ── Priority Routing ──────────────────────────────────────────────────────

    {
        'id':              'tpl-urgent-keywords',
        'name':            'Urgent Keywords → Critical Priority',
        'description':     'Set critical priority when the ticket title contains urgent language.',
        'category':        'Priority Routing',
        'trigger':         'ticket_created',
        'condition_match': 'any',
        'conditions': [
            {'field': 'ticket.title', 'operator': 'contains', 'value': 'urgent'},
            {'field': 'ticket.title', 'operator': 'contains', 'value': 'emergency'},
            {'field': 'ticket.title', 'operator': 'contains', 'value': ' down'},
            {'field': 'ticket.title', 'operator': 'contains', 'value': 'critical'},
        ],
        'actions': [
            {'type': 'set_priority', 'value': 'critical'},
            {'type': 'add_tag',      'value': 'escalated'},
        ],
        'stop_processing': False,
        'priority_order':  5,
    },
    {
        'id':              'tpl-vip-high-priority',
        'name':            'VIP Requester → High Priority',
        'description':     'Automatically boost priority for tickets submitted by VIP users.',
        'category':        'Priority Routing',
        'trigger':         'ticket_created',
        'condition_match': 'all',
        'conditions': [
            {'field': 'requester.is_vip', 'operator': 'equals', 'value': 'true'},
        ],
        'actions': [
            {'type': 'set_priority', 'value': 'high'},
            {'type': 'add_tag',      'value': 'vip-ticket'},
        ],
        'stop_processing': False,
        'priority_order':  3,
    },
    {
        'id':              'tpl-asap-keywords',
        'name':            'ASAP Keywords → High Priority',
        'description':     'Set high priority when the title contains urgency phrases like "asap" or "immediately".',
        'category':        'Priority Routing',
        'trigger':         'ticket_created',
        'condition_match': 'any',
        'conditions': [
            {'field': 'ticket.title', 'operator': 'contains', 'value': 'asap'},
            {'field': 'ticket.title', 'operator': 'contains', 'value': 'immediately'},
            {'field': 'ticket.title', 'operator': 'contains', 'value': 'right away'},
            {'field': 'ticket.title', 'operator': 'contains', 'value': 'right now'},
        ],
        'actions': [
            {'type': 'set_priority', 'value': 'high'},
        ],
        'stop_processing': False,
        'priority_order':  6,
    },
    {
        'id':              'tpl-sla-breached-priority',
        'name':            'SLA Breached → Bump to High',
        'description':     'Raise priority to High when a ticket breaches its SLA (unless already Critical).',
        'category':        'Priority Routing',
        'trigger':         'ticket_updated',
        'condition_match': 'all',
        'conditions': [
            {'field': 'ticket.sla_status', 'operator': 'equals',     'value': 'breached'},
            {'field': 'ticket.priority',   'operator': 'not_equals', 'value': 'critical'},
        ],
        'actions': [
            {'type': 'set_priority', 'value': 'high'},
        ],
        'stop_processing': False,
        'priority_order':  8,
    },
    {
        'id':              'tpl-critical-set-l1',
        'name':            'Critical Priority → Set Level L1',
        'description':     'Automatically assign Level L1 when a ticket is set to Critical.',
        'category':        'Priority Routing',
        'trigger':         'ticket_updated',
        'condition_match': 'all',
        'conditions': [
            {'field': 'ticket.priority', 'operator': 'equals',   'value': 'critical'},
            {'field': 'ticket.level',    'operator': 'is_empty', 'value': ''},
        ],
        'actions': [
            {'type': 'set_level', 'value': 'L1'},
        ],
        'stop_processing': False,
        'priority_order':  10,
    },
    {
        'id':              'tpl-high-critical-tag',
        'name':            'High / Critical → Tag Needs Attention',
        'description':     'Add a tag to new high and critical tickets for easy queue filtering.',
        'category':        'Priority Routing',
        'trigger':         'ticket_created',
        'condition_match': 'any',
        'conditions': [
            {'field': 'ticket.priority', 'operator': 'equals', 'value': 'critical'},
            {'field': 'ticket.priority', 'operator': 'equals', 'value': 'high'},
        ],
        'actions': [
            {'type': 'add_tag', 'value': 'needs-attention'},
        ],
        'stop_processing': False,
        'priority_order':  7,
    },

    # ── Group Routing ─────────────────────────────────────────────────────────

    {
        'id':              'tpl-vpn-network',
        'name':            'VPN Keywords → Network Group',
        'description':     'Route VPN and remote access tickets to your network support group.',
        'category':        'Group Routing',
        'trigger':         'ticket_created',
        'condition_match': 'any',
        'conditions': [
            {'field': 'ticket.title', 'operator': 'contains', 'value': 'vpn'},
            {'field': 'ticket.title', 'operator': 'contains', 'value': 'remote access'},
            {'field': 'ticket.title', 'operator': 'contains', 'value': 'remote desktop'},
        ],
        'actions': [
            {'type': 'set_group', 'value': ''},
            {'type': 'add_tag',   'value': 'vpn'},
        ],
        'stop_processing': False,
        'priority_order':  15,
    },
    {
        'id':              'tpl-password-account',
        'name':            'Password / Account Issues → Account Group',
        'description':     'Route password resets and account lockouts to your account management group.',
        'category':        'Group Routing',
        'trigger':         'ticket_created',
        'condition_match': 'any',
        'conditions': [
            {'field': 'ticket.title', 'operator': 'contains', 'value': 'password'},
            {'field': 'ticket.title', 'operator': 'contains', 'value': 'locked out'},
            {'field': 'ticket.title', 'operator': 'contains', 'value': 'account locked'},
            {'field': 'ticket.title', 'operator': 'contains', 'value': 'reset'},
        ],
        'actions': [
            {'type': 'set_group', 'value': ''},
            {'type': 'add_tag',   'value': 'account-issue'},
        ],
        'stop_processing': False,
        'priority_order':  15,
    },
    {
        'id':              'tpl-hardware-group',
        'name':            'Hardware Keywords → Hardware Group',
        'description':     'Route hardware and device issues to your hardware support group.',
        'category':        'Group Routing',
        'trigger':         'ticket_created',
        'condition_match': 'any',
        'conditions': [
            {'field': 'ticket.title', 'operator': 'contains', 'value': 'printer'},
            {'field': 'ticket.title', 'operator': 'contains', 'value': 'scanner'},
            {'field': 'ticket.title', 'operator': 'contains', 'value': 'monitor'},
            {'field': 'ticket.title', 'operator': 'contains', 'value': 'keyboard'},
            {'field': 'ticket.title', 'operator': 'contains', 'value': 'laptop'},
        ],
        'actions': [
            {'type': 'set_group', 'value': ''},
            {'type': 'add_tag',   'value': 'hardware'},
        ],
        'stop_processing': False,
        'priority_order':  15,
    },
    {
        'id':              'tpl-email-outlook',
        'name':            'Email / Outlook Keywords → Email Group',
        'description':     'Route email client issues to your email support group.',
        'category':        'Group Routing',
        'trigger':         'ticket_created',
        'condition_match': 'any',
        'conditions': [
            {'field': 'ticket.title', 'operator': 'contains', 'value': 'outlook'},
            {'field': 'ticket.title', 'operator': 'contains', 'value': 'email'},
            {'field': 'ticket.title', 'operator': 'contains', 'value': 'exchange'},
        ],
        'actions': [
            {'type': 'set_group', 'value': ''},
            {'type': 'add_tag',   'value': 'email-issue'},
        ],
        'stop_processing': False,
        'priority_order':  15,
    },
    {
        'id':              'tpl-network-connectivity',
        'name':            'Network / WiFi Keywords → Network Group L1',
        'description':     'Route network and connectivity issues to your network group at Level L1.',
        'category':        'Group Routing',
        'trigger':         'ticket_created',
        'condition_match': 'any',
        'conditions': [
            {'field': 'ticket.title', 'operator': 'contains', 'value': 'internet'},
            {'field': 'ticket.title', 'operator': 'contains', 'value': 'wifi'},
            {'field': 'ticket.title', 'operator': 'contains', 'value': 'no connection'},
            {'field': 'ticket.title', 'operator': 'contains', 'value': 'network'},
        ],
        'actions': [
            {'type': 'set_group', 'value': ''},
            {'type': 'set_level', 'value': 'L1'},
            {'type': 'add_tag',   'value': 'connectivity'},
        ],
        'stop_processing': False,
        'priority_order':  15,
    },
    {
        'id':              'tpl-microsoft365',
        'name':            'Microsoft 365 / Teams → Cloud Services Group',
        'description':     'Route Microsoft 365, Teams, SharePoint, and OneDrive issues to your cloud services group.',
        'category':        'Group Routing',
        'trigger':         'ticket_created',
        'condition_match': 'any',
        'conditions': [
            {'field': 'ticket.title', 'operator': 'contains', 'value': 'teams'},
            {'field': 'ticket.title', 'operator': 'contains', 'value': 'sharepoint'},
            {'field': 'ticket.title', 'operator': 'contains', 'value': 'office 365'},
            {'field': 'ticket.title', 'operator': 'contains', 'value': 'microsoft 365'},
            {'field': 'ticket.title', 'operator': 'contains', 'value': 'onedrive'},
        ],
        'actions': [
            {'type': 'set_group', 'value': ''},
            {'type': 'add_tag',   'value': 'microsoft365'},
        ],
        'stop_processing': False,
        'priority_order':  15,
    },
    {
        'id':              'tpl-specific-org-routing',
        'name':            'Specific Org → Dedicated Group',
        'description':     'Route all tickets from a specific organization to a dedicated group. Replace "OrgX" in the condition with your actual org name.',
        'category':        'Group Routing',
        'trigger':         'ticket_created',
        'condition_match': 'all',
        'conditions': [
            {'field': 'ticket.client_org', 'operator': 'equals', 'value': 'OrgX'},
        ],
        'actions': [
            {'type': 'set_group', 'value': ''},
        ],
        'stop_processing': False,
        'priority_order':  12,
    },
    {
        'id':              'tpl-onboarding-routing',
        'name':            'Onboarding / New User → Onboarding Group',
        'description':     'Route new employee setup and onboarding requests to your onboarding group.',
        'category':        'Group Routing',
        'trigger':         'ticket_created',
        'condition_match': 'any',
        'conditions': [
            {'field': 'ticket.title', 'operator': 'contains', 'value': 'onboarding'},
            {'field': 'ticket.title', 'operator': 'contains', 'value': 'new employee'},
            {'field': 'ticket.title', 'operator': 'contains', 'value': 'new user'},
            {'field': 'ticket.title', 'operator': 'contains', 'value': 'new hire'},
        ],
        'actions': [
            {'type': 'set_group', 'value': ''},
            {'type': 'set_level', 'value': 'L1'},
            {'type': 'add_tag',   'value': 'onboarding'},
        ],
        'stop_processing': False,
        'priority_order':  14,
    },

    # ── SLA Escalation ────────────────────────────────────────────────────────

    {
        'id':              'tpl-sla-breached-tag',
        'name':            'SLA Breached → Tag + Internal Note',
        'description':     'Add a tag and internal note when a ticket breaches its SLA.',
        'category':        'SLA Escalation',
        'trigger':         'ticket_updated',
        'condition_match': 'all',
        'conditions': [
            {'field': 'ticket.sla_status', 'operator': 'equals', 'value': 'breached'},
        ],
        'actions': [
            {'type': 'add_tag',           'value': 'sla-breached'},
            {'type': 'add_internal_note', 'value': 'SLA has been breached — immediate attention required.'},
        ],
        'stop_processing': False,
        'priority_order':  8,
    },
    {
        'id':              'tpl-sla-due-soon',
        'name':            'SLA Due Soon → Tag + Raise Priority',
        'description':     'Tag and raise priority when SLA is approaching its deadline.',
        'category':        'SLA Escalation',
        'trigger':         'ticket_updated',
        'condition_match': 'all',
        'conditions': [
            {'field': 'ticket.sla_status', 'operator': 'equals', 'value': 'due_soon'},
        ],
        'actions': [
            {'type': 'add_tag',      'value': 'sla-due-soon'},
            {'type': 'set_priority', 'value': 'high'},
        ],
        'stop_processing': False,
        'priority_order':  9,
    },
    {
        'id':              'tpl-sla-critical-breach',
        'name':            'Critical SLA Breach → Escalation Note',
        'description':     'Add a detailed escalation note when a critical ticket breaches its SLA.',
        'category':        'SLA Escalation',
        'trigger':         'ticket_updated',
        'condition_match': 'all',
        'conditions': [
            {'field': 'ticket.sla_status', 'operator': 'equals', 'value': 'breached'},
            {'field': 'ticket.priority',   'operator': 'equals', 'value': 'critical'},
        ],
        'actions': [
            {'type': 'add_internal_note', 'value': 'CRITICAL SLA BREACH — This critical ticket has exceeded its SLA. Escalate to senior support immediately.'},
            {'type': 'add_tag',           'value': 'critical-sla-breach'},
        ],
        'stop_processing': False,
        'priority_order':  7,
    },
    {
        'id':              'tpl-sla-met-tag',
        'name':            'SLA Completed → Tag Met',
        'description':     'Tag a ticket when it is resolved within its SLA target.',
        'category':        'SLA Escalation',
        'trigger':         'ticket_updated',
        'condition_match': 'all',
        'conditions': [
            {'field': 'ticket.sla_status', 'operator': 'equals', 'value': 'completed'},
        ],
        'actions': [
            {'type': 'add_tag', 'value': 'sla-met'},
        ],
        'stop_processing': False,
        'priority_order':  20,
    },

    # ── Customer Reply ────────────────────────────────────────────────────────

    {
        'id':              'tpl-reopen-solved-reply',
        'name':            'Customer Reply on Solved → Reopen',
        'description':     'Automatically reopen a solved ticket when the customer replies so it is not missed.',
        'category':        'Customer Reply',
        'trigger':         'reply_added',
        'condition_match': 'all',
        'conditions': [
            {'field': 'ticket.status', 'operator': 'equals', 'value': 'solved'},
        ],
        'actions': [
            {'type': 'set_status',       'value': 'open'},
            {'type': 'add_tag',          'value': 'reopened'},
            {'type': 'add_internal_note','value': 'Automatically reopened — customer replied after ticket was solved.'},
        ],
        'stop_processing': False,
        'priority_order':  10,
    },
    {
        'id':              'tpl-in-progress-pending-reply',
        'name':            'Customer Reply on Pending → In Progress',
        'description':     'Move ticket to In Progress when a customer replies to a pending ticket.',
        'category':        'Customer Reply',
        'trigger':         'reply_added',
        'condition_match': 'all',
        'conditions': [
            {'field': 'ticket.status', 'operator': 'equals', 'value': 'pending'},
        ],
        'actions': [
            {'type': 'set_status', 'value': 'in_progress'},
        ],
        'stop_processing': False,
        'priority_order':  12,
    },
    {
        'id':              'tpl-in-progress-waiting-reply',
        'name':            'Customer Reply on Waiting → In Progress',
        'description':     'Resume ticket processing when the customer replies while it is waiting on them.',
        'category':        'Customer Reply',
        'trigger':         'reply_added',
        'condition_match': 'all',
        'conditions': [
            {'field': 'ticket.status', 'operator': 'equals', 'value': 'waiting_on_customer'},
        ],
        'actions': [
            {'type': 'set_status', 'value': 'in_progress'},
        ],
        'stop_processing': False,
        'priority_order':  11,
    },
    {
        'id':              'tpl-reopen-closed-reply',
        'name':            'Customer Reply on Closed → Reopen + Note',
        'description':     'Reopen a closed ticket when the customer replies so it is not lost.',
        'category':        'Customer Reply',
        'trigger':         'reply_added',
        'condition_match': 'all',
        'conditions': [
            {'field': 'ticket.status', 'operator': 'equals', 'value': 'closed'},
        ],
        'actions': [
            {'type': 'set_status',       'value': 'open'},
            {'type': 'add_tag',          'value': 'reopened-from-closed'},
            {'type': 'add_internal_note','value': 'Automatically reopened — customer replied after ticket was closed.'},
        ],
        'stop_processing': False,
        'priority_order':  10,
    },

    # ── Tag Automation ────────────────────────────────────────────────────────

    {
        'id':              'tpl-no-description',
        'name':            'No Description → Tag Needs Info',
        'description':     'Flag tickets created without a description so agents know to request more information.',
        'category':        'Tag Automation',
        'trigger':         'ticket_created',
        'condition_match': 'all',
        'conditions': [
            {'field': 'ticket.description', 'operator': 'is_empty', 'value': ''},
        ],
        'actions': [
            {'type': 'add_tag',           'value': 'needs-more-info'},
            {'type': 'add_internal_note', 'value': 'Ticket created with no description. Request more information from the requester.'},
        ],
        'stop_processing': False,
        'priority_order':  20,
    },
    {
        'id':              'tpl-has-attachment',
        'name':            'Has Attachment → Tag',
        'description':     'Tag tickets that include file attachments for easy filtering.',
        'category':        'Tag Automation',
        'trigger':         'ticket_created',
        'condition_match': 'all',
        'conditions': [
            {'field': 'ticket.has_attachment', 'operator': 'equals', 'value': 'true'},
        ],
        'actions': [
            {'type': 'add_tag', 'value': 'has-attachment'},
        ],
        'stop_processing': False,
        'priority_order':  25,
    },
    {
        'id':              'tpl-external-email',
        'name':            'Free Email Domain → Tag External',
        'description':     'Tag tickets from common free email providers as external/unmanaged.',
        'category':        'Tag Automation',
        'trigger':         'ticket_created',
        'condition_match': 'any',
        'conditions': [
            {'field': 'requester.email_domain', 'operator': 'equals', 'value': 'gmail.com'},
            {'field': 'requester.email_domain', 'operator': 'equals', 'value': 'outlook.com'},
            {'field': 'requester.email_domain', 'operator': 'equals', 'value': 'yahoo.com'},
            {'field': 'requester.email_domain', 'operator': 'equals', 'value': 'hotmail.com'},
        ],
        'actions': [
            {'type': 'add_tag',      'value': 'external-user'},
            {'type': 'set_category', 'value': 'External Inquiry'},
        ],
        'stop_processing': False,
        'priority_order':  20,
    },
    {
        'id':              'tpl-spam-close',
        'name':            'Spam Keywords → Close + Tag',
        'description':     'Automatically close obvious spam tickets and stop further rule processing.',
        'category':        'Tag Automation',
        'trigger':         'ticket_created',
        'condition_match': 'any',
        'conditions': [
            {'field': 'ticket.title', 'operator': 'starts_with', 'value': '[SPAM]'},
            {'field': 'ticket.title', 'operator': 'contains',    'value': 'unsubscribe'},
            {'field': 'ticket.title', 'operator': 'contains',    'value': 'click here to win'},
        ],
        'actions': [
            {'type': 'set_status',       'value': 'closed'},
            {'type': 'add_tag',          'value': 'spam'},
            {'type': 'add_internal_note','value': 'Automatically closed — detected as spam based on title keywords.'},
        ],
        'stop_processing': True,
        'priority_order':  1,
    },
    {
        'id':              'tpl-billing-category',
        'name':            'Billing Keywords → Category Billing',
        'description':     'Automatically categorize billing and invoice tickets.',
        'category':        'Tag Automation',
        'trigger':         'ticket_created',
        'condition_match': 'any',
        'conditions': [
            {'field': 'ticket.title', 'operator': 'contains', 'value': 'invoice'},
            {'field': 'ticket.title', 'operator': 'contains', 'value': 'billing'},
            {'field': 'ticket.title', 'operator': 'contains', 'value': 'payment'},
            {'field': 'ticket.title', 'operator': 'contains', 'value': 'charge'},
        ],
        'actions': [
            {'type': 'set_category', 'value': 'Billing'},
            {'type': 'add_tag',      'value': 'billing'},
        ],
        'stop_processing': False,
        'priority_order':  18,
    },

    # ── Defaults ──────────────────────────────────────────────────────────────

    {
        'id':              'tpl-critical-unassigned',
        'name':            'Critical + No Assignee → Internal Note',
        'description':     'Alert the team when a critical ticket arrives with no assignee.',
        'category':        'Defaults',
        'trigger':         'ticket_created',
        'condition_match': 'all',
        'conditions': [
            {'field': 'ticket.priority', 'operator': 'equals',   'value': 'critical'},
            {'field': 'ticket.assignee', 'operator': 'is_empty', 'value': ''},
        ],
        'actions': [
            {'type': 'add_tag',           'value': 'needs-assignment'},
            {'type': 'add_internal_note', 'value': 'Critical ticket created with no assignee — please assign immediately.'},
        ],
        'stop_processing': False,
        'priority_order':  8,
    },
    {
        'id':              'tpl-no-category',
        'name':            'New Ticket No Category → Set General',
        'description':     'Assign a default category to tickets that arrive without one.',
        'category':        'Defaults',
        'trigger':         'ticket_created',
        'condition_match': 'all',
        'conditions': [
            {'field': 'ticket.category', 'operator': 'is_empty', 'value': ''},
        ],
        'actions': [
            {'type': 'set_category', 'value': 'General'},
        ],
        'stop_processing': False,
        'priority_order':  90,
    },
    {
        'id':              'tpl-vip-critical',
        'name':            'VIP + Critical → Escalation Note',
        'description':     'Add an escalation internal note when a VIP user submits a critical ticket.',
        'category':        'Defaults',
        'trigger':         'ticket_created',
        'condition_match': 'all',
        'conditions': [
            {'field': 'requester.is_vip', 'operator': 'equals', 'value': 'true'},
            {'field': 'ticket.priority',  'operator': 'equals', 'value': 'critical'},
        ],
        'actions': [
            {'type': 'add_internal_note', 'value': 'VIP user has submitted a critical ticket — escalate immediately and keep them updated.'},
            {'type': 'add_tag',           'value': 'vip-critical'},
        ],
        'stop_processing': False,
        'priority_order':  2,
    },
]

FIELD_REGISTRY = {
    # ── Ticket scalar fields ───────────────────────────────────────────────
    'ticket.title': {
        'label': 'Ticket Title',
        'type':  'text',
    },
    'ticket.description': {
        'label': 'Description',
        'type':  'text',
    },
    'ticket.status': {
        'label':   'Status',
        'type':    'choice',
        'choices': ['open', 'pending', 'in_progress', 'waiting_on_customer', 'solved', 'closed'],
    },
    'ticket.priority': {
        'label':   'Priority',
        'type':    'choice',
        'choices': ['low', 'normal', 'high', 'critical'],
    },
    'ticket.level': {
        'label':   'Level',
        'type':    'choice',
        'choices': ['L1', 'L2', 'L3'],
    },
    'ticket.category': {
        'label': 'Category',
        'type':  'text',
    },
    'ticket.tags': {
        'label': 'Tags',
        'type':  'text',
    },
    'ticket.group': {
        'label': 'Group Name',
        'type':  'text',
    },
    'ticket.client_org': {
        'label': 'Organization',
        'type':  'text',
    },
    'ticket.sla_status': {
        'label':   'SLA Status',
        'type':    'choice',
        'choices': ['not_applied', 'on_track', 'due_soon', 'breached', 'completed'],
    },
    'ticket.has_attachment': {
        'label': 'Has Attachment',
        'type':  'bool',
    },
    'ticket.is_assigned': {
        'label': 'Is Assigned',
        'type':  'bool',
    },
    'ticket.assignee_name': {
        'label': 'Assignee Name',
        'type':  'text',
    },
    # ── Ticket numeric fields ──────────────────────────────────────────────
    'ticket.days_open': {
        'label': 'Days Open',
        'type':  'numeric',
    },
    'ticket.hours_since_update': {
        'label': 'Hours Since Last Update',
        'type':  'numeric',
    },
    'ticket.reply_count': {
        'label': 'Reply Count',
        'type':  'numeric',
    },
    # ── Requester fields ───────────────────────────────────────────────────
    'requester.email': {
        'label': 'Requester Email',
        'type':  'text',
    },
    'requester.email_domain': {
        'label': 'Requester Email Domain',
        'type':  'text',
    },
    'requester.is_vip': {
        'label': 'Requester is VIP',
        'type':  'bool',
    },
    'ticket.is_internal': {
        'label': 'Is Internal Ticket',
        'type':  'bool',
    },
    # ── Reply fields (only meaningful for reply_added / customer_replied) ──
    'reply.body': {
        'label': 'Reply Body',
        'type':  'text',
    },
    'reply.is_from_customer': {
        'label': 'Reply is from Customer',
        'type':  'bool',
    },
}

OPERATOR_REGISTRY = {
    'contains':      {'label': 'contains',         'applicable': ['text']},
    'not_contains':  {'label': 'does not contain', 'applicable': ['text']},
    'equals':        {'label': 'equals',           'applicable': ['text', 'choice', 'bool']},
    'not_equals':    {'label': 'does not equal',   'applicable': ['text', 'choice', 'bool']},
    'starts_with':   {'label': 'starts with',      'applicable': ['text']},
    'ends_with':     {'label': 'ends with',        'applicable': ['text']},
    'is_empty':      {'label': 'is empty',         'applicable': ['text', 'choice']},
    'is_not_empty':  {'label': 'is not empty',     'applicable': ['text', 'choice']},
    'in_list':       {'label': 'is one of',        'applicable': ['text', 'choice']},
    'greater_than':  {'label': 'greater than',     'applicable': ['numeric']},
    'less_than':     {'label': 'less than',        'applicable': ['numeric']},
}

ACTION_REGISTRY = {
    'link_to_project': {
        'label': 'Link to Project',
        'value_type': 'project_id',
    },
    'set_priority': {
        'label':      'Set Priority',
        'value_type': 'choice',
        'choices':    ['low', 'normal', 'high', 'critical'],
    },
    'set_status': {
        'label':      'Set Status',
        'value_type': 'choice',
        'choices':    ['open', 'pending', 'in_progress', 'waiting_on_customer', 'solved', 'closed'],
    },
    'set_group': {
        'label':      'Set Group',
        'value_type': 'group_id',
    },
    'set_assignee': {
        'label':      'Assign Agent',
        'value_type': 'agent_id',
    },
    'add_tag': {
        'label':      'Add Tag',
        'value_type': 'text',
    },
    'remove_tag': {
        'label':      'Remove Tag',
        'value_type': 'text',
    },
    'set_level': {
        'label':      'Set Level',
        'value_type': 'choice',
        'choices':    ['L1', 'L2', 'L3'],
    },
    'set_category': {
        'label':      'Set Category',
        'value_type': 'text',
    },
    'add_internal_note': {
        'label':      'Add Internal Note',
        'value_type': 'text',
    },
    'set_due_by': {
        'label':       'Set Due Date',
        'value_type':  'text',
        'placeholder': '+2h  /  +1d  /  +30m',
    },
    'notify_agent': {
        'label':      'Notify Agent',
        'value_type': 'agent_id',
    },
    'webhook': {
        'label':       'Send Webhook',
        'value_type':  'text',
        'placeholder': 'https://hooks.example.com/…',
    },
    # ── New actions ────────────────────────────────────────────────────────
    'escalate_priority': {
        'label':      'Escalate Priority',
        'value_type': 'none',
    },
    'reopen_ticket': {
        'label':      'Reopen Ticket',
        'value_type': 'none',
    },
    'remove_assignee': {
        'label':      'Remove Assignee',
        'value_type': 'none',
    },
    'cc_agent': {
        'label':      'CC Agent (Secondary Assignee)',
        'value_type': 'agent_id',
    },
    'send_email_requester': {
        'label':       'Send Email to Requester',
        'value_type':  'text',
        'placeholder': 'Email body text…',
    },
    'send_email_assignee': {
        'label':       'Send Email to Assignee',
        'value_type':  'text',
        'placeholder': 'Email body text…',
    },
}

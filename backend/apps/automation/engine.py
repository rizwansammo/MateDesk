import threading

_running = threading.local()


def _get_field_value(ticket, field_key, reply=None):
    if field_key == 'ticket.title':
        return (ticket.subject or '').lower()
    if field_key == 'ticket.description':
        return (ticket.description or '').lower()
    if field_key == 'ticket.status':
        return ticket.status or ''
    if field_key == 'ticket.priority':
        return ticket.priority or ''
    if field_key == 'ticket.level':
        return ticket.level or ''
    if field_key == 'ticket.category':
        return (ticket.category or '').lower()
    if field_key == 'ticket.tags':
        return ' '.join(ticket.tags or []).lower()
    if field_key == 'ticket.group':
        return (ticket.group.name if ticket.group_id and ticket.group else '').lower()
    if field_key == 'ticket.client_org':
        return (ticket.client_org.name if ticket.client_org_id and ticket.client_org else '').lower()
    if field_key == 'ticket.sla_status':
        return ticket.sla_status or 'not_applied'
    if field_key == 'ticket.has_attachment':
        return ticket.attachments.exists()
    if field_key == 'ticket.is_assigned':
        return bool(ticket.assignee_id)
    if field_key == 'ticket.assignee_name':
        return (ticket.assignee.full_name if ticket.assignee_id and ticket.assignee else '').lower()
    # Numeric fields
    if field_key == 'ticket.days_open':
        from django.utils import timezone
        if ticket.created_at:
            return (timezone.now() - ticket.created_at).total_seconds() / 86400
        return 0.0
    if field_key == 'ticket.hours_since_update':
        from django.utils import timezone
        ts = ticket.updated_at or ticket.created_at
        if ts:
            return (timezone.now() - ts).total_seconds() / 3600
        return 0.0
    if field_key == 'ticket.reply_count':
        return float(ticket.replies.filter(type__in=['public_reply', 'internal_note']).count())
    # Requester fields
    if field_key == 'requester.email':
        return (ticket.requester.email if ticket.requester_id and ticket.requester else '').lower()
    if field_key == 'requester.email_domain':
        email = (ticket.requester.email if ticket.requester_id and ticket.requester else '')
        return email.split('@')[1].lower() if '@' in email else ''
    if field_key == 'requester.is_vip':
        return bool(ticket.requester_id and ticket.requester and getattr(ticket.requester, 'is_vip', False))
    if field_key == 'ticket.is_internal':
        return bool(getattr(ticket, 'is_internal', False))
    # Reply fields
    if field_key == 'reply.body':
        return (reply.body if reply else '').lower()
    if field_key == 'reply.is_from_customer':
        if reply is None:
            return False
        from apps.users.permissions import MSP_ROLES
        author = reply.author
        if not (reply.author_id and author):
            return False
        return getattr(author, 'role', None) not in MSP_ROLES
    return ''


def _evaluate_condition(ticket, condition, reply=None):
    field    = condition.get('field', '')
    operator = condition.get('operator', '')
    value    = condition.get('value', '')
    actual   = _get_field_value(ticket, field, reply=reply)

    if isinstance(actual, bool):
        cmp_value = str(value).lower() in ('true', '1', 'yes')
        if operator == 'equals':     return actual == cmp_value
        if operator == 'not_equals': return actual != cmp_value
        return False

    # Numeric operators
    if isinstance(actual, float):
        try:
            cmp_float = float(value)
        except (TypeError, ValueError):
            return False
        if operator == 'greater_than': return actual > cmp_float
        if operator == 'less_than':    return actual < cmp_float
        if operator == 'equals':       return actual == cmp_float
        if operator == 'not_equals':   return actual != cmp_float
        return False

    actual_str = str(actual).lower()
    value_str  = str(value).lower()

    if operator == 'contains':     return value_str in actual_str
    if operator == 'not_contains': return value_str not in actual_str
    if operator == 'equals':       return actual_str == value_str
    if operator == 'not_equals':   return actual_str != value_str
    if operator == 'starts_with':  return actual_str.startswith(value_str)
    if operator == 'ends_with':    return actual_str.endswith(value_str)
    if operator == 'is_empty':     return actual_str.strip() == ''
    if operator == 'is_not_empty': return actual_str.strip() != ''
    if operator == 'in_list':
        options = [v.strip().lower() for v in str(value).split(',')]
        return actual_str in options
    return False


def evaluate_conditions(rule, ticket, reply=None):
    conditions = rule.conditions or []
    if not conditions:
        return True
    results = [_evaluate_condition(ticket, c, reply=reply) for c in conditions]
    return any(results) if rule.condition_match == 'any' else all(results)


def _apply_action(ticket, action, trigger=''):
    from apps.tickets.models import Ticket
    action_type = action.get('type', '')
    value       = str(action.get('value', ''))

    if action_type == 'link_to_project':
        # A ticket can be associated with one Project only. Never override
        # an agent's choice or a higher priority matching automation rule.
        # Only the new ticket event is eligible, even for legacy malformed rules.
        if trigger != 'ticket_created' or not ticket.client_org_id:
            return None

        import uuid as _uuid
        from django.db import transaction
        from apps.projects.models import Project, TicketProjectAssociation

        try:
            project_id = _uuid.UUID(value)
        except (ValueError, AttributeError, TypeError):
            return None

        with transaction.atomic():
            # Serialize competing project routing rules and simultaneous manual
            # edits on the same ticket, without joining nullable relationships.
            locked_ticket = Ticket.objects.select_for_update().get(pk=ticket.pk)
            if (not locked_ticket.client_org_id
                    or locked_ticket.merge_status == 'secondary'):
                return None
            if TicketProjectAssociation.objects.filter(ticket=locked_ticket).exists():
                return None

            project = Project.objects.filter(
                pk=project_id,
                tenant_id=locked_ticket.tenant_id,
                client_org_id=locked_ticket.client_org_id,
                client_org__is_active=True,
            ).exclude(status='archived').select_related('client_org').first()
            if not project or project.client_org.name == 'Walk-In':
                return None

            association = TicketProjectAssociation(
                ticket=locked_ticket,
                project=project,
                source='automation',
            )
            association.save()
            return f'Linked to Project: {project.key} ({project.name})'

    if action_type == 'set_priority':
        if value in ('low', 'normal', 'high', 'critical'):
            Ticket.objects.filter(pk=ticket.pk).update(priority=value)
            ticket.priority = value
            return f'Set priority → {value}'

    elif action_type == 'set_status':
        valid = ('open', 'pending', 'in_progress', 'waiting_on_customer', 'solved', 'closed')
        if value in valid:
            Ticket.objects.filter(pk=ticket.pk).update(status=value)
            ticket.status = value
            return f'Set status → {value}'

    elif action_type == 'set_group':
        from apps.tickets.models import SupportGroup
        import uuid as _uuid
        try:
            group = SupportGroup.objects.get(pk=_uuid.UUID(value), tenant_id=ticket.tenant_id)
            Ticket.objects.filter(pk=ticket.pk).update(group_id=group.pk)
            ticket.group_id = group.pk
            return f'Set group → {group.name}'
        except (ValueError, SupportGroup.DoesNotExist):
            return None

    elif action_type == 'set_assignee':
        from apps.users.models import User
        import uuid as _uuid
        try:
            agent = User.objects.get(pk=_uuid.UUID(value), tenant_id=ticket.tenant_id, is_active=True)
            Ticket.objects.filter(pk=ticket.pk).update(assignee_id=agent.pk)
            ticket.assignee_id = agent.pk
            return f'Assign → {agent.full_name}'
        except (ValueError, User.DoesNotExist):
            return None

    elif action_type == 'add_tag':
        if value:
            tags = list(ticket.tags or [])
            if value not in tags:
                tags.append(value)
                Ticket.objects.filter(pk=ticket.pk).update(tags=tags)
                ticket.tags = tags
                return f'Added tag: {value}'

    elif action_type == 'remove_tag':
        tags = list(ticket.tags or [])
        if value in tags:
            tags.remove(value)
            Ticket.objects.filter(pk=ticket.pk).update(tags=tags)
            ticket.tags = tags
            return f'Removed tag: {value}'

    elif action_type == 'set_level':
        if value in ('L1', 'L2', 'L3'):
            Ticket.objects.filter(pk=ticket.pk).update(level=value)
            ticket.level = value
            return f'Set level → {value}'

    elif action_type == 'set_category':
        if value:
            Ticket.objects.filter(pk=ticket.pk).update(category=value)
            ticket.category = value
            return f'Set category → {value}'

    elif action_type == 'add_internal_note':
        from apps.tickets.models import Reply
        if value:
            Reply.objects.create(
                ticket=ticket,
                type='internal_note',
                body=f'[Automation] {value}',
            )
            return 'Added internal note'

    elif action_type == 'set_due_by':
        import re
        from datetime import timedelta
        from django.utils import timezone
        m = re.match(r'^\+(\d+)([mhd])$', value.strip().lower())
        if m:
            amount = int(m.group(1))
            unit   = m.group(2)
            delta  = (
                timedelta(minutes=amount) if unit == 'm' else
                timedelta(hours=amount)   if unit == 'h' else
                timedelta(days=amount)
            )
            due = timezone.now() + delta
            Ticket.objects.filter(pk=ticket.pk).update(due_by=due)
            ticket.due_by = due
            label = {'m': 'min', 'h': 'h', 'd': 'd'}[unit]
            return f'Set due by → +{amount}{label} from now'

    elif action_type == 'notify_agent':
        from apps.users.models import User
        from apps.tickets.models import Notification
        import uuid as _uuid
        try:
            agent = User.objects.get(pk=_uuid.UUID(value), tenant_id=ticket.tenant_id, is_active=True)
            Notification.objects.create(
                tenant_id=ticket.tenant_id,
                recipient=agent,
                notif_type='assigned',
                ticket=ticket,
                message=f'Automation: {ticket.ticket_ref} — {(ticket.subject or "")[:80]}',
            )
            return f'Notified {agent.full_name}'
        except (ValueError, User.DoesNotExist):
            return None

    elif action_type == 'webhook':
        import http.client
        import ipaddress
        import json as _json
        import socket
        import ssl
        from urllib.parse import urlparse

        url = value.strip()
        if not url.startswith('https://'):
            return None  # require HTTPS; block plain http

        parsed   = urlparse(url)
        hostname = parsed.hostname or ''
        port     = parsed.port or 443
        path     = parsed.path or '/'
        if parsed.query:
            path += '?' + parsed.query
        if not hostname:
            return None

        # Resolve ONCE, validate every returned address, then pin the TCP
        # connection to a validated IP. urllib/requests would re-resolve the
        # hostname at connect time, which a malicious DNS server can rebind to an
        # internal IP (e.g. cloud metadata) after the check passes. Connecting to
        # the exact IP we validated closes that DNS-rebinding window. getaddrinfo
        # also covers IPv6, which gethostbyname did not.
        try:
            addrinfos = socket.getaddrinfo(hostname, port, type=socket.SOCK_STREAM)
        except Exception:
            return None
        safe_ip = None
        safe_family = None
        for family, _stype, _proto, _canon, sockaddr in addrinfos:
            try:
                ip = ipaddress.ip_address(sockaddr[0])
            except ValueError:
                return None
            if (ip.is_private or ip.is_loopback or ip.is_link_local
                    or ip.is_reserved or ip.is_multicast or ip.is_unspecified):
                return None  # SSRF guard: any internal/private address → block
            if safe_ip is None:
                safe_ip, safe_family = sockaddr[0], family
        if safe_ip is None:
            return None

        payload = _json.dumps({
            'ticket_ref': ticket.ticket_ref,
            'trigger':    trigger,
            'ticket': {
                'subject':  ticket.subject,
                'status':   ticket.status,
                'priority': ticket.priority,
                'level':    ticket.level,
                'category': ticket.category,
                'tags':     ticket.tags or [],
                'org':      (ticket.client_org.name if ticket.client_org_id and ticket.client_org else ''),
            },
        }).encode('utf-8')

        raw_sock = None
        try:
            raw_sock = socket.socket(safe_family, socket.SOCK_STREAM)
            raw_sock.settimeout(10)
            raw_sock.connect((safe_ip, port))
            ctx = ssl.create_default_context()
            # server_hostname keeps SNI + certificate validation against the real
            # host even though we dialed the validated IP directly.
            tls_sock = ctx.wrap_socket(raw_sock, server_hostname=hostname)
            conn = http.client.HTTPSConnection(hostname, port, timeout=10)
            conn.sock = tls_sock  # use our pinned, validated socket — skips re-resolve
            conn.request('POST', path, body=payload, headers={
                'Content-Type': 'application/json',
                'User-Agent': 'MateDesk-Automation/1.0',
            })
            conn.getresponse()
            conn.close()
            short = url[:60] + ('…' if len(url) > 60 else '')
            return f'Webhook → {short}'
        except Exception:
            try:
                if raw_sock is not None:
                    raw_sock.close()
            except Exception:
                pass
            return None

    elif action_type == 'escalate_priority':
        _priority_order = ['low', 'normal', 'high', 'critical']
        current = ticket.priority or 'low'
        try:
            idx = _priority_order.index(current)
        except ValueError:
            idx = 0
        new_priority = _priority_order[min(idx + 1, len(_priority_order) - 1)]
        if new_priority != current:
            Ticket.objects.filter(pk=ticket.pk).update(priority=new_priority)
            ticket.priority = new_priority
            return f'Escalated priority: {current} → {new_priority}'
        return f'Priority already at {current}'

    elif action_type == 'reopen_ticket':
        Ticket.objects.filter(pk=ticket.pk).update(status='open')
        ticket.status = 'open'
        return 'Reopened ticket → open'

    elif action_type == 'remove_assignee':
        Ticket.objects.filter(pk=ticket.pk).update(assignee_id=None)
        ticket.assignee_id = None
        return 'Removed assignee'

    elif action_type == 'cc_agent':
        from apps.users.models import User
        import uuid as _uuid
        try:
            agent = User.objects.get(pk=_uuid.UUID(value), tenant_id=ticket.tenant_id, is_active=True)
            ticket.secondary_agents.add(agent)
            return f"CC'd {agent.full_name}"
        except (ValueError, User.DoesNotExist):
            return None

    elif action_type == 'send_email_requester':
        from django.core.mail import send_mail
        if value and ticket.requester_id and ticket.requester:
            try:
                send_mail(
                    subject=f'[{ticket.ticket_ref}] Update on your ticket',
                    message=value,
                    from_email=None,
                    recipient_list=[ticket.requester.email],
                    fail_silently=True,
                )
                return f'Email sent to requester ({ticket.requester.email})'
            except Exception:
                return None

    elif action_type == 'send_email_assignee':
        from django.core.mail import send_mail
        if value and ticket.assignee_id and ticket.assignee:
            try:
                send_mail(
                    subject=f'[{ticket.ticket_ref}] Automation notice',
                    message=value,
                    from_email=None,
                    recipient_list=[ticket.assignee.email],
                    fail_silently=True,
                )
                return f'Email sent to assignee ({ticket.assignee.email})'
            except Exception:
                return None

    return None


def _project_routing_scope_matches(rule, ticket):
    """Implicitly scope a Project action to its client's organization.

    A rule configured for all organizations must not block unrelated tenants'
    or client organizations' other ticket automation actions or stop processing.
    This also fails closed if the target project was archived or deleted.
    """
    project_actions = [
        action for action in (rule.actions or [])
        if action.get('type') == 'link_to_project'
    ]
    if not project_actions:
        return True

    import uuid
    from apps.projects.models import Project
    try:
        project_id = uuid.UUID(str(project_actions[0].get('value', '')))
    except (TypeError, ValueError, AttributeError):
        return False

    return bool(ticket.client_org_id) and Project.objects.filter(
        pk=project_id,
        tenant_id=ticket.tenant_id,
        client_org_id=ticket.client_org_id,
        client_org__is_active=True,
    ).exclude(
        status='archived',
    ).exclude(client_org__name='Walk-In').exists()


def dry_run_automation_rules(ticket, trigger, reply=None):
    """Evaluate rules against a ticket without applying any changes."""
    from apps.tickets.models import Ticket
    from .models import AutomationRule

    try:
        ticket = (
            Ticket.objects
            .select_related('client_org', 'group', 'assignee', 'requester', 'tenant')
            .prefetch_related('secondary_agents')
            .get(pk=ticket.pk)
        )
    except Ticket.DoesNotExist:
        return []

    rules = (
        AutomationRule.objects
        .filter(tenant_id=ticket.tenant_id, is_active=True, trigger=trigger)
        .select_related('scope_org')
        .order_by('priority_order', 'name', 'id')
    )

    results = []
    stopped = False
    for rule in rules:
        if rule.scope_type == 'specific_org' and rule.scope_org_id != ticket.client_org_id:
            results.append({
                'rule_id':         str(rule.id),
                'rule_name':       rule.name,
                'would_fire':      False,
                'skip_reason':     'Scope: different organization',
                'actions':         [],
                'stop_processing': rule.stop_processing,
                'blocked_by_stop': stopped,
            })
            continue

        if not _project_routing_scope_matches(rule, ticket):
            results.append({
                'rule_id': str(rule.id),
                'rule_name': rule.name,
                'would_fire': False,
                'skip_reason': 'Project belongs to another organization or is unavailable',
                'actions': [],
                'stop_processing': rule.stop_processing,
                'blocked_by_stop': stopped,
            })
            continue

        would_fire = evaluate_conditions(rule, ticket, reply=reply) and not stopped
        results.append({
            'rule_id':         str(rule.id),
            'rule_name':       rule.name,
            'would_fire':      would_fire,
            'skip_reason':     'Blocked by earlier stop-processing rule' if stopped else None,
            'actions':         rule.actions if would_fire else [],
            'stop_processing': rule.stop_processing,
            'blocked_by_stop': stopped,
        })
        if would_fire and rule.stop_processing:
            stopped = True

    return results


def run_automation_rules(ticket, trigger, reply=None):
    if getattr(_running, 'active', False):
        return
    _running.active = True
    try:
        from apps.tickets.models import Ticket
        from .models import AutomationRule, AutomationLog

        try:
            ticket = (
                Ticket.objects
                .select_related('client_org', 'group', 'assignee', 'requester', 'tenant')
                .prefetch_related('secondary_agents')
                .get(pk=ticket.pk)
            )
        except Ticket.DoesNotExist:
            return

        rules = (
            AutomationRule.objects
            .filter(tenant_id=ticket.tenant_id, is_active=True, trigger=trigger)
            .select_related('scope_org')
            .order_by('priority_order', 'name', 'id')
        )

        for rule in rules:
            try:
                if rule.scope_type == 'specific_org' and rule.scope_org_id != ticket.client_org_id:
                    continue

                if not _project_routing_scope_matches(rule, ticket):
                    continue

                if not evaluate_conditions(rule, ticket, reply=reply):
                    continue

                applied = []
                for action in (rule.actions or []):
                    try:
                        result = _apply_action(ticket, action, trigger)
                        if result:
                            applied.append(result)
                    except Exception:
                        pass

                if applied:
                    AutomationLog.objects.create(
                        tenant_id=ticket.tenant_id,
                        rule=rule,
                        rule_name=rule.name,
                        ticket_ref=ticket.ticket_ref,
                        trigger=trigger,
                        actions_taken=applied,
                    )

                if rule.stop_processing:
                    break

                # Re-fetch so subsequent rules see latest state
                ticket = (
                    Ticket.objects
                    .select_related('client_org', 'group', 'assignee', 'requester')
                    .prefetch_related('secondary_agents')
                    .get(pk=ticket.pk)
                )
            except Exception:
                pass
    finally:
        _running.active = False

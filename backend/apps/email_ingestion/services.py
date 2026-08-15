"""Email ingestion service — IMAP polling, email parsing, ticket/reply routing.

    poll_tenant_mailbox(tenant)          → int (emails processed)
    test_imap_connection(settings_obj)   → (bool, str)
    test_smtp_connection(settings_obj)   → (bool, str)
    send_reply_email(reply)              → None
"""
import email
import email.header
import email.utils
import imaplib
import logging
import re
import smtplib
import socket
import ssl
import uuid
from email.mime.image import MIMEImage
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from io import BytesIO

from django.core.files.uploadedfile import InMemoryUploadedFile
from django.db import transaction
from django.utils import timezone

logger = logging.getLogger(__name__)


def _clean_addrs(addrs):
    """Drop blanks and reject anything containing CR/LF — prevents SMTP header
    injection (e.g. a smuggled 'Bcc:' line) via attacker-influenced recipients."""
    out = []
    for a in addrs or []:
        if not isinstance(a, str):
            continue
        a = a.strip()
        if not a or '\r' in a or '\n' in a:
            continue
        out.append(a)
    return out


# ── Public API ────────────────────────────────────────────────────────────────

def poll_tenant_mailbox(tenant):
    """Connect to tenant IMAP, process all UNSEEN messages. Returns count."""
    try:
        settings = tenant.email_settings
    except Exception:
        return 0

    if not settings.imap_enabled or not settings.imap_host:
        return 0

    processed = 0
    try:
        conn = _imap_connect(settings)
        conn.select(settings.imap_folder or 'INBOX')
        _, data = conn.search(None, 'UNSEEN')
        uids = data[0].split() if data[0] else []

        for uid in uids:
            try:
                _, msg_data = conn.fetch(uid, '(RFC822)')
                raw = msg_data[0][1]
                msg = email.message_from_bytes(raw)
                _process_email(tenant, msg)
                conn.store(uid, '+FLAGS', '\\Seen')
                processed += 1
            except Exception:
                pass  # don't abort the batch on one bad message

        conn.logout()
        settings.last_polled_at = timezone.now()
        settings.emails_processed = (settings.emails_processed or 0) + processed
        settings.last_error = ''
        settings.save(update_fields=['last_polled_at', 'emails_processed', 'last_error'])
    except Exception as exc:
        settings.last_error = str(exc)
        settings.save(update_fields=['last_error'])

    return processed


_AUTH_HINT = ('Authentication failed — check the username and password. '
              'Gmail and Microsoft 365 require an App Password when 2FA is on.')


def _friendly_error(exc, protocol):
    """Map a connection failure to a message that is safe to show the user.

    The traceback goes to the log; the browser gets a short, actionable string.
    Returning str(exc) leaked internal Python errors into the settings UI.
    """
    logger.warning('%s connection test failed', protocol, exc_info=True)

    if isinstance(exc, (socket.gaierror, socket.herror)):
        return 'Server not found — check the host name.'
    if isinstance(exc, ConnectionRefusedError):
        return 'Connection refused — check the port and the security setting.'
    if isinstance(exc, TimeoutError):
        return 'Connection timed out — check the host, port, and any firewall.'
    if isinstance(exc, ssl.SSLError):
        return 'TLS handshake failed — the security setting may not match the port.'
    if isinstance(exc, smtplib.SMTPAuthenticationError):
        return _AUTH_HINT
    if isinstance(exc, smtplib.SMTPNotSupportedError):
        return 'The server rejected that security mode — try the other option.'
    if isinstance(exc, imaplib.IMAP4.error):
        text = str(exc).upper()
        if 'AUTHENTICATIONFAILED' in text or 'INVALID CREDENTIALS' in text:
            return _AUTH_HINT
        return 'The mail server rejected the request.'
    if isinstance(exc, smtplib.SMTPException):
        return 'The mail server rejected the request.'
    return 'Could not connect — check the settings and try again.'


def test_imap_connection(settings):
    """Test IMAP credentials. Returns (success: bool, message: str)."""
    conn = None
    try:
        conn = _imap_connect(settings)
        return True, 'Connection successful.'
    except Exception as exc:
        return False, _friendly_error(exc, 'IMAP')
    finally:
        if conn is not None:
            try:
                conn.logout()
            except Exception:
                pass


def test_smtp_connection(settings):
    """Test SMTP credentials. Returns (success: bool, message: str).

    Authenticates only — no message is sent, so testing costs the tenant
    nothing and cannot deliver a stray email to anyone.
    """
    server = None
    try:
        server = _smtp_connect(settings)
        return True, 'Connection successful.'
    except Exception as exc:
        return False, _friendly_error(exc, 'SMTP')
    finally:
        if server is not None:
            try:
                server.quit()
            except Exception:
                pass


def send_reply_email(reply, *, to_emails=None, cc_emails=None, bcc_emails=None, include_history=False):
    """Send outbound SMTP when an agent posts a public reply to a ticket.

    to_emails: explicit list of To addresses. Falls back to the original sender
               when omitted (existing email-sourced ticket behaviour).
    cc_emails / bcc_emails: optional lists.
    include_history: if True, appends all prior public_reply messages below the body.
    """
    ticket = reply.ticket
    try:
        settings = ticket.tenant.email_settings
    except Exception:
        return

    if not settings.smtp_enabled or not settings.smtp_host or not settings.smtp_from_email:
        return

    # Resolve To recipients and threading headers
    source = ticket.source_emails.order_by('processed_at').first()
    source_message_id = source.message_id if source else None

    if not to_emails:
        if not source or not source.from_email:
            return
        to_emails = [source.from_email]

    # Strip CR/LF from every recipient to block SMTP header injection.
    to_emails  = _clean_addrs(to_emails)
    cc_emails  = _clean_addrs(cc_emails)
    bcc_emails = _clean_addrs(bcc_emails)
    if not to_emails:
        return

    from_addr = settings.smtp_from_email
    from_name = settings.smtp_from_name or 'Support'
    # Collapse newlines in the subject too — it is built from user-supplied data.
    subject   = f'Re: [{ticket.ticket_ref}] {ticket.subject}'.replace('\r', ' ').replace('\n', ' ')

    body = reply.body
    if include_history:
        body += _build_history_block(ticket, exclude_reply_id=reply.id)

    try:
        attachments = list(reply.attachments.all())

        if attachments:
            msg = MIMEMultipart('mixed')
            alt = MIMEMultipart('alternative')
            alt.attach(MIMEText(body, 'plain'))
            msg.attach(alt)
            for att in attachments:
                try:
                    with att.file.open('rb') as fh:
                        img_data = fh.read()
                    name_lower = (att.filename or '').lower()
                    if name_lower.endswith('.png'):
                        subtype = 'png'
                    elif name_lower.endswith('.gif'):
                        subtype = 'gif'
                    elif name_lower.endswith('.webp'):
                        subtype = 'webp'
                    else:
                        subtype = 'jpeg'
                    mime_img = MIMEImage(img_data, _subtype=subtype)
                    mime_img.add_header(
                        'Content-Disposition', 'attachment',
                        filename=att.filename or f'image.{subtype}',
                    )
                    msg.attach(mime_img)
                except Exception:
                    pass
        else:
            msg = MIMEMultipart('alternative')
            msg.attach(MIMEText(body, 'plain'))

        msg['Subject']    = subject
        msg['From']       = f'{from_name} <{from_addr}>'
        msg['To']         = ', '.join(to_emails)
        if cc_emails:
            msg['Cc']     = ', '.join(cc_emails)
        msg['Message-ID'] = f'<reply-{reply.id}-{uuid.uuid4().hex[:8]}@{settings.smtp_host}>'
        if source_message_id:
            msg['In-Reply-To'] = source_message_id
            msg['References']  = source_message_id

        all_recipients = to_emails + cc_emails + bcc_emails

        server = _smtp_connect(settings)
        server.sendmail(from_addr, all_recipients, msg.as_string())
        server.quit()
    except Exception:
        # Must not block the reply save, but the failure must not vanish silently.
        logger.exception('Failed to send reply email for reply %s (ticket %s)',
                         reply.id, ticket.ticket_ref)


# ── Internal helpers ──────────────────────────────────────────────────────────

def _imap_connect(settings):
    if settings.imap_use_ssl:
        conn = imaplib.IMAP4_SSL(settings.imap_host, int(settings.imap_port), timeout=15)
    else:
        conn = imaplib.IMAP4(settings.imap_host, int(settings.imap_port))
    conn.login(settings.imap_username, settings.get_imap_password())
    return conn


def _smtp_connect(settings):
    """Open an authenticated SMTP session. Shared by the sender and the test,
    so Test Connection exercises the same path a real reply takes."""
    if settings.smtp_use_tls:
        server = smtplib.SMTP(settings.smtp_host, int(settings.smtp_port), timeout=15)
        server.starttls()
    else:
        server = smtplib.SMTP_SSL(settings.smtp_host, int(settings.smtp_port), timeout=15)
    server.login(settings.smtp_username, settings.get_smtp_password())
    return server


@transaction.atomic
def _process_email(tenant, msg):
    from .models import ProcessedEmail
    from apps.tickets.models import Ticket, Reply, Attachment

    message_id = (msg.get('Message-ID') or '').strip()
    if not message_id:
        return

    if ProcessedEmail.objects.filter(tenant=tenant, message_id=message_id).exists():
        return

    from_name, from_email_addr = _parse_from(msg.get('From', ''))
    subject     = _decode_header_str(msg.get('Subject', ''))
    in_reply_to = (msg.get('In-Reply-To') or '').strip()
    body        = _get_body(msg)
    images      = _get_images(msg)
    cc_emails   = [addr for _, addr in email.utils.getaddresses(
                      [_decode_header_str(msg.get('Cc', '') or '')]
                  ) if addr]

    existing = _find_existing_ticket(tenant, subject, in_reply_to)

    if existing:
        from apps.users.models import User
        email_author = User.objects.filter(tenant=tenant, email__iexact=from_email_addr).first()
        reply = Reply.objects.create(
            ticket=existing,
            author=email_author,
            type='public_reply',
            body=body or '(no content)',
            cc_emails=cc_emails,
        )
        Ticket.objects.filter(pk=existing.pk).update(updated_at=timezone.now())
        for img_file, img_name in images:
            Attachment.objects.create(
                tenant=tenant, reply=reply,
                file=img_file, filename=img_name, size=img_file.size,
            )
        ProcessedEmail.objects.create(
            tenant=tenant, message_id=message_id,
            ticket=existing, reply=reply,
            from_email=from_email_addr, from_name=from_name, subject=subject,
            cc_emails=cc_emails,
        )
    else:
        clean_subject = _strip_re_fwd(subject) or '(No subject)'
        org = _resolve_client_org(tenant, from_email_addr)
        requester = _find_or_create_requester(tenant, from_email_addr, from_name, org)

        seq = Ticket.next_seq(tenant)
        ref = f"T{timezone.now().strftime('%d%m%Y')}-{seq:04d}"

        ticket = Ticket.objects.create(
            tenant=tenant,
            ticket_ref=ref,
            seq=seq,
            subject=clean_subject,
            description=body or '',
            status='open',
            priority='normal',
            client_org=org,
            requester=requester,
            requester_name=from_name or from_email_addr,
        )
        Reply.objects.create(
            ticket=ticket,
            author=None,
            type='system_event',
            body=f'Ticket created from email sent by {from_name or from_email_addr}',
        )
        for img_file, img_name in images:
            Attachment.objects.create(
                tenant=tenant, ticket=ticket,
                file=img_file, filename=img_name, size=img_file.size,
            )
        ProcessedEmail.objects.create(
            tenant=tenant, message_id=message_id,
            ticket=ticket,
            from_email=from_email_addr, from_name=from_name, subject=subject,
            cc_emails=cc_emails,
        )


def _find_existing_ticket(tenant, subject, in_reply_to):
    from .models import ProcessedEmail
    from apps.tickets.models import Ticket

    # Outbound replies include [T15052026-0001] in the subject
    m = re.search(r'\[T\d{8}-\d{4}\]', subject or '')
    if m:
        ref = m.group(0)[1:-1]
        try:
            return Ticket.objects.get(tenant=tenant, ticket_ref=ref)
        except Ticket.DoesNotExist:
            pass

    # In-Reply-To matches a message we previously processed
    if in_reply_to:
        pe = (
            ProcessedEmail.objects
            .filter(tenant=tenant, message_id=in_reply_to)
            .select_related('ticket')
            .first()
        )
        if pe and pe.ticket:
            return pe.ticket

    return None


def _find_or_create_requester(tenant, email_addr, display_name, org):
    """Return an existing User for this email, or create one if the org is known (not Walk-In)."""
    from apps.users.models import User

    if not email_addr:
        return None

    existing = User.objects.filter(tenant=tenant, email__iexact=email_addr).first()
    if existing:
        return existing

    # Only auto-create when the org is a real org (domain or KnownSender match)
    if not org or org.name == 'Walk-In':
        return None

    name_parts = (display_name or '').strip().split(' ', 1)
    first = name_parts[0] if name_parts and name_parts[0] else email_addr.split('@')[0]
    last  = name_parts[1] if len(name_parts) > 1 else ''

    try:
        return User.objects.create_user(
            email=email_addr,
            password=None,
            tenant=tenant,
            first_name=first,
            last_name=last,
            role='end_user',
            client_org=org,
            is_active=True,
        )
    except Exception:
        return None


def _resolve_client_org(tenant, from_email_addr):
    from apps.tenants.models import ClientOrganization
    from .models import KnownSender

    if from_email_addr:
        email_lower = from_email_addr.lower()

        # 1. Exact email match — KnownSender takes priority
        known = (
            KnownSender.objects
            .filter(tenant=tenant, email=email_lower)
            .select_related('client_org')
            .first()
        )
        if known and known.client_org.is_active:
            return known.client_org

        # 2. Domain match
        if '@' in from_email_addr:
            domain = from_email_addr.split('@')[1].lower()
            org = ClientOrganization.objects.filter(
                tenant=tenant, domain__iexact=domain, is_active=True
            ).first()
            if org:
                return org

    # 3. Walk-In fallback (auto-created on first use)
    walkin, _ = ClientOrganization.objects.get_or_create(
        tenant=tenant, name='Walk-In',
        defaults={'is_active': True},
    )
    return walkin


def _parse_from(from_header):
    """Parse 'Name <email>' → (name, email)."""
    name, addr = email.utils.parseaddr(from_header)
    if name:
        try:
            parts = email.header.decode_header(name)
            decoded = ''
            for part, charset in parts:
                if isinstance(part, bytes):
                    decoded += part.decode(charset or 'utf-8', errors='replace')
                else:
                    decoded += part
            name = decoded
        except Exception:
            pass
    return name.strip(), addr.strip().lower()


def _decode_header_str(value):
    if not value:
        return ''
    try:
        parts = email.header.decode_header(value)
        result = ''
        for part, charset in parts:
            if isinstance(part, bytes):
                result += part.decode(charset or 'utf-8', errors='replace')
            else:
                result += str(part)
        return result.strip()
    except Exception:
        return value


def _get_body(msg):
    """Extract plain-text body from an email.Message, stripping quoted history."""
    raw = ''
    if msg.is_multipart():
        for part in msg.walk():
            if (part.get_content_type() == 'text/plain'
                    and 'attachment' not in str(part.get('Content-Disposition', ''))):
                payload = part.get_payload(decode=True)
                charset = part.get_content_charset() or 'utf-8'
                raw = payload.decode(charset, errors='replace').strip()
                break
    else:
        payload = msg.get_payload(decode=True)
        if payload:
            charset = msg.get_content_charset() or 'utf-8'
            raw = payload.decode(charset, errors='replace').strip()

    if not raw:
        return ''

    try:
        from email_reply_parser import EmailReplyParser
        return EmailReplyParser.parse_reply(raw).strip()
    except Exception:
        return raw


def _build_history_block(ticket, exclude_reply_id):
    """Build a plain-text conversation history block for inclusion in outbound emails."""
    replies = (
        ticket.replies
        .filter(type='public_reply')
        .exclude(id=exclude_reply_id)
        .select_related('author')
        .order_by('created_at')
    )
    if not replies.exists():
        return ''
    lines = ['\n\n--- Conversation History ---\n']
    for r in replies:
        author = r.author.full_name if r.author else 'Customer'
        date_str = r.created_at.strftime('%b %d, %Y %H:%M')
        lines.append(f'{author} ({date_str}):')
        lines.append(r.body)
        lines.append('')
    return '\n'.join(lines)


def _strip_re_fwd(subject):
    s = re.sub(r'^(re|fwd|fw)\s*:\s*', '', subject or '', flags=re.IGNORECASE).strip()
    s = re.sub(r'\[T\d{8}-\d{4}\]\s*', '', s).strip()
    return s


_IMAGE_MIME_TYPES = {'image/jpeg', 'image/png', 'image/gif', 'image/webp'}
_IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.webp'}


def _get_images(msg):
    """Extract image attachments and inline images from an email.
    Returns a list of (InMemoryUploadedFile, filename) tuples."""
    import os
    results = []
    if not msg.is_multipart():
        return results

    for part in msg.walk():
        content_type = part.get_content_type()
        if content_type not in _IMAGE_MIME_TYPES:
            continue

        payload = part.get_payload(decode=True)
        if not payload or len(payload) > 10 * 1024 * 1024:  # skip > 10 MB
            continue

        filename = part.get_filename() or ''
        if filename:
            try:
                filename = _decode_header_str(filename)
            except Exception:
                pass
        if not filename:
            ext = content_type.split('/')[-1]
            filename = f'image.{ext}'

        _, ext = os.path.splitext(filename.lower())
        if ext not in _IMAGE_EXTENSIONS:
            ext = '.' + content_type.split('/')[-1]
            filename = filename + ext

        buf = BytesIO(payload)
        uploaded = InMemoryUploadedFile(
            file=buf,
            field_name='file',
            name=filename,
            content_type=content_type,
            size=len(payload),
            charset=None,
        )
        results.append((uploaded, filename))

    return results

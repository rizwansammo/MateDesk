import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText


def send_platform_email(*, to_email, subject, text_body, html_body, reply_to=None):
    """Send a platform-level transactional email using Platform Settings SMTP.

    Returns a (sent, error) tuple. Delivery failures never raise into the
    caller so account/application state is not rolled back because SMTP is down.
    """
    from .models import PlatformSettings

    ps = PlatformSettings.load()
    if not ps.admin_smtp_host or not ps.admin_smtp_from_email:
        return False, 'Platform email SMTP is not configured.'

    from_name = ps.admin_smtp_from_name or 'MateDesk'
    from_display = f'{from_name} <{ps.admin_smtp_from_email}>'

    msg = MIMEMultipart('alternative')
    msg['From'] = from_display
    msg['To'] = to_email
    msg['Subject'] = subject
    if reply_to:
        msg['Reply-To'] = reply_to

    msg.attach(MIMEText(text_body, 'plain', 'utf-8'))
    msg.attach(MIMEText(html_body, 'html', 'utf-8'))

    try:
        smtp_cls = smtplib.SMTP if ps.admin_smtp_use_tls else smtplib.SMTP_SSL
        with smtp_cls(ps.admin_smtp_host, ps.admin_smtp_port, timeout=15) as server:
            if ps.admin_smtp_use_tls:
                server.starttls()
            if ps.admin_smtp_username:
                server.login(ps.admin_smtp_username, ps.admin_smtp_password)
            server.sendmail(ps.admin_smtp_from_email, [to_email], msg.as_string())
        return True, ''
    except Exception as exc:
        return False, str(exc)[:1000]

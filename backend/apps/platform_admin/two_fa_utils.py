import io
import random
import smtplib
import string
from datetime import timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from django.utils import timezone


def _generate_code():
    return ''.join(random.choices(string.digits, k=6))


# ── Email OTP ────────────────────────────────────────────────────────────────

def create_email_otp(user):
    from .models import PlatformAdminOTP
    PlatformAdminOTP.objects.filter(user=user, is_used=False).update(is_used=True)
    code = _generate_code()
    otp = PlatformAdminOTP.objects.create(
        user=user,
        code=code,
        expires_at=timezone.now() + timedelta(minutes=10),
    )
    return otp


def verify_email_otp(user, code):
    from .models import PlatformAdminOTP
    otp = PlatformAdminOTP.objects.filter(
        user=user,
        code=code,
        is_used=False,
        expires_at__gt=timezone.now(),
    ).first()
    if not otp:
        return False
    otp.is_used = True
    otp.save(update_fields=['is_used'])
    return True


def send_otp_email(user, code):
    from .models import PlatformSettings
    ps = PlatformSettings.load()
    if not ps.admin_smtp_host or not ps.admin_smtp_from_email:
        return False
    try:
        from_display = f'{ps.admin_smtp_from_name or "MateDesk Admin"} <{ps.admin_smtp_from_email}>'
        msg = MIMEMultipart('alternative')
        msg['From']    = from_display
        msg['To']      = user.email
        msg['Subject'] = 'Platform Admin — Your Verification Code'

        text = (
            f'Your Platform Admin verification code is: {code}\n\n'
            f'This code expires in 10 minutes. Do not share it with anyone.'
        )
        html = f"""<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0d1117;font-family:Inter,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d1117;padding:40px 20px;">
    <tr><td align="center">
      <table width="420" cellpadding="0" cellspacing="0"
             style="background:#161b22;border:1px solid #30363d;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="padding:28px 32px 20px;border-bottom:1px solid #21262d;">
            <span style="color:#58a6ff;font-size:13px;font-weight:600;letter-spacing:.5px;">
              MATEDESK PLATFORM ADMIN
            </span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 8px;color:#e6edf3;font-size:15px;font-weight:500;">
              Hi {user.first_name or user.email},
            </p>
            <p style="margin:0 0 28px;color:#8b949e;font-size:13px;line-height:1.6;">
              Your verification code for Platform Admin login:
            </p>
            <div style="background:#0d1117;border:1px solid #30363d;border-radius:6px;
                        padding:20px;text-align:center;margin-bottom:28px;">
              <span style="font-size:36px;font-weight:700;letter-spacing:10px;color:#58a6ff;
                           font-family:monospace;">{code}</span>
            </div>
            <p style="margin:0;color:#8b949e;font-size:12px;line-height:1.6;">
              This code expires in <strong style="color:#e6edf3;">10 minutes</strong>.
              Do not share it with anyone.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;border-top:1px solid #21262d;">
            <p style="margin:0;color:#484f58;font-size:11px;">
              If you didn't request this code, someone may be trying to access your account.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""
        msg.attach(MIMEText(text, 'plain'))
        msg.attach(MIMEText(html, 'html'))

        if ps.admin_smtp_use_tls:
            server = smtplib.SMTP(ps.admin_smtp_host, ps.admin_smtp_port, timeout=15)
            server.starttls()
        else:
            server = smtplib.SMTP_SSL(ps.admin_smtp_host, ps.admin_smtp_port, timeout=15)

        if ps.admin_smtp_username:
            server.login(ps.admin_smtp_username, ps.admin_smtp_password)
        server.sendmail(ps.admin_smtp_from_email, [user.email], msg.as_string())
        server.quit()
        return True
    except Exception:
        return False


# ── TOTP (Authenticator App) ─────────────────────────────────────────────────

def generate_totp_secret():
    import pyotp
    return pyotp.random_base32()


def get_totp_provisioning_uri(user, secret):
    import pyotp
    return pyotp.TOTP(secret).provisioning_uri(
        name=user.email,
        issuer_name='MateDesk Admin',
    )


def verify_totp_code(secret, code):
    import pyotp
    return pyotp.TOTP(secret).verify(code, valid_window=1)


def generate_qr_svg(uri):
    import qrcode
    import qrcode.image.svg
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_L)
    qr.add_data(uri)
    qr.make(fit=True)
    img = qr.make_image(image_factory=qrcode.image.svg.SvgPathImage)
    buf = io.BytesIO()
    img.save(buf)
    return buf.getvalue().decode('utf-8')

import base64
import hashlib

from django.db import migrations

_ENC_PREFIX = "enc:v1:"
_DERIVE_SALT = "matedesk:email:credentials:v1"


def _build_cipher():
    from cryptography.fernet import Fernet
    from django.conf import settings

    configured = str(getattr(settings, "EMAIL_SETTINGS_SECRET_KEY", "") or "").strip()
    master_secret = configured or str(getattr(settings, "SECRET_KEY", "") or "")
    material = f"{_DERIVE_SALT}|{master_secret}".encode("utf-8")
    digest = hashlib.sha256(material).digest()
    key = base64.urlsafe_b64encode(digest)
    return Fernet(key)


def encrypt_existing_credentials(apps, schema_editor):
    EmailSettings = apps.get_model("email_ingestion", "TenantEmailSettings")
    cipher = _build_cipher()

    for obj in EmailSettings.objects.all().only(
        "id", "imap_password", "smtp_password", "oauth_client_secret"
    ):
        changed = False
        for field in ("imap_password", "smtp_password", "oauth_client_secret"):
            raw = str(getattr(obj, field, "") or "").strip()
            if raw and not raw.startswith(_ENC_PREFIX):
                token = cipher.encrypt(raw.encode("utf-8")).decode("utf-8")
                setattr(obj, field, f"{_ENC_PREFIX}{token}")
                changed = True
        if changed:
            obj.save(update_fields=["imap_password", "smtp_password", "oauth_client_secret"])


class Migration(migrations.Migration):

    dependencies = [
        ("email_ingestion", "0005_processedemail_cc_emails"),
    ]

    operations = [
        migrations.RunPython(
            encrypt_existing_credentials,
            reverse_code=migrations.RunPython.noop,
        ),
    ]

import base64
import hashlib
import logging
from functools import lru_cache

from django.conf import settings
from cryptography.fernet import Fernet, InvalidToken

LOGGER = logging.getLogger(__name__)

_ENC_PREFIX = "enc:v1:"
_DERIVE_SALT = "matedesk:email:credentials:v1"


def _resolve_master_secret() -> str:
    configured = str(getattr(settings, "EMAIL_SETTINGS_SECRET_KEY", "") or "").strip()
    if configured:
        return configured
    return str(getattr(settings, "SECRET_KEY", "") or "")


@lru_cache(maxsize=1)
def _get_cipher() -> Fernet:
    master_secret = _resolve_master_secret()
    material = f"{_DERIVE_SALT}|{master_secret}".encode("utf-8")
    digest = hashlib.sha256(material).digest()
    key = base64.urlsafe_b64encode(digest)
    return Fernet(key)


def encrypt_email_credential(raw_value: str) -> str:
    value = (raw_value or "").strip()
    if not value:
        return ""
    if value.startswith(_ENC_PREFIX):
        return value
    token = _get_cipher().encrypt(value.encode("utf-8")).decode("utf-8")
    return f"{_ENC_PREFIX}{token}"


def decrypt_email_credential(stored_value: str) -> str:
    value = (stored_value or "").strip()
    if not value:
        return ""
    if not value.startswith(_ENC_PREFIX):
        return value  # backward-compatible: legacy plaintext passes through
    token = value[len(_ENC_PREFIX):]
    try:
        return _get_cipher().decrypt(token.encode("utf-8")).decode("utf-8")
    except (InvalidToken, ValueError):
        LOGGER.warning("Could not decrypt email credential value.")
        return ""

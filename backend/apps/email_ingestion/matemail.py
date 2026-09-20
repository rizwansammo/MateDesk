import json
import urllib.error
import urllib.parse
import urllib.request

from django.conf import settings


class MateMailError(Exception):
    pass


def _base_url():
    return str(
        getattr(settings, "MATEMAIL_BASE_URL", "https://portal.matemail.online")
    ).rstrip("/")


def _headers(*, token="", tenant_id=""):
    headers = {"Accept": "application/json", "Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if tenant_id:
        headers["X-MateMail-Tenant"] = str(tenant_id)
    return headers


def _json(path, *, method="GET", body=None, token="", tenant_id=""):
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(
        _base_url() + path,
        data=data,
        headers=_headers(token=token, tenant_id=tenant_id),
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            raw = response.read().decode()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode(errors="replace")
        try:
            payload = json.loads(raw)
            detail = payload.get("detail") or payload
        except json.JSONDecodeError:
            detail = raw or f"MateMail returned HTTP {exc.code}."
        raise MateMailError(str(detail)) from exc
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise MateMailError("MateMail is temporarily unavailable.") from exc


def start_connection(tenant_id, integration_secret):
    return _json(
        "/api/integrations/connect/start/",
        method="POST",
        body={
            "tenant_id": str(tenant_id),
            "integration_secret": integration_secret,
        },
    )


def connection_status(tenant_id, poll_token):
    return _json(
        "/api/integrations/connect/status/",
        method="POST",
        body={"tenant_id": str(tenant_id), "poll_token": poll_token},
    )


def profile(*, token, tenant_id):
    return _json(
        "/api/integrations/external/profile/",
        token=token,
        tenant_id=tenant_id,
    )


def folders(*, token, tenant_id):
    return _json(
        "/api/integrations/external/folders/",
        token=token,
        tenant_id=tenant_id,
    )


def messages(*, token, tenant_id, folder="INBOX", unread=True, page=1, page_size=50):
    query = urllib.parse.urlencode(
        {
            "folder": folder,
            "unread": "true" if unread else "",
            "page": page,
            "page_size": page_size,
        }
    )
    return _json(
        f"/api/integrations/external/messages/?{query}",
        token=token,
        tenant_id=tenant_id,
    )


def raw_message(*, token, tenant_id, folder, uid, uid_validity):
    query = urllib.parse.urlencode(
        {
            "folder": folder,
            "uid": uid,
            "uid_validity": uid_validity,
        }
    )
    request = urllib.request.Request(
        _base_url() + f"/api/integrations/external/messages/raw/?{query}",
        headers={
            "Accept": "message/rfc822",
            "Authorization": f"Bearer {token}",
            "X-MateMail-Tenant": str(tenant_id),
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return response.read()
    except urllib.error.HTTPError as exc:
        raise MateMailError(
            exc.read().decode(errors="replace") or "MateMail could not read the message."
        ) from exc
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise MateMailError("MateMail is temporarily unavailable.") from exc


def mark_seen(*, token, tenant_id, folder, uid, uid_validity):
    return _json(
        "/api/integrations/external/messages/seen/",
        method="POST",
        body={
            "folder": folder,
            "uid": uid,
            "uid_validity": uid_validity,
            "seen": True,
        },
        token=token,
        tenant_id=tenant_id,
    )


def send_message(*, token, tenant_id, payload):
    return _json(
        "/api/integrations/external/send/",
        method="POST",
        body=payload,
        token=token,
        tenant_id=tenant_id,
    )


def disconnect(*, token, tenant_id):
    return _json(
        "/api/integrations/external/disconnect/",
        method="POST",
        body={},
        token=token,
        tenant_id=tenant_id,
    )

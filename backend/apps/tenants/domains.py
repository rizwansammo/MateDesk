import ipaddress
import re

from django.conf import settings
from django.core.exceptions import ValidationError


_LABEL_RE = re.compile(r'^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?

def normalize_custom_domain(value: str) -> str:
    raw = (value or '').strip().lower().rstrip('.')
    if not raw:
        return ''
    if '://' in raw or '/' in raw or ':' in raw or '*' in raw:
        return raw
    try:
        return raw.encode('idna').decode('ascii')
    except UnicodeError:
        return raw


def validate_custom_domain(domain: str) -> str:
    domain = normalize_custom_domain(domain)
    if not domain:
        raise ValidationError('Domain is required.')
    if len(domain) > 253:
        raise ValidationError('Domain is too long.')
    if '://' in domain or '/' in domain or ':' in domain or '*' in domain:
        raise ValidationError('Enter a hostname only, for example helpdesk.example.com.')
    if domain == 'localhost':
        raise ValidationError('localhost cannot be used as a custom domain.')

    try:
        ipaddress.ip_address(domain)
    except ValueError:
        pass
    else:
        raise ValidationError('IP addresses cannot be used as custom domains.')

    labels = domain.split('.')
    if len(labels) < 2 or any(not _LABEL_RE.fullmatch(label) for label in labels):
        raise ValidationError('Enter a valid fully-qualified domain name.')

    app_domain = (getattr(settings, 'APP_DOMAIN', '') or '').strip().lower().rstrip('.')
    if app_domain and (domain == app_domain or domain.endswith(f'.{app_domain}')):
        raise ValidationError('MateDesk platform hostnames cannot be claimed as custom domains.')

    return domain


def verify_domain_ownership(domain: str, token: str) -> bool:
    """Return True only when the exact MateDesk TXT ownership token is published."""
    import dns.exception
    import dns.resolver

    expected = f'matedesk-verification={token}'
    record_name = f'_matedesk-verify.{normalize_custom_domain(domain)}'
    try:
        answers = dns.resolver.resolve(record_name, 'TXT', lifetime=6.0)
    except dns.exception.DNSException:
        return False

    for answer in answers:
        # dnspython exposes TXT strings as byte chunks. Joining handles long records.
        chunks = getattr(answer, 'strings', None)
        if chunks is not None:
            value = b''.join(chunks).decode('utf-8', errors='replace')
        else:
            value = answer.to_text().strip('"')
        if value.strip() == expected:
            return True
    return False
)

# Platform infrastructure labels must never become tenant workspaces.
RESERVED_PLATFORM_SLUGS = {
    'www',
    'domains',
    'api',
    'admin',
    'django-admin',
    'platform-admin',
    'downloads',
}


def normalize_custom_domain(value: str) -> str:
    raw = (value or '').strip().lower().rstrip('.')
    if not raw:
        return ''
    if '://' in raw or '/' in raw or ':' in raw or '*' in raw:
        return raw
    try:
        return raw.encode('idna').decode('ascii')
    except UnicodeError:
        return raw


def validate_custom_domain(domain: str) -> str:
    domain = normalize_custom_domain(domain)
    if not domain:
        raise ValidationError('Domain is required.')
    if len(domain) > 253:
        raise ValidationError('Domain is too long.')
    if '://' in domain or '/' in domain or ':' in domain or '*' in domain:
        raise ValidationError('Enter a hostname only, for example helpdesk.example.com.')
    if domain == 'localhost':
        raise ValidationError('localhost cannot be used as a custom domain.')

    try:
        ipaddress.ip_address(domain)
    except ValueError:
        pass
    else:
        raise ValidationError('IP addresses cannot be used as custom domains.')

    labels = domain.split('.')
    if len(labels) < 2 or any(not _LABEL_RE.fullmatch(label) for label in labels):
        raise ValidationError('Enter a valid fully-qualified domain name.')

    app_domain = (getattr(settings, 'APP_DOMAIN', '') or '').strip().lower().rstrip('.')
    if app_domain and (domain == app_domain or domain.endswith(f'.{app_domain}')):
        raise ValidationError('MateDesk platform hostnames cannot be claimed as custom domains.')

    return domain


def verify_domain_ownership(domain: str, token: str) -> bool:
    """Return True only when the exact MateDesk TXT ownership token is published."""
    import dns.exception
    import dns.resolver

    expected = f'matedesk-verification={token}'
    record_name = f'_matedesk-verify.{normalize_custom_domain(domain)}'
    try:
        answers = dns.resolver.resolve(record_name, 'TXT', lifetime=6.0)
    except dns.exception.DNSException:
        return False

    for answer in answers:
        # dnspython exposes TXT strings as byte chunks. Joining handles long records.
        chunks = getattr(answer, 'strings', None)
        if chunks is not None:
            value = b''.join(chunks).decode('utf-8', errors='replace')
        else:
            value = answer.to_text().strip('"')
        if value.strip() == expected:
            return True
    return False

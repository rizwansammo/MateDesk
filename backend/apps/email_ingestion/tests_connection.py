"""
Mail-server connection testing — the Test Connection endpoints for IMAP and SMTP.

The network layer is mocked throughout. What these tests actually cover is the
handoff from view to connection helper — host, port, security mode, and above
all the *decrypted* password — plus what the user is shown when a connect fails.

Regression origin: the IMAP endpoint built an ad-hoc `Proxy` object exposing a
plaintext `imap_password` attribute, but `_imap_connect` calls
`get_imap_password()`. Every test raised AttributeError before a socket was
opened, and `str(exc)` rendered the raw Python error in the settings UI. The
probe is now an unsaved TenantEmailSettings, so it carries the real accessors.
"""
import imaplib
import smtplib
import socket
import ssl
from unittest.mock import MagicMock, patch

from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.tenants.models import Tenant
from apps.users.models import User
from apps.email_ingestion.models import TenantEmailSettings
from apps.email_ingestion.services import _friendly_error

IMAP_URL = '/api/email-settings/test-imap/'
SMTP_URL = '/api/email-settings/test-smtp/'

IMAP_TARGET     = 'apps.email_ingestion.services.imaplib.IMAP4_SSL'
IMAP_PLAIN      = 'apps.email_ingestion.services.imaplib.IMAP4'
SMTP_TARGET     = 'apps.email_ingestion.services.smtplib.SMTP'
SMTP_SSL_TARGET = 'apps.email_ingestion.services.smtplib.SMTP_SSL'


def _tenant(slug='mailtest-co'):
    return Tenant.objects.create(name='Mail Test Co', slug=slug, is_active=True)


def _user(tenant, role='msp_owner'):
    return User.objects.create_user(
        email=f'{role}@{tenant.slug}.test', password='testpass123',
        first_name='Test', last_name=role, role=role, tenant=tenant,
    )


def _client(user):
    c = APIClient()
    c.credentials(HTTP_AUTHORIZATION=f'Bearer {AccessToken.for_user(user)}')
    return c


def _settings(tenant, **overrides):
    """Persist settings. save() encrypts the passwords on the way in, which is
    exactly the state the fallback path has to cope with."""
    values = dict(
        imap_host='imap.example.com', imap_port=993,
        imap_username='helpdesk@example.com', imap_password='imap-secret',
        imap_use_ssl=True,
        smtp_host='smtp.example.com', smtp_port=587,
        smtp_username='helpdesk@example.com', smtp_password='smtp-secret',
        smtp_use_tls=True, smtp_from_email='support@example.com',
    )
    values.update(overrides)
    return TenantEmailSettings.objects.create(tenant=tenant, **values)


@override_settings(DEBUG=True)   # IsTenantUser needs a resolved tenant otherwise
class ImapProbeTest(TestCase):
    """The probe must reach _imap_connect with credentials it can actually use."""

    def setUp(self):
        self.tenant = _tenant()
        self.user   = _user(self.tenant)
        self.client = _client(self.user)

    def test_saved_password_arrives_decrypted(self):
        """The bug: the old Proxy had no get_imap_password(), so this 500'd into
        an AttributeError string. login() must see the plaintext, not the
        'enc:v1:' blob and not an empty string."""
        _settings(self.tenant)

        with patch(IMAP_TARGET) as mock_imap:
            resp = self.client.post(IMAP_URL, {'imap_host': 'imap.example.com'}, format='json')

        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data['success'], resp.data['message'])
        mock_imap.return_value.login.assert_called_once_with(
            'helpdesk@example.com', 'imap-secret',
        )

    def test_typed_password_wins_over_saved(self):
        _settings(self.tenant)

        with patch(IMAP_TARGET) as mock_imap:
            self.client.post(IMAP_URL, {
                'imap_host': 'imap.example.com', 'imap_password': 'freshly-typed',
            }, format='json')

        mock_imap.return_value.login.assert_called_once_with(
            'helpdesk@example.com', 'freshly-typed',
        )

    def test_encrypted_blob_never_sent_as_password(self):
        """Guards the inverse mistake — passing settings.imap_password straight
        through without decrypting."""
        _settings(self.tenant)

        with patch(IMAP_TARGET) as mock_imap:
            self.client.post(IMAP_URL, {'imap_host': 'imap.example.com'}, format='json')

        _, password = mock_imap.return_value.login.call_args[0]
        self.assertNotIn('enc:v1:', password)

    def test_works_with_no_saved_row(self):
        """First-time setup: nothing persisted yet, everything comes from the form."""
        with patch(IMAP_TARGET) as mock_imap:
            resp = self.client.post(IMAP_URL, {
                'imap_host':     'imap.gmail.com',
                'imap_port':     993,
                'imap_username': 'new@example.com',
                'imap_password': 'app-password',
                'imap_use_ssl':  True,
            }, format='json')

        self.assertTrue(resp.data['success'], resp.data['message'])
        mock_imap.assert_called_once()
        self.assertEqual(mock_imap.call_args[0][0], 'imap.gmail.com')
        mock_imap.return_value.login.assert_called_once_with('new@example.com', 'app-password')

    def test_probe_is_never_persisted(self):
        """The probe is an unsaved model instance — it must not create a row."""
        with patch(IMAP_TARGET):
            self.client.post(IMAP_URL, {
                'imap_host': 'imap.gmail.com', 'imap_password': 'pw',
            }, format='json')

        self.assertEqual(TenantEmailSettings.objects.count(), 0)

    def test_plain_mode_uses_unencrypted_class(self):
        with patch(IMAP_PLAIN) as mock_plain, patch(IMAP_TARGET) as mock_ssl:
            self.client.post(IMAP_URL, {
                'imap_host': 'imap.example.com', 'imap_use_ssl': False,
                'imap_username': 'u', 'imap_password': 'p',
            }, format='json')

        mock_plain.assert_called_once()
        mock_ssl.assert_not_called()

    def test_connection_is_closed_on_success(self):
        with patch(IMAP_TARGET) as mock_imap:
            self.client.post(IMAP_URL, {
                'imap_host': 'imap.example.com', 'imap_password': 'p',
            }, format='json')

        mock_imap.return_value.logout.assert_called_once()


@override_settings(DEBUG=True)
class SmtpProbeTest(TestCase):
    def setUp(self):
        self.tenant = _tenant()
        self.user   = _user(self.tenant)
        self.client = _client(self.user)

    def test_saved_password_arrives_decrypted(self):
        _settings(self.tenant)

        with patch(SMTP_TARGET) as mock_smtp:
            resp = self.client.post(SMTP_URL, {'smtp_host': 'smtp.example.com'}, format='json')

        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data['success'], resp.data['message'])
        mock_smtp.return_value.login.assert_called_once_with(
            'helpdesk@example.com', 'smtp-secret',
        )

    def test_starttls_negotiated_in_tls_mode(self):
        with patch(SMTP_TARGET) as mock_smtp, patch(SMTP_SSL_TARGET) as mock_ssl:
            self.client.post(SMTP_URL, {
                'smtp_host': 'smtp.example.com', 'smtp_use_tls': True,
                'smtp_username': 'u', 'smtp_password': 'p',
            }, format='json')

        mock_smtp.return_value.starttls.assert_called_once()
        mock_ssl.assert_not_called()

    def test_implicit_ssl_mode_skips_starttls(self):
        with patch(SMTP_TARGET) as mock_smtp, patch(SMTP_SSL_TARGET) as mock_ssl:
            self.client.post(SMTP_URL, {
                'smtp_host': 'smtp.example.com', 'smtp_use_tls': False, 'smtp_port': 465,
                'smtp_username': 'u', 'smtp_password': 'p',
            }, format='json')

        mock_ssl.assert_called_once()
        mock_smtp.assert_not_called()
        mock_ssl.return_value.starttls.assert_not_called()

    def test_no_mail_is_sent(self):
        """Testing credentials must not deliver anything to anyone."""
        with patch(SMTP_TARGET) as mock_smtp:
            self.client.post(SMTP_URL, {
                'smtp_host': 'smtp.example.com', 'smtp_password': 'p',
            }, format='json')

        mock_smtp.return_value.sendmail.assert_not_called()
        mock_smtp.return_value.quit.assert_called_once()

    def test_auth_failure_reports_cleanly(self):
        with patch(SMTP_TARGET) as mock_smtp:
            mock_smtp.return_value.login.side_effect = smtplib.SMTPAuthenticationError(
                535, b'5.7.8 Username and Password not accepted',
            )
            resp = self.client.post(SMTP_URL, {
                'smtp_host': 'smtp.example.com', 'smtp_password': 'wrong',
            }, format='json')

        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.data['success'])
        self.assertIn('Authentication failed', resp.data['message'])


@override_settings(DEBUG=True)
class BlankHostTest(TestCase):
    """No host means nothing to connect to — fail fast rather than resolve ''."""

    def setUp(self):
        self.tenant = _tenant()
        self.client = _client(_user(self.tenant))

    def test_imap_blank_host_does_not_connect(self):
        with patch(IMAP_TARGET) as mock_imap:
            resp = self.client.post(IMAP_URL, {}, format='json')

        self.assertFalse(resp.data['success'])
        self.assertIn('IMAP host', resp.data['message'])
        mock_imap.assert_not_called()

    def test_smtp_blank_host_does_not_connect(self):
        with patch(SMTP_TARGET) as mock_smtp:
            resp = self.client.post(SMTP_URL, {}, format='json')

        self.assertFalse(resp.data['success'])
        self.assertIn('SMTP host', resp.data['message'])
        mock_smtp.assert_not_called()


@override_settings(DEBUG=True)
class PortCoercionTest(TestCase):
    """A cleared port field posts '' — int('') used to raise straight into a 500."""

    def setUp(self):
        self.tenant = _tenant()
        self.client = _client(_user(self.tenant))

    def _port_used(self, mock_imap):
        return mock_imap.call_args[0][1]

    def test_blank_port_falls_back_to_saved(self):
        _settings(self.tenant, imap_port=1993)

        with patch(IMAP_TARGET) as mock_imap:
            resp = self.client.post(IMAP_URL, {
                'imap_host': 'imap.example.com', 'imap_port': '',
            }, format='json')

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(self._port_used(mock_imap), 1993)

    def test_non_numeric_port_falls_back(self):
        with patch(IMAP_TARGET) as mock_imap:
            resp = self.client.post(IMAP_URL, {
                'imap_host': 'imap.example.com', 'imap_port': 'abc', 'imap_password': 'p',
            }, format='json')

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(self._port_used(mock_imap), 993)

    def test_out_of_range_port_falls_back(self):
        with patch(IMAP_TARGET) as mock_imap:
            self.client.post(IMAP_URL, {
                'imap_host': 'imap.example.com', 'imap_port': 99999, 'imap_password': 'p',
            }, format='json')

        self.assertEqual(self._port_used(mock_imap), 993)

    def test_valid_port_is_honoured(self):
        with patch(IMAP_TARGET) as mock_imap:
            self.client.post(IMAP_URL, {
                'imap_host': 'imap.example.com', 'imap_port': 143, 'imap_password': 'p',
            }, format='json')

        self.assertEqual(self._port_used(mock_imap), 143)


class FriendlyErrorTest(TestCase):
    """Internal exception text must not reach the browser. This is what showed a
    user "'Proxy' object has no attribute 'get_imap_password'"."""

    def test_dns_failure(self):
        msg = _friendly_error(socket.gaierror(-2, 'Name or service not known'), 'IMAP')
        self.assertIn('Server not found', msg)

    def test_refused(self):
        self.assertIn('refused', _friendly_error(ConnectionRefusedError(111, 'refused'), 'IMAP'))

    def test_timeout(self):
        self.assertIn('timed out', _friendly_error(TimeoutError('timed out'), 'IMAP'))

    def test_tls_mismatch(self):
        self.assertIn('TLS', _friendly_error(ssl.SSLError('wrong version number'), 'SMTP'))

    def test_smtp_auth_failure_mentions_app_password(self):
        msg = _friendly_error(
            smtplib.SMTPAuthenticationError(535, b'bad creds'), 'SMTP',
        )
        self.assertIn('Authentication failed', msg)
        self.assertIn('App Password', msg)

    def test_imap_auth_failure_is_recognised(self):
        msg = _friendly_error(
            imaplib.IMAP4.error('[AUTHENTICATIONFAILED] Invalid credentials (Failure)'), 'IMAP',
        )
        self.assertIn('Authentication failed', msg)

    def test_unknown_exception_is_generic(self):
        msg = _friendly_error(AttributeError("'Proxy' object has no attribute 'x'"), 'IMAP')
        self.assertEqual(msg, 'Could not connect — check the settings and try again.')

    def test_raw_exception_text_never_leaks(self):
        secret = 'hunter2-internal-detail'
        for exc in (
            AttributeError(secret),
            RuntimeError(secret),
            imaplib.IMAP4.error(secret),
            smtplib.SMTPException(secret),
            ssl.SSLError(secret),
        ):
            with self.subTest(exc=type(exc).__name__):
                self.assertNotIn(secret, _friendly_error(exc, 'IMAP'))


@override_settings(DEBUG=True)
class ConnectionTestPermissionTest(TestCase):
    def setUp(self):
        self.tenant = _tenant()

    def test_anonymous_is_rejected(self):
        for url in (IMAP_URL, SMTP_URL):
            with self.subTest(url=url):
                self.assertIn(APIClient().post(url, {}, format='json').status_code, (401, 403))

    def test_end_user_is_rejected(self):
        client = _client(_user(self.tenant, role='end_user'))
        for url in (IMAP_URL, SMTP_URL):
            with self.subTest(url=url):
                self.assertEqual(client.post(url, {}, format='json').status_code, 403)

    def test_msp_agent_is_allowed(self):
        client = _client(_user(self.tenant, role='msp_agent'))
        with patch(IMAP_TARGET):
            resp = client.post(IMAP_URL, {
                'imap_host': 'imap.example.com', 'imap_password': 'p',
            }, format='json')
        self.assertEqual(resp.status_code, 200)

    def test_probe_cannot_read_another_tenants_credentials(self):
        """Credentials resolve from the caller's own tenant, never a neighbour's."""
        other = _tenant(slug='other-co')
        _settings(other, imap_username='neighbour@other.com', imap_password='neighbour-secret')
        _settings(self.tenant, imap_username='mine@example.com', imap_password='my-secret')

        client = _client(_user(self.tenant))
        with patch(IMAP_TARGET) as mock_imap:
            client.post(IMAP_URL, {'imap_host': 'imap.example.com'}, format='json')

        username, password = mock_imap.return_value.login.call_args[0]
        self.assertEqual(username, 'mine@example.com')
        self.assertEqual(password, 'my-secret')


@override_settings(DEBUG=True)
class SendReplyStillWorksTest(TestCase):
    """_smtp_connect was extracted out of send_reply_email — the sender must
    still authenticate and deliver through the same path."""

    def test_sender_uses_shared_connect_helper(self):
        from apps.email_ingestion.services import _smtp_connect

        settings = _settings(_tenant())
        with patch(SMTP_TARGET) as mock_smtp:
            server = _smtp_connect(settings)

        mock_smtp.assert_called_once_with('smtp.example.com', 587, timeout=15)
        server.starttls.assert_called_once()
        server.login.assert_called_once_with('helpdesk@example.com', 'smtp-secret')

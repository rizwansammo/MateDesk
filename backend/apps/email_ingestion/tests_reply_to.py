"""
Reply-To handling — deciding who a ticket is really with.

A message can name someone other than its sender via Reply-To, which is what a
monitoring tool or a forwarding mailbox does when it writes on a person's
behalf. The header is set by the sender and authenticated by nothing, so acting
on it is only safe against an allowlist: a KnownSender, or an *active* user in
the tenant. Everything below exists to pin that boundary down, because the
failure mode is not a wrong label — it is delivering every future agent reply,
and whatever it contains, to an address the attacker chose.

Design decisions this file encodes:
  * read at ticket creation only, so an established thread cannot be redirected
  * the accepted address drives the requester AND the org, so the two agree
  * extra trusted addresses are CC'd; untrusted ones are recorded, never emailed
"""
from email import message_from_string
from unittest.mock import patch

from django.test import TestCase

from apps.tenants.models import Tenant, ClientOrganization
from apps.users.models import User
from apps.tickets.models import Ticket, Reply
from apps.email_ingestion.models import KnownSender, ProcessedEmail
from apps.email_ingestion.services import _process_email, _trusted_reply_to


def _tenant(slug='rt-co'):
    return Tenant.objects.create(name='RT Co', slug=slug, is_active=True)


def _msg(*, frm='alerts@monitoring.io', reply_to=None, subject='Disk full',
         message_id='<m1@monitoring.io>', cc=None, in_reply_to=None,
         body='It is broken.'):
    headers = [f'From: {frm}', f'Subject: {subject}', f'Message-ID: {message_id}']
    if reply_to:
        headers.append(f'Reply-To: {reply_to}')
    if cc:
        headers.append(f'Cc: {cc}')
    if in_reply_to:
        headers.append(f'In-Reply-To: {in_reply_to}')
    return message_from_string('\n'.join(headers) + f'\n\n{body}\n')


class TrustedReplyToTest(TestCase):
    """The allowlist itself."""

    def setUp(self):
        self.tenant = _tenant()
        self.org = ClientOrganization.objects.create(
            tenant=self.tenant, name='Acme', domain='acme.com', is_active=True)

    def _user(self, email, active=True, tenant=None):
        return User.objects.create_user(
            email=email, password='x', tenant=tenant or self.tenant,
            first_name='J', last_name='D', role='end_user',
            client_org=self.org, is_active=active)

    def test_active_user_is_trusted(self):
        self._user('john@acme.com')
        self.assertEqual(
            _trusted_reply_to(self.tenant, 'john@acme.com'), ['john@acme.com'])

    def test_known_sender_is_trusted(self):
        KnownSender.objects.create(
            tenant=self.tenant, client_org=self.org, email='ops@vendor.io')
        self.assertEqual(
            _trusted_reply_to(self.tenant, 'ops@vendor.io'), ['ops@vendor.io'])

    def test_stranger_is_not_trusted(self):
        self.assertEqual(_trusted_reply_to(self.tenant, 'nobody@evil.com'), [])

    def test_inactive_user_is_not_trusted(self):
        """Filing under a departed user's org is harmless; delivering mail to a
        disabled account is not."""
        self._user('gone@acme.com', active=False)
        self.assertEqual(_trusted_reply_to(self.tenant, 'gone@acme.com'), [])

    def test_known_sender_on_an_inactive_org_is_not_trusted(self):
        dead = ClientOrganization.objects.create(
            tenant=self.tenant, name='Dead', is_active=False)
        KnownSender.objects.create(
            tenant=self.tenant, client_org=dead, email='ops@dead.io')
        self.assertEqual(_trusted_reply_to(self.tenant, 'ops@dead.io'), [])

    def test_another_tenants_user_is_not_trusted(self):
        other = _tenant('other-co')
        self._user('neighbour@other.com', tenant=other)
        self.assertEqual(_trusted_reply_to(self.tenant, 'neighbour@other.com'), [])

    def test_match_is_case_insensitive(self):
        """create_user normalises only the domain half, so the local part keeps
        whatever case it was given."""
        self._user('Bob@acme.com')
        self.assertEqual(
            _trusted_reply_to(self.tenant, 'BOB@ACME.COM'), ['bob@acme.com'])

    def test_untrusted_entries_are_filtered_out_of_a_list(self):
        self._user('john@acme.com')
        self.assertEqual(
            _trusted_reply_to(self.tenant, 'john@acme.com, attacker@evil.com'),
            ['john@acme.com'],
        )

    def test_order_is_preserved(self):
        self._user('a@acme.com')
        self._user('b@acme.com')
        self.assertEqual(
            _trusted_reply_to(self.tenant, 'b@acme.com, a@acme.com'),
            ['b@acme.com', 'a@acme.com'],
        )

    def test_duplicates_collapse(self):
        self._user('john@acme.com')
        self.assertEqual(
            _trusted_reply_to(self.tenant, 'john@acme.com, John@Acme.com'),
            ['john@acme.com'],
        )

    def test_display_name_form_is_parsed(self):
        self._user('john@acme.com')
        self.assertEqual(
            _trusted_reply_to(self.tenant, 'John Doe <john@acme.com>'), ['john@acme.com'])

    def test_blank_and_malformed_headers_are_safe(self):
        for raw in ('', None, 'not an address', '<>', '   '):
            with self.subTest(raw=raw):
                self.assertEqual(_trusted_reply_to(self.tenant, raw), [])


class ReplyToTicketCreationTest(TestCase):
    def setUp(self):
        self.tenant = _tenant()
        self.acme = ClientOrganization.objects.create(
            tenant=self.tenant, name='Acme', domain='acme.com', is_active=True)
        self.john = User.objects.create_user(
            email='john@acme.com', password='x', tenant=self.tenant,
            first_name='John', last_name='Doe', role='end_user', client_org=self.acme)

    def _ingest(self, **kw):
        _process_email(self.tenant, _msg(**kw))
        return Ticket.objects.get(tenant=self.tenant)

    def test_trusted_reply_to_becomes_the_requester(self):
        ticket = self._ingest(reply_to='john@acme.com')
        self.assertEqual(ticket.requester, self.john)

    def test_org_follows_the_reply_to_person(self):
        """The whole point of decision 2 — requester and organization agree."""
        ticket = self._ingest(reply_to='john@acme.com')
        self.assertEqual(ticket.client_org, self.acme)

    def test_sender_is_added_to_cc(self):
        self._ingest(reply_to='john@acme.com')
        source = ProcessedEmail.objects.get(tenant=self.tenant)
        self.assertIn('alerts@monitoring.io', source.cc_emails)

    def test_extra_trusted_addresses_are_cc_not_requester(self):
        User.objects.create_user(
            email='jane@acme.com', password='x', tenant=self.tenant,
            first_name='Jane', last_name='R', role='end_user', client_org=self.acme)

        ticket = self._ingest(reply_to='john@acme.com, jane@acme.com')
        source = ProcessedEmail.objects.get(tenant=self.tenant)

        self.assertEqual(ticket.requester, self.john)
        self.assertIn('jane@acme.com', source.cc_emails)

    def test_untrusted_address_never_reaches_cc(self):
        """The exfiltration case: CC delivers mail just as surely as To."""
        self._ingest(reply_to='john@acme.com, attacker@evil.com')
        source = ProcessedEmail.objects.get(tenant=self.tenant)
        self.assertNotIn('attacker@evil.com', source.cc_emails)

    def test_untrusted_reply_to_is_ignored_entirely(self):
        """Falls back to today's behaviour — sender is requester, org unchanged."""
        ticket = self._ingest(reply_to='attacker@evil.com')

        self.assertEqual(ticket.client_org.name, 'Walk-In')
        self.assertEqual(ticket.requester_name, 'alerts@monitoring.io')
        source = ProcessedEmail.objects.get(tenant=self.tenant)
        self.assertEqual(source.reply_to_email, '')

    def test_no_reply_to_header_behaves_as_before(self):
        ticket = self._ingest()
        self.assertEqual(ticket.client_org.name, 'Walk-In')
        source = ProcessedEmail.objects.get(tenant=self.tenant)
        self.assertEqual(source.reply_to_email, '')

    def test_accepted_address_is_recorded(self):
        self._ingest(reply_to='john@acme.com')
        source = ProcessedEmail.objects.get(tenant=self.tenant)
        self.assertEqual(source.reply_to_email, 'john@acme.com')

    def test_raw_header_is_kept_even_when_rejected(self):
        """Provenance survives so a rejected address is diagnosable, not lost."""
        self._ingest(reply_to='attacker@evil.com')
        source = ProcessedEmail.objects.get(tenant=self.tenant)
        self.assertEqual(source.reply_to_raw, 'attacker@evil.com')
        self.assertEqual(source.reply_to_email, '')

    def test_sender_is_still_recorded_as_from(self):
        self._ingest(reply_to='john@acme.com')
        source = ProcessedEmail.objects.get(tenant=self.tenant)
        self.assertEqual(source.from_email, 'alerts@monitoring.io')

    def test_system_event_names_both_parties(self):
        self._ingest(reply_to='john@acme.com')
        event = Reply.objects.get(ticket__tenant=self.tenant, type='system_event')
        self.assertIn('alerts@monitoring.io', event.body)
        self.assertIn('john@acme.com', event.body)

    def test_system_event_is_unchanged_without_a_trusted_reply_to(self):
        self._ingest()
        event = Reply.objects.get(ticket__tenant=self.tenant, type='system_event')
        self.assertNotIn('Reply-To', event.body)

    def test_requester_name_comes_from_the_user_record(self):
        """Not from the sending system's display name."""
        ticket = self._ingest(frm='Monitoring Bot <alerts@monitoring.io>',
                              reply_to='john@acme.com')
        self.assertEqual(ticket.requester_name, 'John Doe')

    def test_existing_cc_header_is_preserved(self):
        self._ingest(reply_to='john@acme.com', cc='watcher@acme.com')
        source = ProcessedEmail.objects.get(tenant=self.tenant)
        self.assertIn('watcher@acme.com', source.cc_emails)

    def test_cc_list_has_no_duplicates(self):
        """Sender already in Cc must not appear twice."""
        self._ingest(reply_to='john@acme.com', cc='alerts@monitoring.io')
        source = ProcessedEmail.objects.get(tenant=self.tenant)
        self.assertEqual(
            [a for a in source.cc_emails if a.lower() == 'alerts@monitoring.io'],
            ['alerts@monitoring.io'],
        )


class ReplyToIsCreationOnlyTest(TestCase):
    """Decision 1 — an established thread cannot be redirected."""

    def setUp(self):
        self.tenant = _tenant()
        self.acme = ClientOrganization.objects.create(
            tenant=self.tenant, name='Acme', domain='acme.com', is_active=True)
        self.john = User.objects.create_user(
            email='john@acme.com', password='x', tenant=self.tenant,
            first_name='John', last_name='D', role='end_user', client_org=self.acme)
        self.eve = User.objects.create_user(
            email='eve@acme.com', password='x', tenant=self.tenant,
            first_name='Eve', last_name='M', role='end_user', client_org=self.acme)

    def test_follow_up_cannot_change_the_requester(self):
        _process_email(self.tenant, _msg(reply_to='john@acme.com'))
        ticket = Ticket.objects.get(tenant=self.tenant)

        _process_email(self.tenant, _msg(
            subject=f'Re: [{ticket.ticket_ref}] Disk full',
            message_id='<m2@monitoring.io>',
            reply_to='eve@acme.com',
        ))

        ticket.refresh_from_db()
        self.assertEqual(ticket.requester, self.john)

    def test_follow_up_cannot_change_where_replies_go(self):
        _process_email(self.tenant, _msg(reply_to='john@acme.com'))
        ticket = Ticket.objects.get(tenant=self.tenant)

        _process_email(self.tenant, _msg(
            subject=f'Re: [{ticket.ticket_ref}] Disk full',
            message_id='<m2@monitoring.io>',
            reply_to='eve@acme.com',
        ))

        first = ticket.source_emails.order_by('processed_at').first()
        self.assertEqual(first.reply_to_email, 'john@acme.com')

    def test_follow_up_does_not_create_a_second_ticket(self):
        _process_email(self.tenant, _msg(reply_to='john@acme.com'))
        ticket = Ticket.objects.get(tenant=self.tenant)
        _process_email(self.tenant, _msg(
            subject=f'Re: [{ticket.ticket_ref}] Disk full',
            message_id='<m2@monitoring.io>',
            reply_to='eve@acme.com',
        ))
        self.assertEqual(Ticket.objects.filter(tenant=self.tenant).count(), 1)


class ReplyToOutboundTest(TestCase):
    """Where an agent's reply actually goes."""

    def setUp(self):
        self.tenant = _tenant()
        self.acme = ClientOrganization.objects.create(
            tenant=self.tenant, name='Acme', domain='acme.com', is_active=True)
        User.objects.create_user(
            email='john@acme.com', password='x', tenant=self.tenant,
            first_name='John', last_name='D', role='end_user', client_org=self.acme)
        from apps.email_ingestion.models import TenantEmailSettings
        TenantEmailSettings.objects.create(
            tenant=self.tenant, smtp_enabled=True, smtp_host='smtp.example.com',
            smtp_port=587, smtp_username='u', smtp_password='p',
            smtp_use_tls=True, smtp_from_email='support@example.com',
        )

    def _agent_reply(self):
        from apps.email_ingestion.services import send_reply_email
        ticket = Ticket.objects.get(tenant=self.tenant)
        agent = User.objects.create_user(
            email='agent@rt-co.test', password='x', tenant=self.tenant,
            first_name='A', last_name='G', role='msp_agent')
        reply = Reply.objects.create(
            ticket=ticket, author=agent, type='public_reply', body='On it.')
        with patch('apps.email_ingestion.services.smtplib.SMTP') as mock_smtp:
            send_reply_email(reply)
        return mock_smtp.return_value.sendmail.call_args

    def test_reply_goes_to_the_trusted_reply_to_address(self):
        _process_email(self.tenant, _msg(reply_to='john@acme.com'))

        _, recipients, _ = self._agent_reply()[0]
        self.assertIn('john@acme.com', recipients)

    def test_reply_does_not_go_to_the_sending_system(self):
        """The noreply address is exactly what this feature exists to avoid."""
        _process_email(self.tenant, _msg(
            frm='noreply@monitoring.io', reply_to='john@acme.com'))

        _, recipients, _ = self._agent_reply()[0]
        self.assertNotIn('noreply@monitoring.io', recipients)

    def test_reply_falls_back_to_the_sender_without_a_trusted_reply_to(self):
        _process_email(self.tenant, _msg(frm='bob@acme.com'))

        _, recipients, _ = self._agent_reply()[0]
        self.assertIn('bob@acme.com', recipients)

    def test_untrusted_reply_to_never_receives_mail(self):
        _process_email(self.tenant, _msg(
            frm='bob@acme.com', reply_to='attacker@evil.com'))

        _, recipients, _ = self._agent_reply()[0]
        self.assertNotIn('attacker@evil.com', recipients)
        self.assertIn('bob@acme.com', recipients)

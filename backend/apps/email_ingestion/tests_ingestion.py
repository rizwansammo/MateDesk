"""
Email-to-ticket ingestion: threading, deduplication, org resolution, requester
creation and header parsing.

IMAP is never touched. `_process_email` takes a parsed email.Message, so the
whole pipeline below the network layer is exercised by constructing messages
from strings — which is where the logic that can silently mis-thread lives.

Two tests document limitations rather than defects, and are named accordingly.
"""
from email import message_from_string

from django.test import TestCase

from apps.tenants.models import Tenant, ClientOrganization
from apps.users.models import User
from apps.tickets.models import Ticket, Reply
from apps.email_ingestion.models import KnownSender, ProcessedEmail
from apps.email_ingestion.services import (
    _process_email, _find_existing_ticket, _resolve_client_org,
    _find_or_create_requester, _parse_from, _decode_header_str,
    _strip_re_fwd, _get_body,
)


def _tenant(slug='mail-co'):
    return Tenant.objects.create(name='Mail Co', slug=slug, is_active=True)


def _msg(*, subject='Printer broken', frm='alice@acme.com',
         message_id='<m1@acme.com>', in_reply_to=None, body='It is broken.',
         cc=None):
    headers = [
        f'From: {frm}',
        f'Subject: {subject}',
        f'Message-ID: {message_id}',
    ]
    if in_reply_to:
        headers.append(f'In-Reply-To: {in_reply_to}')
    if cc:
        headers.append(f'Cc: {cc}')
    raw = '\n'.join(headers) + f'\n\n{body}\n'
    return message_from_string(raw)


class HeaderParsingTest(TestCase):
    def test_parses_name_and_address(self):
        self.assertEqual(_parse_from('Alice Smith <alice@acme.com>'),
                         ('Alice Smith', 'alice@acme.com'))

    def test_address_is_lowercased(self):
        # Downstream lookups use exact match on the stored value, so the address
        # must be normalised here.
        self.assertEqual(_parse_from('<Alice@ACME.com>')[1], 'alice@acme.com')

    def test_bare_address_has_no_name(self):
        self.assertEqual(_parse_from('alice@acme.com'), ('', 'alice@acme.com'))

    def test_decodes_rfc2047_encoded_name(self):
        # =?utf-8?q?Jos=C3=A9?= is "José"
        name, addr = _parse_from('=?utf-8?q?Jos=C3=A9?= <jose@acme.com>')
        self.assertEqual(name, 'José')
        self.assertEqual(addr, 'jose@acme.com')

    def test_decodes_encoded_subject(self):
        self.assertEqual(_decode_header_str('=?utf-8?q?Caf=C3=A9?='), 'Café')

    def test_empty_header_is_empty_string(self):
        self.assertEqual(_decode_header_str(''), '')
        self.assertEqual(_decode_header_str(None), '')

    def test_malformed_from_degrades_instead_of_raising(self):
        # parseaddr takes the first token as the address, so garbage in gives a
        # nonsense address rather than an exception. That value contains no '@',
        # so it matches no user and no domain and the mail lands in Walk-In —
        # acceptable degradation. The point of this test is that it does not raise.
        name, addr = _parse_from('not an address at all')
        self.assertEqual(name, '')
        self.assertNotIn('@', addr)


class SubjectNormalisationTest(TestCase):
    def test_strips_reply_prefix(self):
        self.assertEqual(_strip_re_fwd('Re: Printer broken'), 'Printer broken')

    def test_strips_forward_prefix(self):
        self.assertEqual(_strip_re_fwd('Fwd: Printer broken'), 'Printer broken')
        self.assertEqual(_strip_re_fwd('FW: Printer broken'), 'Printer broken')

    def test_prefix_match_is_case_insensitive(self):
        self.assertEqual(_strip_re_fwd('RE: Printer broken'), 'Printer broken')

    def test_strips_the_ticket_reference(self):
        self.assertEqual(_strip_re_fwd('[T15052026-0001] Printer broken'),
                         'Printer broken')

    def test_strips_prefix_and_reference_together(self):
        self.assertEqual(_strip_re_fwd('Re: [T15052026-0001] Printer broken'),
                         'Printer broken')

    def test_LIMITATION_only_one_prefix_is_stripped(self):
        """Nested prefixes survive.

        The regex is anchored with ^ and applied once, so a thread that has been
        replied to and forwarded keeps the inner prefixes in the ticket subject.
        Cosmetic only — threading does not depend on the subject text, just on the
        embedded reference — but worth recording since long threads are common.
        """
        self.assertEqual(_strip_re_fwd('Re: Re: Printer broken'),
                         'Re: Printer broken')
        self.assertEqual(_strip_re_fwd('Re: Fwd: Printer broken'),
                         'Fwd: Printer broken')

    def test_empty_subject_is_empty(self):
        self.assertEqual(_strip_re_fwd(''), '')
        self.assertEqual(_strip_re_fwd(None), '')


class OrgResolutionTest(TestCase):
    def setUp(self):
        self.tenant = _tenant()

    def test_domain_match_wins_over_walk_in(self):
        org = ClientOrganization.objects.create(
            tenant=self.tenant, name='Acme', domain='acme.com', is_active=True)
        self.assertEqual(_resolve_client_org(self.tenant, 'bob@acme.com'), org)

    def test_domain_match_is_case_insensitive(self):
        org = ClientOrganization.objects.create(
            tenant=self.tenant, name='Acme', domain='Acme.COM', is_active=True)
        self.assertEqual(_resolve_client_org(self.tenant, 'bob@acme.com'), org)

    def test_inactive_org_is_not_matched_by_domain(self):
        ClientOrganization.objects.create(
            tenant=self.tenant, name='Acme', domain='acme.com', is_active=False)
        self.assertEqual(_resolve_client_org(self.tenant, 'bob@acme.com').name, 'Walk-In')

    def test_known_sender_outranks_domain(self):
        ClientOrganization.objects.create(
            tenant=self.tenant, name='Acme', domain='acme.com', is_active=True)
        special = ClientOrganization.objects.create(
            tenant=self.tenant, name='Special', is_active=True)
        KnownSender.objects.create(
            tenant=self.tenant, client_org=special, email='bob@acme.com')
        self.assertEqual(_resolve_client_org(self.tenant, 'bob@acme.com'), special)

    def test_known_sender_pointing_at_an_inactive_org_falls_through(self):
        domain_org = ClientOrganization.objects.create(
            tenant=self.tenant, name='Acme', domain='acme.com', is_active=True)
        dead = ClientOrganization.objects.create(
            tenant=self.tenant, name='Dead', is_active=False)
        KnownSender.objects.create(
            tenant=self.tenant, client_org=dead, email='bob@acme.com')
        self.assertEqual(_resolve_client_org(self.tenant, 'bob@acme.com'), domain_org)

    def test_unknown_sender_gets_walk_in(self):
        self.assertEqual(_resolve_client_org(self.tenant, 'nobody@random.io').name, 'Walk-In')

    def test_walk_in_is_created_once_and_reused(self):
        a = _resolve_client_org(self.tenant, 'x@a.io')
        b = _resolve_client_org(self.tenant, 'y@b.io')
        self.assertEqual(a.pk, b.pk)
        self.assertEqual(
            ClientOrganization.objects.filter(tenant=self.tenant, name='Walk-In').count(), 1)

    def test_org_resolution_is_tenant_scoped(self):
        other = _tenant('other-co')
        ClientOrganization.objects.create(
            tenant=other, name='Acme', domain='acme.com', is_active=True)
        self.assertEqual(_resolve_client_org(self.tenant, 'bob@acme.com').name, 'Walk-In')

    def test_missing_address_gets_walk_in(self):
        self.assertEqual(_resolve_client_org(self.tenant, '').name, 'Walk-In')


class UserOrgResolutionTest(TestCase):
    """An address belonging to an existing user routes to that user's org.

    Origin: a user added to an org on a free mail provider (gmail.com) had every
    email land in Walk-In, because routing only consulted KnownSender and the
    org's domain — never the user list the address was already in.
    """

    def setUp(self):
        self.tenant = _tenant()
        self.org = ClientOrganization.objects.create(
            tenant=self.tenant, name='NetaMate', domain='netamate.com', is_active=True)

    def _user(self, email, org, tenant=None, role='end_user'):
        return User.objects.create_user(
            email=email, password='x', tenant=tenant or self.tenant,
            first_name='Ai', last_name='Assist', role=role, client_org=org)

    def test_user_on_a_free_mail_provider_routes_to_their_org(self):
        """The reported case — gmail.com can never domain-match."""
        self._user('aiassist.netamate@gmail.com', self.org)
        self.assertEqual(
            _resolve_client_org(self.tenant, 'aiassist.netamate@gmail.com'), self.org)

    def test_user_lookup_is_case_insensitive(self):
        self._user('bob@gmail.com', self.org)
        self.assertEqual(_resolve_client_org(self.tenant, 'BOB@GMAIL.COM'), self.org)

    def test_known_sender_still_outranks_the_user_org(self):
        """KnownSender stays the explicit override."""
        self._user('bob@gmail.com', self.org)
        special = ClientOrganization.objects.create(
            tenant=self.tenant, name='Special', is_active=True)
        KnownSender.objects.create(
            tenant=self.tenant, client_org=special, email='bob@gmail.com')
        self.assertEqual(_resolve_client_org(self.tenant, 'bob@gmail.com'), special)

    def test_user_org_outranks_domain_match(self):
        """An explicit assignment beats a domain pattern."""
        ClientOrganization.objects.create(
            tenant=self.tenant, name='Acme', domain='acme.com', is_active=True)
        self._user('contractor@acme.com', self.org)
        self.assertEqual(
            _resolve_client_org(self.tenant, 'contractor@acme.com'), self.org)

    def test_user_parked_in_walk_in_falls_through_to_domain(self):
        """Walk-In is the fallback bucket, not a real assignment."""
        walkin = ClientOrganization.objects.create(
            tenant=self.tenant, name='Walk-In', is_active=True)
        acme = ClientOrganization.objects.create(
            tenant=self.tenant, name='Acme', domain='acme.com', is_active=True)
        self._user('bob@acme.com', walkin)
        self.assertEqual(_resolve_client_org(self.tenant, 'bob@acme.com'), acme)

    def test_user_with_no_org_falls_through(self):
        """MSP staff carry no client_org."""
        self._user('agent@gmail.com', None, role='msp_agent')
        self.assertEqual(_resolve_client_org(self.tenant, 'agent@gmail.com').name, 'Walk-In')

    def test_user_with_an_inactive_org_falls_through(self):
        dead = ClientOrganization.objects.create(
            tenant=self.tenant, name='Dead', is_active=False)
        self._user('bob@gmail.com', dead)
        self.assertEqual(_resolve_client_org(self.tenant, 'bob@gmail.com').name, 'Walk-In')

    def test_user_lookup_is_tenant_scoped(self):
        """A neighbour's user with the same address must not pull mail into their org."""
        other = _tenant('other-co')
        other_org = ClientOrganization.objects.create(
            tenant=other, name='Other', is_active=True)
        self._user('shared@gmail.com', other_org, tenant=other)
        self.assertEqual(
            _resolve_client_org(self.tenant, 'shared@gmail.com').name, 'Walk-In')

    def test_ticket_from_a_user_lands_in_their_org(self):
        """End to end — this is what the Walk-In tickets should have done."""
        self._user('aiassist.netamate@gmail.com', self.org)
        _process_email(self.tenant, _msg(frm='NetaMate AI <aiassist.netamate@gmail.com>'))

        ticket = Ticket.objects.get(tenant=self.tenant)
        self.assertEqual(ticket.client_org, self.org)
        self.assertEqual(ticket.requester.email, 'aiassist.netamate@gmail.com')


class RequesterResolutionTest(TestCase):
    def setUp(self):
        self.tenant = _tenant()
        self.org = ClientOrganization.objects.create(
            tenant=self.tenant, name='Acme', domain='acme.com', is_active=True)

    def test_existing_user_is_reused(self):
        u = User.objects.create_user(
            email='bob@acme.com', password='x', tenant=self.tenant,
            first_name='Bob', last_name='B', role='end_user')
        self.assertEqual(
            _find_or_create_requester(self.tenant, 'bob@acme.com', 'Bob', self.org), u)

    def test_existing_user_match_is_case_insensitive(self):
        u = User.objects.create_user(
            email='bob@acme.com', password='x', tenant=self.tenant,
            first_name='Bob', last_name='B', role='end_user')
        self.assertEqual(
            _find_or_create_requester(self.tenant, 'BOB@ACME.COM', 'Bob', self.org), u)

    def test_creates_an_end_user_for_a_known_org(self):
        u = _find_or_create_requester(self.tenant, 'new@acme.com', 'New Person', self.org)
        self.assertIsNotNone(u)
        self.assertEqual(u.role, 'end_user')
        self.assertEqual(u.client_org, self.org)
        self.assertEqual((u.first_name, u.last_name), ('New', 'Person'))

    def test_single_word_name_leaves_last_name_blank(self):
        u = _find_or_create_requester(self.tenant, 'new@acme.com', 'Cher', self.org)
        self.assertEqual((u.first_name, u.last_name), ('Cher', ''))

    def test_missing_name_falls_back_to_the_local_part(self):
        u = _find_or_create_requester(self.tenant, 'jdoe@acme.com', '', self.org)
        self.assertEqual(u.first_name, 'jdoe')

    def test_walk_in_senders_are_not_auto_created(self):
        # Deliberate: unknown senders must not populate the user directory.
        walkin = ClientOrganization.objects.create(
            tenant=self.tenant, name='Walk-In', is_active=True)
        self.assertIsNone(
            _find_or_create_requester(self.tenant, 'stranger@nope.io', 'S', walkin))

    def test_no_org_means_no_user(self):
        self.assertIsNone(
            _find_or_create_requester(self.tenant, 'stranger@nope.io', 'S', None))

    def test_no_address_means_no_user(self):
        self.assertIsNone(_find_or_create_requester(self.tenant, '', 'S', self.org))


class ThreadingTest(TestCase):
    def setUp(self):
        self.tenant = _tenant()
        self.org = ClientOrganization.objects.create(
            tenant=self.tenant, name='Acme', domain='acme.com', is_active=True)

    def test_reference_in_subject_matches_the_ticket(self):
        t = Ticket.objects.create(
            tenant=self.tenant, ticket_ref='T15052026-0001', seq=1,
            subject='Printer broken', requester_name='Bob')
        found = _find_existing_ticket(
            self.tenant, 'Re: [T15052026-0001] Printer broken', None)
        self.assertEqual(found, t)

    def test_reference_for_an_unknown_ticket_does_not_match(self):
        self.assertIsNone(
            _find_existing_ticket(self.tenant, 'Re: [T15052026-9999] Nope', None))

    def test_reference_is_tenant_scoped(self):
        other = _tenant('other-co')
        Ticket.objects.create(
            tenant=other, ticket_ref='T15052026-0001', seq=1,
            subject='Theirs', requester_name='X')
        self.assertIsNone(
            _find_existing_ticket(self.tenant, '[T15052026-0001] Theirs', None))

    def test_in_reply_to_matches_a_previously_processed_email(self):
        t = Ticket.objects.create(
            tenant=self.tenant, ticket_ref='T15052026-0002', seq=2,
            subject='Printer broken', requester_name='Bob')
        ProcessedEmail.objects.create(
            tenant=self.tenant, message_id='<orig@acme.com>', ticket=t,
            from_email='bob@acme.com', subject='Printer broken')
        self.assertEqual(
            _find_existing_ticket(self.tenant, 'Re: Printer broken', '<orig@acme.com>'), t)

    def test_no_reference_and_no_in_reply_to_means_no_match(self):
        Ticket.objects.create(
            tenant=self.tenant, ticket_ref='T15052026-0003', seq=3,
            subject='Printer broken', requester_name='Bob')
        self.assertIsNone(
            _find_existing_ticket(self.tenant, 'Re: Printer broken', None))

    def test_LIMITATION_subject_text_alone_never_threads(self):
        """Threading requires the embedded reference or a matching In-Reply-To.

        A customer composing a fresh mail with the same subject — or a client that
        strips both headers — opens a second ticket rather than appending. There is
        deliberately no subject-similarity matching, which avoids merging unrelated
        conversations that happen to share a subject. Recorded so the tradeoff is
        visible rather than discovered in support.
        """
        Ticket.objects.create(
            tenant=self.tenant, ticket_ref='T15052026-0004', seq=4,
            subject='Printer broken', requester_name='Bob')
        self.assertIsNone(_find_existing_ticket(self.tenant, 'Printer broken', None))


class ProcessEmailTest(TestCase):
    """End-to-end below the IMAP layer."""

    def setUp(self):
        self.tenant = _tenant()
        self.org = ClientOrganization.objects.create(
            tenant=self.tenant, name='Acme', domain='acme.com', is_active=True)

    def test_new_email_creates_a_ticket(self):
        _process_email(self.tenant, _msg())
        t = Ticket.objects.get(tenant=self.tenant)
        self.assertEqual(t.subject, 'Printer broken')
        self.assertEqual(t.status, 'open')
        self.assertEqual(t.priority, 'normal')
        self.assertEqual(t.client_org, self.org)

    def test_ticket_records_the_source_email(self):
        _process_email(self.tenant, _msg())
        pe = ProcessedEmail.objects.get(tenant=self.tenant)
        self.assertEqual(pe.from_email, 'alice@acme.com')
        self.assertEqual(pe.ticket, Ticket.objects.get())

    def test_creation_adds_a_system_event_reply(self):
        _process_email(self.tenant, _msg())
        r = Reply.objects.get(ticket=Ticket.objects.get())
        self.assertEqual(r.type, 'system_event')
        self.assertIsNone(r.author)

    def test_the_same_message_id_is_processed_once(self):
        _process_email(self.tenant, _msg(message_id='<dup@acme.com>'))
        _process_email(self.tenant, _msg(message_id='<dup@acme.com>'))
        self.assertEqual(Ticket.objects.count(), 1)
        self.assertEqual(ProcessedEmail.objects.count(), 1)

    def test_an_email_without_a_message_id_is_dropped(self):
        # Deliberate: without Message-ID there is no dedup key, so re-polling the
        # mailbox would create a duplicate ticket every cycle.
        msg = message_from_string('From: a@acme.com\nSubject: No id\n\nBody\n')
        _process_email(self.tenant, msg)
        self.assertEqual(Ticket.objects.count(), 0)

    def test_reply_with_a_reference_appends_instead_of_creating(self):
        _process_email(self.tenant, _msg(message_id='<first@acme.com>'))
        ticket = Ticket.objects.get()
        _process_email(self.tenant, _msg(
            subject=f'Re: [{ticket.ticket_ref}] Printer broken',
            message_id='<second@acme.com>',
            body='Still broken.',
        ))
        self.assertEqual(Ticket.objects.count(), 1)
        self.assertTrue(
            Reply.objects.filter(ticket=ticket, type='public_reply').exists())

    def test_reply_is_attributed_to_a_matching_user(self):
        user = User.objects.create_user(
            email='alice@acme.com', password='x', tenant=self.tenant,
            first_name='Alice', last_name='A', role='end_user', client_org=self.org)
        _process_email(self.tenant, _msg(message_id='<first@acme.com>'))
        ticket = Ticket.objects.get()
        _process_email(self.tenant, _msg(
            subject=f'Re: [{ticket.ticket_ref}] Printer broken',
            message_id='<second@acme.com>'))
        reply = Reply.objects.get(ticket=ticket, type='public_reply')
        self.assertEqual(reply.author, user)

    def test_reply_from_an_unknown_address_has_no_author(self):
        _process_email(self.tenant, _msg(message_id='<first@acme.com>'))
        ticket = Ticket.objects.get()
        _process_email(self.tenant, _msg(
            frm='stranger@elsewhere.io',
            subject=f'Re: [{ticket.ticket_ref}] Printer broken',
            message_id='<second@acme.com>'))
        reply = Reply.objects.get(ticket=ticket, type='public_reply')
        self.assertIsNone(reply.author)

    def test_cc_addresses_are_captured(self):
        _process_email(self.tenant, _msg(cc='cc1@acme.com, cc2@other.io'))
        pe = ProcessedEmail.objects.get()
        self.assertEqual(sorted(pe.cc_emails), ['cc1@acme.com', 'cc2@other.io'])

    def test_empty_subject_becomes_a_placeholder(self):
        _process_email(self.tenant, _msg(subject=''))
        self.assertEqual(Ticket.objects.get().subject, '(No subject)')

    def test_walk_in_sender_creates_a_ticket_with_no_requester(self):
        _process_email(self.tenant, _msg(frm='stranger@nowhere.io'))
        t = Ticket.objects.get()
        self.assertEqual(t.client_org.name, 'Walk-In')
        self.assertIsNone(t.requester)
        self.assertEqual(t.requester_name, 'stranger@nowhere.io')

    def test_known_domain_sender_gets_an_auto_created_requester(self):
        _process_email(self.tenant, _msg(frm='Bob Jones <bob@acme.com>'))
        t = Ticket.objects.get()
        self.assertIsNotNone(t.requester)
        self.assertEqual(t.requester.email, 'bob@acme.com')
        self.assertEqual(t.requester.role, 'end_user')

    def test_ticket_reference_format(self):
        _process_email(self.tenant, _msg())
        self.assertRegex(Ticket.objects.get().ticket_ref, r'^T\d{8}-\d{4}$')

    def test_body_is_extracted(self):
        _process_email(self.tenant, _msg(body='The printer is on fire.'))
        self.assertIn('printer is on fire', Ticket.objects.get().description.lower())


class BodyExtractionTest(TestCase):
    def test_plain_text_body(self):
        self.assertEqual(_get_body(_msg(body='Hello there')), 'Hello there')

    def test_multipart_prefers_text_plain(self):
        raw = (
            'From: a@acme.com\nSubject: S\nMessage-ID: <x@a>\n'
            'Content-Type: multipart/alternative; boundary="B"\n\n'
            '--B\nContent-Type: text/plain\n\nPlain version\n'
            '--B\nContent-Type: text/html\n\n<p>HTML version</p>\n'
            '--B--\n'
        )
        self.assertIn('Plain version', _get_body(message_from_string(raw)))

    def test_empty_body_is_empty_string(self):
        raw = 'From: a@acme.com\nSubject: S\nMessage-ID: <x@a>\n\n'
        self.assertEqual(_get_body(message_from_string(raw)), '')

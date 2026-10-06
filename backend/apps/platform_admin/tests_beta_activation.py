from urllib.parse import parse_qs, urlparse

from django.test import Client, TestCase, override_settings

from apps.platform_admin.beta_activation import (
    build_activation_url,
    provision_beta_application,
)
from apps.platform_admin.models import AdminActionLog, BetaApplication
from apps.users.models import User


@override_settings(
    DEPLOYMENT_MODE='multi_tenant',
    PUBLIC_REGISTRATION_ENABLED=True,
    PLATFORM_ADMIN_ENABLED=True,
    NON_TENANT_HOSTS={'matedesk.pro'},
    ALLOWED_HOSTS=['matedesk.pro', '.matedesk.pro', 'testserver'],
)
class PrivateBetaActivationApiTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.application = BetaApplication.objects.create(
            company_name='Acme Managed Services',
            owner_name='John Smith',
            email='john@acmemsp.com',
            requested_slug='acme-msp',
            status=BetaApplication.STATUS_APPROVED,
        )
        self.tenant, self.owner = provision_beta_application(self.application)
        self.application.refresh_from_db()

        activation_url = build_activation_url(
            self.application,
            'https://matedesk.pro',
        )
        query = parse_qs(urlparse(activation_url).query)
        self.uid = query['uid'][0]
        self.token = query['token'][0]

    def test_valid_link_can_be_previewed(self):
        response = self.client.get(
            '/api/beta/activate/',
            {'uid': self.uid, 'token': self.token},
            HTTP_HOST='matedesk.pro',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['company_name'], 'Acme Managed Services')
        self.assertEqual(response.json()['workspace'], 'acme-msp.matedesk.pro')

    def test_activation_sets_password_and_marks_application_activated(self):
        response = self.client.post(
            '/api/beta/activate/',
            data={
                'uid': self.uid,
                'token': self.token,
                'password': 'StrongPassword-123!',
                'password_confirm': 'StrongPassword-123!',
            },
            content_type='application/json',
            HTTP_HOST='matedesk.pro',
            secure=True,
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['status'], 'activated')
        self.assertEqual(
            response.json()['workspace_url'],
            'https://acme-msp.matedesk.pro/login',
        )

        self.owner.refresh_from_db()
        self.application.refresh_from_db()
        self.assertTrue(self.owner.is_active)
        self.assertTrue(self.owner.check_password('StrongPassword-123!'))
        self.assertEqual(self.application.status, BetaApplication.STATUS_ACTIVATED)
        self.assertIsNotNone(self.application.activated_at)
        self.assertTrue(
            AdminActionLog.objects.filter(
                action='beta_application_activated',
                target_id=str(self.application.pk),
            ).exists()
        )

    def test_activation_link_is_one_time(self):
        first = self.client.post(
            '/api/beta/activate/',
            data={
                'uid': self.uid,
                'token': self.token,
                'password': 'StrongPassword-123!',
                'password_confirm': 'StrongPassword-123!',
            },
            content_type='application/json',
            HTTP_HOST='matedesk.pro',
        )
        self.assertEqual(first.status_code, 200)

        second = self.client.get(
            '/api/beta/activate/',
            {'uid': self.uid, 'token': self.token},
            HTTP_HOST='matedesk.pro',
        )
        self.assertEqual(second.status_code, 400)

    def test_mismatched_passwords_do_not_activate(self):
        response = self.client.post(
            '/api/beta/activate/',
            data={
                'uid': self.uid,
                'token': self.token,
                'password': 'StrongPassword-123!',
                'password_confirm': 'DifferentPassword-456!',
            },
            content_type='application/json',
            HTTP_HOST='matedesk.pro',
        )

        self.assertEqual(response.status_code, 400)
        self.owner.refresh_from_db()
        self.application.refresh_from_db()
        self.assertFalse(self.owner.is_active)
        self.assertEqual(self.application.status, BetaApplication.STATUS_APPROVED)

    def test_invalid_token_is_rejected(self):
        response = self.client.get(
            '/api/beta/activate/',
            {'uid': self.uid, 'token': 'invalid-token'},
            HTTP_HOST='matedesk.pro',
        )

        self.assertEqual(response.status_code, 400)

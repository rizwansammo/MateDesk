from unittest.mock import patch

from django.test import Client, TestCase, override_settings

from apps.email_ingestion.models import TenantEmailSettings
from apps.platform_admin.auth_utils import SESSION_KEY
from apps.platform_admin.models import AdminActionLog, BetaApplication
from apps.tenants.models import ClientOrganization, Tenant
from apps.users.models import User


@override_settings(
    PLATFORM_ADMIN_ENABLED=True,
    DEPLOYMENT_MODE='multi_tenant',
    ALLOWED_HOSTS=['matedesk.pro', 'testserver'],
    STORAGES={
        'default': {
            'BACKEND': 'django.core.files.storage.FileSystemStorage',
        },
        'staticfiles': {
            'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage',
        },
    },
)
class BetaApplicationAdminReviewTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.admin = User.objects.create_superuser(
            email='admin@netamate.com',
            password='AdminPassword-123!',
            first_name='Platform',
            last_name='Admin',
        )
        session = self.client.session
        session[SESSION_KEY] = str(self.admin.pk)
        session.save()

        self.application = BetaApplication.objects.create(
            company_name='Acme Managed Services',
            owner_name='John Smith',
            email='john@acmemsp.com',
            requested_slug='acme-msp',
        )

    def decision_url(self):
        return f'/platform-admin/beta-applications/{self.application.pk}/decide/'

    def detail_url(self):
        return f'/platform-admin/beta-applications/{self.application.pk}/'

    def test_list_and_detail_are_available_to_platform_admin(self):
        list_response = self.client.get('/platform-admin/beta-applications/')
        detail_response = self.client.get(self.detail_url())

        self.assertEqual(list_response.status_code, 200)
        self.assertContains(list_response, 'Acme Managed Services')
        self.assertEqual(detail_response.status_code, 200)
        self.assertContains(detail_response, 'john@acmemsp.com')

    @patch('apps.platform_admin.views.send_beta_activation_email', return_value=(True, ''))
    def test_approve_provisions_workspace_and_sends_activation(self, send_email):
        response = self.client.post(
            self.decision_url(),
            {'decision': 'approve', 'review_note': 'Good fit for the beta.'},
            HTTP_HOST='matedesk.pro',
            secure=True,
        )

        self.assertEqual(response.status_code, 302)
        self.application.refresh_from_db()
        self.assertEqual(self.application.status, BetaApplication.STATUS_APPROVED)
        self.assertEqual(self.application.reviewed_by, self.admin)
        self.assertIsNotNone(self.application.reviewed_at)
        self.assertEqual(self.application.review_note, 'Good fit for the beta.')
        self.assertIsNotNone(self.application.activation_email_sent_at)
        self.assertEqual(self.application.activation_email_last_error, '')

        tenant = Tenant.objects.get(slug='acme-msp')
        self.assertEqual(self.application.provisioned_tenant, tenant)
        self.assertEqual(tenant.status, 'active')
        self.assertTrue(tenant.is_active)

        owner = User.objects.get(tenant=tenant, role='msp_owner')
        self.assertEqual(self.application.owner_user, owner)
        self.assertFalse(owner.is_active)
        self.assertFalse(owner.has_usable_password())

        self.assertTrue(
            ClientOrganization.objects.filter(
                tenant=tenant,
                name='Walk-In',
                is_active=True,
            ).exists()
        )
        self.assertTrue(TenantEmailSettings.objects.filter(tenant=tenant).exists())

        send_email.assert_called_once()
        activation_url = send_email.call_args.args[1]
        self.assertIn('https://matedesk.pro/activate?', activation_url)

        self.assertTrue(
            AdminActionLog.objects.filter(
                action='beta_application_approved',
                target_id=str(self.application.pk),
            ).exists()
        )
        self.assertTrue(
            AdminActionLog.objects.filter(
                action='beta_workspace_provisioned',
                target_tenant=tenant,
            ).exists()
        )
        self.assertTrue(
            AdminActionLog.objects.filter(
                action='beta_activation_email_sent',
                target_id=str(self.application.pk),
            ).exists()
        )

    @patch(
        'apps.platform_admin.views.send_beta_activation_email',
        return_value=(False, 'SMTP unavailable'),
    )
    def test_smtp_failure_does_not_roll_back_approved_workspace(self, _send_email):
        response = self.client.post(
            self.decision_url(),
            {'decision': 'approve'},
            HTTP_HOST='matedesk.pro',
            secure=True,
        )

        self.assertEqual(response.status_code, 302)
        self.application.refresh_from_db()
        self.assertEqual(self.application.status, BetaApplication.STATUS_APPROVED)
        self.assertIsNotNone(self.application.provisioned_tenant_id)
        self.assertIsNotNone(self.application.owner_user_id)
        self.assertEqual(self.application.activation_email_last_error, 'SMTP unavailable')
        self.assertIsNone(self.application.activation_email_sent_at)
        self.assertTrue(Tenant.objects.filter(slug='acme-msp').exists())
        self.assertTrue(
            AdminActionLog.objects.filter(
                action='beta_activation_email_failed',
                target_id=str(self.application.pk),
            ).exists()
        )

    def test_reject_records_review_without_creating_tenant(self):
        response = self.client.post(
            self.decision_url(),
            {'decision': 'reject', 'review_note': 'Not a fit for the current beta.'},
        )

        self.assertEqual(response.status_code, 302)
        self.application.refresh_from_db()
        self.assertEqual(self.application.status, BetaApplication.STATUS_REJECTED)
        self.assertEqual(self.application.reviewed_by, self.admin)
        self.assertEqual(self.application.review_note, 'Not a fit for the current beta.')
        self.assertFalse(Tenant.objects.filter(slug='acme-msp').exists())
        self.assertTrue(
            AdminActionLog.objects.filter(
                action='beta_application_rejected',
                target_id=str(self.application.pk),
            ).exists()
        )

    def test_approval_is_blocked_when_requested_slug_is_no_longer_available(self):
        Tenant.objects.create(name='Existing Tenant', slug='acme-msp')

        response = self.client.post(
            self.decision_url(),
            {'decision': 'approve'},
        )

        self.assertEqual(response.status_code, 302)
        self.application.refresh_from_db()
        self.assertEqual(self.application.status, BetaApplication.STATUS_PENDING)
        self.assertIsNone(self.application.reviewed_at)
        self.assertFalse(
            AdminActionLog.objects.filter(
                action='beta_application_approved',
                target_id=str(self.application.pk),
            ).exists()
        )

    def test_reviewed_application_cannot_be_decided_twice(self):
        self.application.status = BetaApplication.STATUS_REJECTED
        self.application.reviewed_by = self.admin
        self.application.save(update_fields=['status', 'reviewed_by'])

        response = self.client.post(
            self.decision_url(),
            {'decision': 'approve'},
        )

        self.assertEqual(response.status_code, 302)
        self.application.refresh_from_db()
        self.assertEqual(self.application.status, BetaApplication.STATUS_REJECTED)
        self.assertFalse(
            AdminActionLog.objects.filter(
                action='beta_application_approved',
                target_id=str(self.application.pk),
            ).exists()
        )

    @patch('apps.platform_admin.views.send_beta_activation_email', return_value=(True, ''))
    def test_legacy_approved_application_can_be_provisioned(self, send_email):
        self.application.status = BetaApplication.STATUS_APPROVED
        self.application.reviewed_by = self.admin
        self.application.save(update_fields=['status', 'reviewed_by'])

        response = self.client.post(
            f'/platform-admin/beta-applications/{self.application.pk}/provision/',
            HTTP_HOST='matedesk.pro',
            secure=True,
        )

        self.assertEqual(response.status_code, 302)
        self.application.refresh_from_db()
        self.assertIsNotNone(self.application.provisioned_tenant_id)
        self.assertIsNotNone(self.application.owner_user_id)
        send_email.assert_called_once()

    @patch('apps.platform_admin.views.send_beta_activation_email', return_value=(True, ''))
    def test_activation_email_can_be_resent_before_owner_activates(self, send_email):
        self.application.status = BetaApplication.STATUS_APPROVED
        self.application.reviewed_by = self.admin
        self.application.save(update_fields=['status', 'reviewed_by'])

        self.client.post(
            f'/platform-admin/beta-applications/{self.application.pk}/provision/',
            HTTP_HOST='matedesk.pro',
            secure=True,
        )
        send_email.reset_mock()

        response = self.client.post(
            f'/platform-admin/beta-applications/{self.application.pk}/resend-activation/',
            HTTP_HOST='matedesk.pro',
            secure=True,
        )

        self.assertEqual(response.status_code, 302)
        send_email.assert_called_once()

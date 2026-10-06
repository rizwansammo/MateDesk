from django.test import Client, TestCase, override_settings

from apps.platform_admin.auth_utils import SESSION_KEY
from apps.platform_admin.models import AdminActionLog, BetaApplication
from apps.tenants.models import Tenant
from apps.users.models import User


@override_settings(
    PLATFORM_ADMIN_ENABLED=True,
    DEPLOYMENT_MODE='multi_tenant',
    ALLOWED_HOSTS=['matedesk.pro', 'testserver'],
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

    def test_approve_records_review_without_provisioning_tenant(self):
        response = self.client.post(
            self.decision_url(),
            {'decision': 'approve', 'review_note': 'Good fit for the beta.'},
        )

        self.assertEqual(response.status_code, 302)
        self.application.refresh_from_db()
        self.assertEqual(self.application.status, BetaApplication.STATUS_APPROVED)
        self.assertEqual(self.application.reviewed_by, self.admin)
        self.assertIsNotNone(self.application.reviewed_at)
        self.assertEqual(self.application.review_note, 'Good fit for the beta.')
        self.assertFalse(Tenant.objects.filter(slug='acme-msp').exists())
        self.assertTrue(
            AdminActionLog.objects.filter(
                action='beta_application_approved',
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

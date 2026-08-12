import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


INITIAL_PLANS = [
    {
        'plan_key': 'starter',
        'name': 'Starter',
        'tagline': 'For independent IT consultants and small MSPs getting off shared inboxes.',
        'price': '$19',
        'price_monthly': '$24',
        'annual_note': 'billed annually · $24 monthly',
        'features': [
            'Up to 5 client tenants',
            'Email + portal ingestion',
            'Basic SLA tracking',
            'Internal notes & @mentions',
            'Standard reports',
            'Email + community support',
        ],
        'is_featured': False,
        'sort_order': 0,
    },
    {
        'plan_key': 'professional',
        'name': 'Pro',
        'tagline': 'For growing MSPs serving 10–50 client organizations with multi-tier support.',
        'price': '$39',
        'price_monthly': '$49',
        'annual_note': 'billed annually · $49 monthly',
        'features': [
            'Unlimited client tenants',
            'L1/L2/L3 routing + skill-based assignment',
            'Per-tenant SLA policies + breach alerts',
            'Quarterly business review export',
            'Custom fields + ticket forms',
            'API + 100+ integrations',
            'Priority chat support',
        ],
        'is_featured': True,
        'sort_order': 1,
    },
    {
        'plan_key': 'enterprise',
        'name': 'Scale',
        'tagline': 'For established MSPs and IT departments with compliance and audit needs.',
        'price': '$79',
        'price_monthly': '$99',
        'annual_note': 'billed annually · $99 monthly',
        'features': [
            'Everything in Pro',
            'SSO (SAML, OIDC) + SCIM provisioning',
            'Role-based access control',
            'Audit log export (SIEM-ready)',
            'Custom domains per tenant',
            '99.9% uptime SLA',
            'Dedicated customer success manager',
        ],
        'is_featured': False,
        'sort_order': 2,
    },
]


def seed_initial_data(apps, schema_editor):
    PlatformSettings = apps.get_model('platform_admin', 'PlatformSettings')
    PlatformPlan = apps.get_model('platform_admin', 'PlatformPlan')

    if not PlatformSettings.objects.exists():
        PlatformSettings.objects.create(id=1)

    if not PlatformPlan.objects.exists():
        for plan in INITIAL_PLANS:
            PlatformPlan.objects.create(**plan)


def reverse_seed(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('platform_admin', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='PlatformSettings',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('platform_name', models.CharField(default='MateDesk Pro', max_length=200)),
                ('company_name', models.CharField(default='NetaMate Solutions', max_length=200)),
                ('version', models.CharField(default='v2.0', max_length=50)),
                ('platform_url', models.CharField(default='matedesk.app', max_length=200)),
                ('admin_panel_url', models.CharField(default='/platform-admin/', max_length=200)),
                ('environment', models.CharField(default='Production', max_length=50)),
                ('operator', models.CharField(default='NetaMate Solutions', max_length=200)),
                ('support_email', models.EmailField(default='support@netamate.com', max_length=254)),
                ('status_text', models.CharField(default='All Systems Operational', max_length=100)),
                ('build_info', models.CharField(default='MateDesk Pro v2.0 — Django 4.x', max_length=200)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('updated_by', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='+',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={'verbose_name': 'Platform Settings'},
        ),
        migrations.CreateModel(
            name='PlatformPlan',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('plan_key', models.CharField(
                    choices=[('starter', 'Starter'), ('professional', 'Professional'), ('enterprise', 'Enterprise')],
                    max_length=30, unique=True,
                )),
                ('name', models.CharField(max_length=100)),
                ('tagline', models.CharField(max_length=500)),
                ('price', models.CharField(max_length=20)),
                ('price_monthly', models.CharField(default='', max_length=20)),
                ('annual_note', models.CharField(default='', max_length=200)),
                ('features', models.JSONField(default=list)),
                ('is_featured', models.BooleanField(default=False)),
                ('sort_order', models.PositiveIntegerField(default=0)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={'ordering': ['sort_order']},
        ),
        migrations.RunPython(seed_initial_data, reverse_seed),
    ]

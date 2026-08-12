import os
from pathlib import Path
from decouple import config

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = config('SECRET_KEY')
DEBUG      = config('DEBUG', cast=bool, default=False)
ALLOWED_HOSTS = config('ALLOWED_HOSTS', default='localhost,127.0.0.1,.localhost').split(',')

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # Third-party
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',
    'channels',
    # MateDesk apps
    'apps.tenants',
    'apps.users',
    'apps.tickets',
    'apps.email_ingestion',
    'apps.kb',
    'apps.events',
    'apps.canned',
    'apps.platform_admin',
    'apps.productivity',
    'apps.billing',
    'apps.sla',
    'apps.automation',
    'apps.chat',
]

AUTH_USER_MODEL = 'users.User'

# Per-tenant email uniqueness is enforced via unique_together on (tenant, email).
# Django auth.E003 requires USERNAME_FIELD to be globally unique, but we use JWT
# auth so Django's built-in authenticate() is never called for tenants.
SILENCED_SYSTEM_CHECKS = ['auth.E003', 'auth.W004']

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    # WhiteNoise must come immediately after SecurityMiddleware
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'core.middleware.tenant.TenantMiddleware',
]

ROOT_URLCONF    = 'core.urls'
WSGI_APPLICATION = 'core.wsgi.application'
ASGI_APPLICATION = 'core.asgi.application'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

# Database — defaults to SQLite for local dev; switch to PostgreSQL via DATABASE_URL
_db_url = config('DATABASE_URL', default='')
if _db_url.startswith('postgresql'):
    from urllib.parse import urlparse, unquote
    _p = urlparse(_db_url)
    # urlparse handles passwords containing '@'/':' (when percent-encoded) and we
    # never echo the raw URL in errors — it carries the DB password.
    if _p.hostname and _p.path and len(_p.path) > 1:
        DATABASES = {
            'default': {
                'ENGINE':   'django.db.backends.postgresql',
                'NAME':     _p.path.lstrip('/'),
                'USER':     unquote(_p.username or ''),
                'PASSWORD': unquote(_p.password or ''),
                'HOST':     _p.hostname,
                'PORT':     str(_p.port or 5432),
            }
        }
    else:
        raise ValueError('Invalid DATABASE_URL: expected postgresql://user:password@host:port/dbname')
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME':   BASE_DIR / 'db.sqlite3',
        }
    }

# CORS
CORS_ALLOWED_ORIGINS = config(
    'CORS_ALLOWED_ORIGINS',
    default='http://localhost:3000'
).split(',')

CORS_ALLOWED_ORIGIN_REGEXES = config(
    'CORS_ALLOWED_ORIGIN_REGEXES',
    # Dev default: allow any *.localhost origin
    default=r'^http://[a-z0-9][a-z0-9-]*\.localhost(:\d+)?$'
).split(',')

CORS_ALLOW_CREDENTIALS = True

# CSRF — must include every domain that issues state-changing requests via HTTPS
CSRF_TRUSTED_ORIGINS = config(
    'CSRF_TRUSTED_ORIGINS',
    default='http://localhost:3000'
).split(',')

# Hostnames that are NOT tenant portals (apex domain + fixed subdomains).
# Requests to these hosts skip tenant resolution and are served as the
# marketing / public site. Tenant subdomains are everything else.
NON_TENANT_HOSTS = set(
    config('NON_TENANT_HOSTS', default='localhost,127.0.0.1').split(',')
)
APP_DOMAIN = config('APP_DOMAIN', default='').strip()

CHANNEL_LAYER_BACKEND = os.environ.get('CHANNEL_LAYER_BACKEND', 'memory')
CHANNEL_REDIS_URL = os.environ.get('CHANNEL_REDIS_URL', config('CHANNEL_REDIS_URL', default='redis://127.0.0.1:6379/2'))
if CHANNEL_LAYER_BACKEND == 'redis':
    CHANNEL_LAYERS = {
        'default': {
            'BACKEND': 'channels_redis.core.RedisChannelLayer',
            'CONFIG': {
                'hosts': [CHANNEL_REDIS_URL],
            },
        },
    }
else:
    CHANNEL_LAYERS = {
        'default': {
            'BACKEND': 'channels.layers.InMemoryChannelLayer',
        },
    }

AUTHENTICATION_BACKENDS = [
    'apps.users.backends.TenantBackend',
    'apps.users.backends.PlatformAdminBackend',
]

# DRF
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 25,
    # Global backstop throttles. UserRateThrottle keys by authenticated user, so it
    # caps dashboard/API users but is a no-op for anonymous requests — important
    # because token refresh is AllowAny/anonymous and must not be IP-throttled
    # (a whole office shares one NAT egress IP).
    # AnonRateThrottle is deliberately NOT global for the same reason; login/register
    # carry their own anon-scoped throttles. ScopedRateThrottle is a no-op unless a view
    # sets `throttle_scope`, letting us add tight per-endpoint caps where they matter.
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.UserRateThrottle',
        'rest_framework.throttling.ScopedRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'user':           '2000/hour',   # generous per-user backstop (SPA polls notifications/stats)
        'auth_login':     '20/min',
        'auth_register':  '5/hour',
        'password_reset': '30/hour',     # sensitive: returns a generated credential
        'staff_create':   '30/hour',     # sensitive: creates accounts
    },
}

from datetime import timedelta
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME':   timedelta(hours=1),
    'REFRESH_TOKEN_LIFETIME':  timedelta(days=7),
    'SIGNING_KEY':             config('JWT_SECRET_KEY', default=SECRET_KEY),
    'AUTH_HEADER_TYPES':       ('Bearer',),
    'USER_ID_FIELD':           'id',
    'USER_ID_CLAIM':           'user_id',
    'TOKEN_OBTAIN_SERIALIZER': 'apps.users.serializers.TenantTokenObtainPairSerializer',
    'ROTATE_REFRESH_TOKENS':   True,
    'BLACKLIST_AFTER_ROTATION': True,
}

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE     = 'UTC'
USE_I18N      = True
USE_TZ        = True

STATIC_URL  = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
MEDIA_URL   = '/media/'
MEDIA_ROOT  = BASE_DIR / 'media'

# WhiteNoise — compress and cache static files with content-hash filenames
STORAGES = {
    'default': {
        'BACKEND': 'django.core.files.storage.FileSystemStorage',
    },
    'staticfiles': {
        'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage',
    },
}

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ── Celery ────────────────────────────────────────────────────────────────────
CELERY_BROKER_URL        = config('CELERY_BROKER_URL', default='redis://redis:6379/1')
# Defaults to the broker URL (same Redis) but stays independently overridable —
# previously this also read CELERY_BROKER_URL, so setting CELERY_RESULT_BACKEND
# in .env was silently ignored.
CELERY_RESULT_BACKEND    = config('CELERY_RESULT_BACKEND', default=CELERY_BROKER_URL)
CELERY_ACCEPT_CONTENT    = ['json']
CELERY_TASK_SERIALIZER   = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE          = 'UTC'

try:
    from celery.schedules import crontab  # noqa: E402
    from datetime import timedelta as dt_timedelta  # noqa: E402
    CELERY_BEAT_SCHEDULE = {
        'automation-overdue-tickets': {
            'task':     'apps.automation.tasks.run_overdue_ticket_rules',
            'schedule': crontab(minute='*/5'),
        },
        'automation-stale-tickets': {
            'task':     'apps.automation.tasks.run_stale_ticket_rules',
            'schedule': crontab(minute='*/15'),
        },
        'email-poll-mailboxes': {
            'task':     'apps.email_ingestion.tasks.poll_all_tenant_mailboxes',
            'schedule': dt_timedelta(seconds=30),
        },
    }
except ImportError:
    pass

# Production security hardening (active only when DEBUG=False)
if not DEBUG:
    SECURE_PROXY_SSL_HEADER      = ('HTTP_X_FORWARDED_PROTO', 'https')
    SECURE_SSL_REDIRECT           = False  # nginx handles the redirect
    SESSION_COOKIE_SECURE         = True
    CSRF_COOKIE_SECURE            = True
    CSRF_COOKIE_HTTPONLY          = True   # platform-admin uses {% csrf_token %} hidden fields, no JS reads the cookie
    SECURE_HSTS_SECONDS           = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD           = True
    SECURE_CONTENT_TYPE_NOSNIFF   = True

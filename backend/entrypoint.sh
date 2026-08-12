#!/bin/bash
set -e

if [ "$#" -gt 0 ]; then
  # Allow non-web services (celery/one-off manage.py commands) to run their command directly.
  exec "$@"
fi

echo "→ Running database migrations..."
python manage.py migrate --noinput

echo "→ Collecting static files..."
python manage.py collectstatic --noinput --clear

echo "→ Starting Gunicorn (ASGI/Uvicorn worker) on port ${PORT:-8005}..."
exec gunicorn core.asgi:application \
    --worker-class uvicorn.workers.UvicornWorker \
    --bind "0.0.0.0:${PORT:-8005}" \
    --workers "${GUNICORN_WORKERS:-3}" \
    --timeout 120 \
    --log-level info \
    --access-logfile - \
    --error-logfile -

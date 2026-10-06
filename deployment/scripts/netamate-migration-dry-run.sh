#!/usr/bin/env bash
set -euo pipefail

MAIN_DIR="${MATEDESK_MAIN_DIR:-/opt/MateDesk}"
SOURCE_DIR="${MATEDESK_NETAMATE_SOURCE_DIR:-/opt/NetaMate-HelpDesk}"
TENANT="${MATEDESK_MIGRATION_TENANT:-netamate}"

TMP_MAIN="$(mktemp)"
TMP_SOURCE="$(mktemp)"
trap 'rm -f "$TMP_MAIN" "$TMP_SOURCE"' EXIT
chmod 600 "$TMP_MAIN" "$TMP_SOURCE"

manifest() {
  local dir="$1"
  local out="$2"
  cd "$dir"
  if [[ -f .release.env ]]; then
    set -a
    # shellcheck disable=SC1091
    source ./.release.env
    set +a
  fi
  docker compose exec -T backend     python manage.py tenant_migration_manifest --tenant "$TENANT" > "$out"
}

manifest "$MAIN_DIR" "$TMP_MAIN"
manifest "$SOURCE_DIR" "$TMP_SOURCE"

python3 - "$TMP_MAIN" "$TMP_SOURCE" <<'PY'
import json
import sys

main = json.load(open(sys.argv[1], encoding='utf-8'))
source = json.load(open(sys.argv[2], encoding='utf-8'))

def keyed(rows, key):
    return {row[key]: row for row in rows if row.get(key)}

def common(rows_a, rows_b, key):
    a = keyed(rows_a, key)
    b = keyed(rows_b, key)
    return sorted(set(a) & set(b)), a, b

fatal = []
warnings = []

if main['schema']['fingerprint'] != source['schema']['fingerprint']:
    fatal.append('Schema migration fingerprints differ.')

user_common, main_users, source_users = common(main['users'], source['users'], 'email_h')
org_common, main_orgs, source_orgs = common(main['organizations'], source['organizations'], 'match_h')
ticket_ref_common, _, _ = common(main['tickets'], source['tickets'], 'ref')
email_common, _, _ = common(main['processed_emails'], source['processed_emails'], 'message_h')

if ticket_ref_common:
    fatal.append(f'Ticket reference collision(s): {len(ticket_ref_common)}')

uuid_entities = ['users', 'organizations', 'tickets', 'replies', 'notifications', 'attachments']
uuid_collisions = {}
for entity in uuid_entities:
    ids_main = {row['id'] for row in main[entity] if row.get('id')}
    ids_source = {row['id'] for row in source[entity] if row.get('id')}
    hit = ids_main & ids_source
    if hit:
        uuid_collisions[entity] = len(hit)
if uuid_collisions:
    fatal.append(f'UUID collision(s): {uuid_collisions}')

role_conflicts = []
for key in user_common:
    if main_users[key]['role'] != source_users[key]['role']:
        role_conflicts.append((main_users[key]['role'], source_users[key]['role']))
if role_conflicts:
    warnings.append(f'Overlapping user role conflicts: {len(role_conflicts)}; source role should win.')

org_name_changes = 0
for key in org_common:
    if main_orgs[key]['name_h'] != source_orgs[key]['name_h']:
        org_name_changes += 1
if org_name_changes:
    warnings.append(f'Matched organization name changes: {org_name_changes}; source metadata should win.')

if email_common:
    warnings.append(f'Processed email dedupe overlap: {len(email_common)}; importer must skip existing message IDs.')

print('=== MateDesk Phase C migration dry-run ===')
print('schema_match=', main['schema']['fingerprint'] == source['schema']['fingerprint'])
print('main_tenant_id=', main['tenant']['id'])
print('source_tenant_id=', source['tenant']['id'])
print('tenant_id_remap_required=', main['tenant']['id'] != source['tenant']['id'])
print('main_counts=', main['counts'])
print('source_counts=', source['counts'])
print('overlapping_users_by_email=', len(user_common))
print('matched_organizations=', len(org_common))
print('ticket_ref_collisions=', len(ticket_ref_common))
print('processed_email_message_collisions=', len(email_common))
print('uuid_collisions=', uuid_collisions)
print('source_email_auth=', source['email_settings']['auth_method'])
print('source_matemail_connected=', source['email_settings']['matemail_connected'])

for item in warnings:
    print('WARNING:', item)
for item in fatal:
    print('FATAL:', item)

print('SAFE_TO_PREPARE_MERGE=', 'no' if fatal else 'yes')
sys.exit(2 if fatal else 0)
PY

# Safe encryption compatibility probe. This never reads or emits a mailbox secret.
cd "$SOURCE_DIR"
set -a
# shellcheck disable=SC1091
source ./.release.env
set +a
PROBE="$(docker compose exec -T backend python manage.py shell -c   'from apps.email_ingestion.crypto import encrypt_email_credential; print(encrypt_email_credential("phase-c-probe"))' | tail -1)"

cd "$MAIN_DIR"
RESULT="$(docker compose exec -T -e PHASEC_PROBE="$PROBE" backend python manage.py shell -c   'import os; from apps.email_ingestion.crypto import decrypt_email_credential; print(decrypt_email_credential(os.environ["PHASEC_PROBE"]) == "phase-c-probe")' | tail -1)"

echo "cross_deployment_email_crypto_compatible=$RESULT"
if [[ "$RESULT" != "True" ]]; then
  echo "WARNING: Email credentials/tokens must not be copied as ciphertext; reconnect or securely re-encrypt them during cutover."
fi

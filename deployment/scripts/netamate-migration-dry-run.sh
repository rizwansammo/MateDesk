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
  (
    cd "$dir"
    if [[ -f .release.env ]]; then
      set -a
      # shellcheck disable=SC1091
      source ./.release.env
      set +a
    fi
    docker compose exec -T backend python manage.py tenant_migration_manifest --tenant "$TENANT"
  ) > "$out"
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

def duplicate_keys(rows, key):
    seen = {}
    for row in rows:
        value = row.get(key)
        if not value:
            continue
        seen[value] = seen.get(value, 0) + 1
    return {value: count for value, count in seen.items() if count > 1}

fatal = []
warnings = []

if main['schema']['fingerprint'] != source['schema']['fingerprint']:
    fatal.append('Schema migration fingerprints differ.')

for side, payload in [('main', main), ('source', source)]:
    dup_users = duplicate_keys(payload['users'], 'email_h')
    if dup_users:
        fatal.append(f'{side} has ambiguous normalized user-email identities: {len(dup_users)}.')

# User matching is normalized-email based.
main_users = keyed(main['users'], 'email_h')
source_users = keyed(source['users'], 'email_h')
user_common = sorted(set(main_users) & set(source_users))

# Organization matching follows Phase C policy:
# source domain present -> target domain; source domain blank -> target name.
main_orgs_by_domain = {}
main_orgs_by_name = {}
for org in main['organizations']:
    if org.get('domain_h'):
        main_orgs_by_domain.setdefault(org['domain_h'], []).append(org)
    main_orgs_by_name.setdefault(org['name_h'], []).append(org)

org_matches = []
org_unmatched = []
org_ambiguous = []
for source_org in source['organizations']:
    if source_org.get('domain_h'):
        candidates = main_orgs_by_domain.get(source_org['domain_h'], [])
        match_kind = 'domain'
    else:
        candidates = main_orgs_by_name.get(source_org['name_h'], [])
        match_kind = 'name'

    if len(candidates) == 1:
        org_matches.append((source_org, candidates[0], match_kind))
    elif len(candidates) == 0:
        org_unmatched.append(source_org)
    else:
        org_ambiguous.append((source_org, match_kind, len(candidates)))

if org_ambiguous:
    fatal.append(f'Ambiguous organization match(es): {len(org_ambiguous)}.')

main_tickets = keyed(main['tickets'], 'ref')
source_tickets = keyed(source['tickets'], 'ref')
ticket_ref_common = sorted(set(main_tickets) & set(source_tickets))

main_emails = keyed(main['processed_emails'], 'message_h')
source_emails = keyed(source['processed_emails'], 'message_h')
email_common = sorted(set(main_emails) & set(source_emails))

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

org_name_changes = sum(
    1 for source_org, main_org, _ in org_matches
    if source_org['name_h'] != main_org['name_h']
)
if org_name_changes:
    warnings.append(f'Matched organization name changes: {org_name_changes}; source metadata should win.')

if email_common:
    warnings.append(f'Processed email dedupe overlap: {len(email_common)}; importer must skip existing Message-IDs.')

estimated_users = len(main['users']) + len(source['users']) - len(user_common)
estimated_orgs = len(main['organizations']) + len(org_unmatched)

print('=== MateDesk Phase C migration dry-run ===')
print('schema_match=', main['schema']['fingerprint'] == source['schema']['fingerprint'])
print('main_tenant_id=', main['tenant']['id'])
print('source_tenant_id=', source['tenant']['id'])
print('tenant_id_remap_required=', main['tenant']['id'] != source['tenant']['id'])
print('main_counts=', main['counts'])
print('source_counts=', source['counts'])
print('overlapping_users_by_email=', len(user_common))
print('matched_organizations=', len(org_matches))\nprint('source_organizations_to_create=', len(org_unmatched))
print('ticket_ref_collisions=', len(ticket_ref_common))
print('processed_email_message_collisions=', len(email_common))
print('uuid_collisions=', uuid_collisions)\nprint('estimated_post_merge_users=', estimated_users)\nprint('estimated_post_merge_organizations=', estimated_orgs)
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
PROBE="$(
  cd "$SOURCE_DIR"
  set -a
  # shellcheck disable=SC1091
  source ./.release.env
  set +a
  docker compose exec -T backend python manage.py shell -c \
    'from apps.email_ingestion.crypto import encrypt_email_credential; print(encrypt_email_credential("phase-c-probe"))' | tail -1
)"

RESULT="$(
  cd "$MAIN_DIR"
  docker compose exec -T -e PHASEC_PROBE="$PROBE" backend python manage.py shell -c \
    'import os; from apps.email_ingestion.crypto import decrypt_email_credential; print(decrypt_email_credential(os.environ["PHASEC_PROBE"]) == "phase-c-probe")' | tail -1
)"

echo "cross_deployment_email_crypto_compatible=$RESULT"
if [[ "$RESULT" != "True" ]]; then
  echo "WARNING: Email credentials/tokens must not be copied as ciphertext; reconnect or securely re-encrypt them during cutover."
fi

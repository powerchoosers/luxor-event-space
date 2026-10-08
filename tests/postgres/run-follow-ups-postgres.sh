#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
image="${POSTGRES_TEST_IMAGE:-postgres:17-alpine}"
container="luxor-follow-ups-pg-$$"

cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

docker run --rm -d --name "$container" \
  -e POSTGRES_HOST_AUTH_METHOD=trust \
  -e POSTGRES_DB=luxor_followups_test \
  -v "$repo_root:/workspace:ro" \
  "$image" >/dev/null

ready=0
for attempt in $(seq 1 60); do
  if docker exec "$container" pg_isready -U postgres -d luxor_followups_test >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
if [[ "$ready" != 1 ]]; then
  echo 'PostgreSQL test container did not become ready.' >&2
  exit 1
fi

docker exec "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d luxor_followups_test \
  -f /workspace/tests/postgres/follow-ups.integration.sql

for role in anon authenticated; do
  if docker exec "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d luxor_followups_test \
    -c "set role $role; select id from public.luxor_follow_up_actions limit 1" >/dev/null 2>&1; then
    echo "$role unexpectedly read follow-up actions." >&2
    exit 1
  fi
  if rpc_output="$(docker exec "$container" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d luxor_followups_test \
    -c "set role $role; select public.luxor_recover_brochure_follow_up_overdue('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cccccccc-cccc-4ccc-8ccc-cccccccccccc','22222222-2222-4222-8222-222222222222','skip',null)" 2>&1)"; then
    echo "$role unexpectedly executed the recovery RPC." >&2
    exit 1
  fi
  if [[ "$rpc_output" != *'permission denied for function luxor_recover_brochure_follow_up_overdue'* ]]; then
    echo "$role recovery RPC failed for an unexpected reason: $rpc_output" >&2
    exit 1
  fi
done
state="$(docker exec "$container" psql -X -qAt -U postgres -d luxor_followups_test \
  -c "set role service_role; select enrollment.status || ':' || action.status || ':' || job.status from public.luxor_follow_up_enrollments enrollment join public.luxor_follow_up_actions action on action.enrollment_id=enrollment.id join public.luxor_email_jobs job on job.id=action.email_job_id where enrollment.id='cccccccc-cccc-4ccc-8ccc-cccccccccccc' and action.id='22222222-2222-4222-8222-222222222222'")"
if [[ "$state" != "paused:skipped:cancelled" ]]; then
  echo "Untrusted RPC attempt changed synthetic state: $state" >&2
  exit 1
fi
echo 'anon/auth follow-up table read and recovery RPC denied; state unchanged: PASS (2 roles)'
echo 'All PostgreSQL follow-up integration checks passed.'

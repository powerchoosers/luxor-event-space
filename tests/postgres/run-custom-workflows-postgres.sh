#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
image="${POSTGRES_TEST_IMAGE:-postgres:16-alpine}"
container="luxor-custom-workflows-pg-$$"

cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

docker run --rm -d --name "$container" \
  -e POSTGRES_HOST_AUTH_METHOD=trust \
  -e POSTGRES_DB=luxor_custom_workflows_test \
  -v "$repo_root:/workspace:ro" \
  "$image" >/dev/null

ready=0
for attempt in $(seq 1 60); do
  if docker exec "$container" pg_isready -U postgres -d luxor_custom_workflows_test >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
if [[ "$ready" != 1 ]]; then
  echo 'PostgreSQL test container did not become ready.' >&2
  exit 1
fi

echo 'Running custom-workflow integration harness with clean ACL defaults.'
docker exec "$container" psql -X -v ON_ERROR_STOP=1 \
  -U postgres -d luxor_custom_workflows_test \
  -f /workspace/tests/postgres/custom-workflows.integration.sql

echo 'Running custom-workflow integration harness with Supabase-style ACL defaults.'
docker exec "$container" psql -X -v ON_ERROR_STOP=1 \
  -v simulate_supabase_default_acl=true \
  -U postgres -d luxor_custom_workflows_test \
  -f /workspace/tests/postgres/custom-workflows.integration.sql

echo 'Both custom-workflow PostgreSQL integration runs passed.'

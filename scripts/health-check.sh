#!/usr/bin/env bash
# Layer 1 of monitoring: is the deployment answering at all?
#
# Hits /api/v1/health and requires "status":"ok" — the endpoint degrades to
# "degraded" when Postgres or Redis is unreachable, so a 200 alone is not
# enough. Runs far more often than the Playwright suite and costs one request.
#
# Two consecutive failures are required before this exits non-zero. A single
# missed probe is a restart, a redeploy, or a dropped packet, and paging on one
# is how an alert channel gets muted. The probes are taken within one run rather
# than across scheduled runs so that detection stays fast and no state has to be
# carried between workflow runs.
#
# Usage: scripts/health-check.sh https://vocabahn.app
set -uo pipefail

BASE_URL="${1:-${E2E_BASE_URL:-}}"
GAP_SECONDS="${HEALTH_PROBE_GAP_SECONDS:-45}"
TIMEOUT_SECONDS="${HEALTH_TIMEOUT_SECONDS:-10}"
ATTEMPTS="${HEALTH_PROBE_ATTEMPTS:-2}"

if [[ -z "$BASE_URL" ]]; then
  echo "::error::health-check.sh needs a base URL (argument or E2E_BASE_URL)." >&2
  echo "Refusing to run: a health check with no target would pass vacuously." >&2
  exit 2
fi

ENDPOINT="${BASE_URL%/}/api/v1/health"

# Prints the outcome and returns 0 when the deployment is fully healthy.
probe() {
  local raw body http_code
  raw="$(curl --silent --max-time "$TIMEOUT_SECONDS" --write-out '\n%{http_code}' "$ENDPOINT" 2>/dev/null)"

  http_code="$(tail -n1 <<<"$raw")"
  body="$(sed '$d' <<<"$raw" | tr -d ' \n\r')"

  # curl reports 000 when it never got a response at all.
  if [[ "$http_code" == "000" ]]; then
    echo "  unreachable (no HTTP response within ${TIMEOUT_SECONDS}s)"
    return 1
  fi
  if [[ "$http_code" != "200" ]]; then
    echo "  HTTP $http_code — $body"
    return 1
  fi
  if [[ "$body" != *'"status":"ok"'* ]]; then
    echo "  HTTP 200 but not healthy — $body"
    return 1
  fi

  echo "  ok — $body"
  return 0
}

echo "Health check: $ENDPOINT"

for (( attempt = 1; attempt <= ATTEMPTS; attempt++ )); do
  echo "Probe $attempt/$ATTEMPTS:"
  if probe; then
    if (( attempt > 1 )); then
      echo "Recovered after $(( attempt - 1 )) failed probe(s) — treating as a blip, not an outage."
    fi
    exit 0
  fi
  if (( attempt < ATTEMPTS )); then
    echo "Waiting ${GAP_SECONDS}s before re-probing…"
    sleep "$GAP_SECONDS"
  fi
done

echo "::error::$ATTEMPTS consecutive health probes failed against $ENDPOINT" >&2
exit 1

#!/usr/bin/env bash
set -euo pipefail

namespace="${1:-pulse}"
if [[ "${ROLLBACK_CONFIRM:-}" != "YES" ]]; then
  printf 'Refusing rollout rollback. Set ROLLBACK_CONFIRM=YES after selecting the intended namespace/revision.\n' >&2
  exit 2
fi

for deployment in pulse-api pulse-outbox-worker; do
  kubectl rollout undo "deployment/${deployment}" --namespace "$namespace"
  kubectl rollout status "deployment/${deployment}" --namespace "$namespace" --timeout=180s
done

printf 'Application deployments rolled back in namespace %s. Database migrations are not reversed.\n' "$namespace"

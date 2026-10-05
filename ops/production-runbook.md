# Production operations

## Initial setup and release

The Kubernetes manifests use external PostgreSQL and Redis; no database,
cache, ingress, or credential values are provisioned by this repository.
Replace the example endpoints, CORS origin, and both image references in
`deploy/kubernetes/workloads.yaml` and `deploy/kubernetes/migration-job.yaml`
with your release image (prefer an immutable digest). Ensure the application
image includes this repository's Node 20.13+ runtime and dependencies.

Before first deployment:

1. Configure private network access, DNS, TLS, backups, and monitoring for the
   managed PostgreSQL and Redis services. PostgreSQL TLS certificate
   verification and Redis TLS are enabled in `base.yaml`; mount the optional
   PostgreSQL CA Secret if the database uses a non-system CA. Redis
   username/password are optional secret keys, but use them when the service
   supports ACL authentication.
2. Create the `pulse` namespace, then synchronize a Kubernetes Secret named
   `pulse-production-secrets` from your external secret manager. Required keys:
   `DB_USER`, `DB_PASSWORD`, `DB_MIGRATION_USER`, `DB_MIGRATION_PASSWORD`,
   `JWT_SECRET`, and `METRICS_TOKEN`. Optional Redis keys: `REDIS_USERNAME`
   and `REDIS_PASSWORD`. For SMTP authentication, optionally add `SMTP_USER`
   and `SMTP_PASSWORD`; configure the non-secret SMTP host, port, TLS mode, and
   sender in the ConfigMap. If a private PostgreSQL CA is needed, create the
   optional `pulse-postgres-ca` Secret with key `ca.crt`, then set
   `DB_SSL_CA_FILE=/etc/postgres-ca/ca.crt` in the ConfigMap. The manifest
   deliberately does not contain populated Kubernetes Secrets.
3. Use distinct runtime (`pulse_app`) and migration (`pulse_migrator`) database
   principals. Run `ops/sql/grant-runtime-access.sql` as the database
   administrator, replacing the role names if needed. `DB_USER` must be the
   runtime role and `DB_MIGRATION_USER` the migration role. The migrator owns
   new migration objects; its default privileges grant the runtime role
   application DML. Restrict operator credentials separately as below.
4. Set real external service addresses and frontend origin in
   `deploy/kubernetes/base.yaml`. `WS_TRUST_PROXY=true` is safe only when the
   ingress/load balancer strips and overwrites forwarded-address headers.
   `DB_POOL_MAX` is per process; the sample values permit up to 60 application
   connections across two API and two worker replicas, before migrations and
   operator sessions. Keep the aggregate below the database connection budget.
5. Mount the same `METRICS_TOKEN` value into Prometheus at
   `/etc/prometheus/secrets/pulse-metrics/METRICS_TOKEN` (read-only, mode
   `0400` or `0440`) and load `monitoring/prometheus/prometheus.example.yml`
   plus `alerts.yml`. Keep the scrape targets on the private cluster network.
   The supplied scrape config targets Kubernetes Services and may only expose
   one replica's process-local metrics per scrape; configure pod discovery or
   a PodMonitor when every replica must be observed.

Email delivery is enabled per user and event type. Configure `SMTP_HOST` and
any SMTP authentication on the worker before enabling email preferences.
Without an SMTP host, opted-in email delivery is retried and eventually
dead-lettered; in-app notifications remain independent.

For initial rollout or each release, apply in this order:

```sh
kubectl apply -f deploy/kubernetes/base.yaml
# Ensure the external-secret controller has materialized pulse-production-secrets.
kubectl delete job pulse-migrate -n pulse --ignore-not-found
kubectl apply -f deploy/kubernetes/migration-job.yaml
kubectl wait --for=condition=complete job/pulse-migrate -n pulse --timeout=10m
kubectl apply -f deploy/kubernetes/workloads.yaml
kubectl rollout status deployment/pulse-api -n pulse --timeout=5m
kubectl rollout status deployment/pulse-outbox-worker -n pulse --timeout=5m
```

Update the image in the migration job before applying it, and use the same
release image for both workloads. A failed migration blocks the rollout; inspect
the Job logs and fix forward rather than deploying code against an unknown
schema. Kubernetes Jobs are immutable; delete the prior Job before applying a
new migration image. This app uses forward-only migrations—do not assume an
application rollback reverses schema changes.

## Dead-letter outbox operations

Use the dedicated database role for the operator CLI. Create the
`pulse_outbox_operator` principal via your identity/secret manager, then run
`ops/sql/grant-outbox-operator.sql` in the application database. It grants
column-limited access to list safe event metadata and atomically requeue
dead-letter rows; it does not grant access to payload or error text. Do not
make this role a member of the app or migration roles.

Run from a trusted operator workstation with credentials loaded from the
secret manager into the standard `DB_*` environment variables (and required
`PORT`, Redis variables, and `JWT_SECRET` expected by application config). The
CLI intentionally does not load the repository's `.env` file:

```sh
npm run outbox -- list
npm run outbox -- list --limit 100
npm run outbox -- replay 550e8400-e29b-41d4-a716-446655440000 --confirm
```

Replay requires the explicit confirmation flag and a UUID, only changes a row
currently in `dead_letter`, resets its attempt counter, and makes it immediately
available. Review the underlying failure with authorized database/log access
before replaying. Replay is not idempotent with respect to notification side
effects; confirm the handler's idempotency behavior and expected impact first.
The CLI deliberately never prints payloads or stored error details.

## Backup, restore, and rollback

Use provider-managed point-in-time recovery/snapshots as the primary backup
strategy where available, and regularly test restoring to an isolated database.
The scripts require PostgreSQL client utilities (`pg_dump`, `pg_restore`) and
standard libpq environment variables; load credentials from a secret manager,
not shell history or committed files.

```sh
PGHOST=db.example.internal PGPORT=5432 PGUSER=backup_user \
PGDATABASE=pulse_notifications PGSSLMODE=require \
  bash ops/scripts/backup-postgres.sh ./backups
```

The backup script produces a custom-format dump with restrictive file
permissions and a SHA-256 checksum when `sha256sum` is installed. Its filename
includes a process ID as well as a UTC timestamp to avoid collisions between
concurrent backups started in the same second. Copy backups
off the operator host to encrypted, access-controlled durable storage and
retain them according to policy.

Restore overwrites objects in the selected target database. Stop API and worker
writers, verify the target and chosen backup/checksum independently, and prefer
a separate recovery database before cutover. Only then:

```sh
RESTORE_CONFIRM=YES PGHOST=db.example.internal PGPORT=5432 PGUSER=restore_user \
PGDATABASE=pulse_recovery PGSSLMODE=require \
  bash ops/scripts/restore-postgres.sh ./backups/pulse_notifications-<timestamp>-<pid>.dump
```

The restore script is destructive for objects present in the target database
and uses a single transaction; provision the target database and its grants
before restoring. Repoint deployments only after validation.

For a bad application release with a compatible schema, review deployment
history and run:

```sh
ROLLBACK_CONFIRM=YES bash ops/scripts/rollback-kubernetes.sh pulse
```

This rolls both deployments back by one Kubernetes revision and waits for
rollout; it does not revert database migrations or configuration. For an
incompatible migration, restore/recover the database using the tested recovery
plan, then deploy a compatible application image. Avoid blind schema rollback.

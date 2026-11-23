# AEGIS-X Hosted Deployment Runbook

This runbook describes the supported hosted configuration for the current AEGIS-X prototype. It is intentionally explicit about the difference between a successful build and a verified live deployment.

## Deployment layout

- **Backend:** Render Docker service using the repository-root `Dockerfile`.
- **Frontend:** Render web service using the `frontend` directory and its Dockerfile/Nginx configuration.
- **Database:** Turso remote database accessed by the Python `turso_serverless` driver.
- **Browser API path:** The frontend calls `/api/...`; Nginx forwards `/api/` to the backend and removes the `/api/` prefix.

Do not configure the backend to use an ephemeral local SQLite file in production. Production startup deliberately refuses that fallback.

## Required backend environment variables

Set these in the backend service's private environment configuration. Never commit their values to Git, paste them into an issue, or expose them in browser code.

| Variable | Requirement |
|---|---|
| `AEGIS_ENV` | `production` |
| `TURSO_DATABASE_URL` | HTTPS-compatible Turso database URL supplied by Turso |
| `TURSO_AUTH_TOKEN` | Database authentication token supplied by Turso |
| `AEGIS_AUTH_REQUIRED` | `1` |
| `AEGIS_TOKEN_SECRET` | Random secret with at least 32 characters |
| `AEGIS_BOOTSTRAP_TOKEN` | Separate random one-time bootstrap secret with at least 32 characters |
| `AEGIS_TOKEN_TTL_SECONDS` | At least `300`; recommended `3600` |

Use two independently generated secrets for the token-signing secret and bootstrap token. Do not reuse a password or database token. Store them only in the hosting provider's secret/environment manager. The application does not print these values.

The backend listens on the hosting provider's `PORT` environment variable (default `8001`). The Docker image includes a `/health` container health check.

## First administrator setup

1. Confirm the backend deployment is healthy before attempting account creation.
2. Open the frontend dashboard and use its first-administrator bootstrap form.
3. Supply the configured one-time bootstrap token, a username of 3–80 characters, and a password of 12–128 characters.
4. Sign in with the administrator credentials.
5. Keep the bootstrap token private. Once the first account exists, bootstrap is no longer available.
6. Create separate operator and auditor accounts from the authenticated user-management interface. Do not share the administrator account.

If bootstrap or sign-in returns HTTP 500, treat it as a server/database/configuration failure until backend logs prove otherwise. Do not repeatedly retry credentials or disable authentication to work around it.

## Health and acceptance checks

The backend `GET /health` endpoint checks all three database connections and both integrity chains:

- `audit_database`
- `approval_database`
- `security_database`
- `audit_chain`
- `security_event_chain`

A healthy response requires every database check to be `ok` and both chain checks to be `valid`. A degraded response returns HTTP 503 and identifies the failed check without returning secrets.

After deployment, verify the following using the public dashboard and authenticated session:

- Dashboard loads over HTTPS.
- Backend `/health` reports `healthy`.
- Security status reports bootstrap unavailable after the first administrator is created.
- Administrator can sign in and load the authenticated dashboard.
- An evaluation creates an audit record and audit verification remains valid.
- A plan simulation is recorded without executing actions.
- A REVIEW request creates a pending approval and does not execute a tool.
- A BLOCK decision does not execute a tool.
- An auditor can inspect and verify evidence but cannot perform operator/admin actions.
- Logout revokes the session; a subsequent protected request is rejected.
- A security event can be ingested by an authorized operator and its hash chain verifies.

Do not call the hosted deployment complete until these live checks pass. CI success alone validates source tests and the frontend build; it does not prove that Render environment variables, Turso credentials, network access, bootstrap, or hosted sign-in are correct.

## Failure diagnosis

| Symptom | First checks |
|---|---|
| Backend does not start | Render deploy/runtime logs; required production environment variables; dependency installation |
| `/health` returns 503 | Inspect the individual check names in the response; confirm Turso URL/token and database access |
| Bootstrap unavailable before first account | Confirm the bootstrap token is configured and no account already exists |
| Bootstrap/login returns 500 | Inspect backend logs and database connectivity; do not assume the password is wrong |
| Dashboard loads but says backend offline | Check backend `/health`, then frontend Nginx `/api/` proxy configuration |
| Browser reports a CORS error | Confirm the frontend is using its same-origin `/api/` path rather than calling the backend directly |

Do not delete or recreate a Turso database to clear an error. Existing audit, approval, user, session, and security-event records may be evidence and must be preserved.

## Prototype boundary

AEGIS-X is a portfolio/development prototype, not a production-certified security product. The execution gateway currently runs harmless demonstration handlers; it does not intercept or govern arbitrary external agents, cloud accounts, operating systems, payment systems, or medical systems. Submitted event-source metadata is client-claimed. The hash chains are tamper-evident but are not independently anchored. A real production deployment requires an independent security review, external audit anchoring, monitored infrastructure integrations, distributed rate limiting, backups, alerting, and an incident-response process.

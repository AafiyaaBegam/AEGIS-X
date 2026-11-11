# AEGIS-X Stage 6 — Security Foundation

## Included
- PBKDF2-HMAC-SHA256 password hashing (stdlib; per-user random salt).
- Signed bearer tokens with expiry and persisted revocable sessions.
- One-time administrator bootstrap using `AEGIS_BOOTSTRAP_TOKEN`.
- Admin / Operator / Auditor roles and user management.
- Separate SQLite security database (`data/aegis_security.db`); the original tamper-evident audit database is not migrated or rewritten.
- Security event ingestion and explainable event history (SQLite update/delete guard triggers).\n- Five failed sign-in attempts per username/IP pair within five minutes trigger a temporary local throttle.
- Optional role enforcement for the existing evaluate/simulate/audit APIs.

## Install
Run `INSTALL_STAGE6.ps1` from the extracted patch folder in PowerShell. It creates a timestamped backup before replacing files. It does not touch `data/aegis_audit.db`.

## First administrator (local development)
Set a one-time bootstrap secret in the backend terminal before starting the server:
```powershell
$env:AEGIS_BOOTSTRAP_TOKEN = "replace-with-a-long-random-one-time-secret"
python -m uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000
```
Create the first administrator once:
```powershell
$body = @{
  bootstrap_token = $env:AEGIS_BOOTSTRAP_TOKEN
  username = "admin"
  password = "Use-a-unique-password-at-least-12-chars"
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:8000/security/bootstrap" -ContentType "application/json" -Body $body
```
Bootstrap closes permanently after the first user is created. Store credentials safely; there is no default account.

Login:
```powershell
$login = @{ username="admin"; password="Use-a-unique-password-at-least-12-chars" } | ConvertTo-Json
$session = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:8000/security/login" -ContentType "application/json" -Body $login
$headers = @{ Authorization = "Bearer $($session.access_token)" }
Invoke-RestMethod http://127.0.0.1:8000/security/me -Headers $headers
```

## Enable RBAC on core APIs
Only after creating users and confirming login, enable enforcement in the backend terminal:
```powershell
$env:AEGIS_AUTH_REQUIRED = "1"
```
Restart the backend. `/evaluate` and `/simulate` require Admin or Operator. `/audit` and `/audit/verify` require Admin or Auditor. Security management endpoints always require their stated role, except first-time bootstrap, login and status.

## API routes
- `GET /security/status` — bootstrap and enforcement status
- `POST /security/bootstrap` — one-time first administrator
- `POST /security/login` — create bearer session
- `GET /security/me` — current identity
- `POST /security/logout` — revoke current session
- `GET /security/users` / `POST /security/users` — admin user management
- `POST /security/events/ingest` — evaluate a submitted security event
- `GET /security/events` — security event history

## Event monitoring boundary
The event-ingest endpoint evaluates events submitted by a trusted integration or a demo client. It does **not** monitor laptop file systems, intercept operating-system delete operations, or stop an external action. A real endpoint agent / database audit connector / cloud integration and an enforcement hook are required for that. Event ingestion is deliberately labelled so demo activity is not misrepresented as live endpoint detection.

## Deployment cautions
This is a local security foundation, not yet a production certification. Before public/company deployment: configure a strong `AEGIS_TOKEN_SECRET` (32+ chars) from a secret manager, enable `AEGIS_AUTH_REQUIRED=1`, use HTTPS, add distributed login throttling and operational monitoring, define backup/retention, review CORS/network exposure, and validate deployment-specific threat models. The local random token-secret file is for development only.

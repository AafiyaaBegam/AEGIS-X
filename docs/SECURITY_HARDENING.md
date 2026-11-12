# Security hardening — milestone 1

## Changes in this milestone

- Security-event actor attribution is taken from the authenticated session, not from a client-supplied actor field.
- The API response identifies the verified session actor and labels the event source as client-claimed metadata.
- Whitespace-only action, resource, and source values are rejected by request validation.
- Core action evaluation rejects whitespace-only actions before policy analysis.
- GitHub Actions runs the backend test suite and frontend production build for pushes to `main` or `hardening/**`, and for pull requests targeting `main`.

## Existing security controls

- Passwords are stored as salted PBKDF2-HMAC-SHA256 hashes.
- Bearer tokens are HMAC-signed, expire, and are checked against persisted revocable sessions.
- Role-based access control separates administrator, operator, and auditor permissions.
- Security-event rows reject ordinary SQL UPDATE and DELETE statements.
- The decision audit log uses a SHA-256 hash chain and blocks appends when verification fails.

## Important limitations

- The login throttle is process-local. It is not a distributed rate limiter and is not sufficient by itself for a multi-worker or public internet deployment.
- The decision audit hash chain is tamper-evident against ordinary record edits, but it is not independently anchored. A party able to rewrite the database and recompute every hash could potentially rewrite the chain. Do not describe it as tamper-proof.
- SQLite triggers protect against ordinary row updates/deletes, not an administrator who can replace the database or alter its schema.
- Policy decisions are deterministic text-and-input-signal assessments. They do not inspect live infrastructure, prove the truth of supplied evidence, or execute/stop external actions.
- Submitted event source values are client claims. The authenticated actor is verified; the origin system is not independently attested.

## Deployment requirements before external exposure

1. Keep `AEGIS_AUTH_REQUIRED=1`.
2. Supply a high-entropy `AEGIS_TOKEN_SECRET` (at least 32 characters) through a secret manager or protected environment configuration.
3. Protect database files and backups with operating-system permissions and encrypted storage.
4. Put the API behind TLS and a trusted reverse proxy.
5. Replace the process-local login throttle with a shared persistent/distributed limiter.
6. Add an independently stored audit checkpoint/signature service before claiming stronger tamper resistance.
7. Integrate real event sources and authenticate/attest their identities before treating event source metadata as verified.

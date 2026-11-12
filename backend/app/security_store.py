"""AEGIS-X Stage 6 security foundation.

Uses only Python's standard library for password hashing, signed bearer tokens,
session revocation, role checks, and a separate security-event store.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "data"
DB_PATH = Path(os.getenv("AEGIS_SECURITY_DB", str(DATA_DIR / "aegis_security.db")))
TOKEN_TTL_SECONDS = int(os.getenv("AEGIS_TOKEN_TTL_SECONDS", "3600"))
ROLES = {"admin", "operator", "auditor"}


class SecurityError(Exception):
    pass


def _connect():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=10000")
    return conn


def _now() -> int:
    return int(time.time())


def _secret() -> bytes:
    configured = os.getenv("AEGIS_TOKEN_SECRET")
    if configured:
        if len(configured) < 32:
            raise SecurityError("AEGIS_TOKEN_SECRET must contain at least 32 characters.")
        return configured.encode("utf-8")
    # Local development fallback: persistent random secret, never a hard-coded key.
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = DATA_DIR / ".aegis_token_secret"
    if not path.exists():
        candidate = secrets.token_bytes(48)
        try:
            with path.open("xb") as handle:
                handle.write(candidate)
            try:
                path.chmod(0o600)
            except OSError:
                pass
        except FileExistsError:
            pass
    return path.read_bytes()


def initialize():
    with _connect() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE COLLATE NOCASE,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('admin','operator','auditor')),
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
            jti TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id),
            expires_at INTEGER NOT NULL,
            revoked INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
        CREATE TABLE IF NOT EXISTS login_attempts (
            bucket_hash TEXT NOT NULL,
            failed_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_login_attempts_bucket_time
            ON login_attempts(bucket_hash, failed_at);
        CREATE TABLE IF NOT EXISTS security_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            severity TEXT NOT NULL,
            event_type TEXT NOT NULL,
            actor TEXT NOT NULL,
            action TEXT NOT NULL,
            resource TEXT NOT NULL,
            decision TEXT NOT NULL,
            reason TEXT NOT NULL,
            source TEXT NOT NULL DEFAULT 'submitted-event'
        );
        CREATE INDEX IF NOT EXISTS idx_security_events_created
            ON security_events(id DESC);
        CREATE TRIGGER IF NOT EXISTS security_events_no_update
            BEFORE UPDATE ON security_events
            BEGIN SELECT RAISE(ABORT, 'security events are append-only'); END;
        CREATE TRIGGER IF NOT EXISTS security_events_no_delete
            BEFORE DELETE ON security_events
            BEGIN SELECT RAISE(ABORT, 'security events are append-only'); END;
        """)


def _password_hash(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 310_000)
    return "pbkdf2_sha256$310000$%s$%s" % (
        base64.urlsafe_b64encode(salt).decode(),
        base64.urlsafe_b64encode(derived).decode(),
    )


def _verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, rounds, salt64, expected64 = encoded.split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        salt = base64.urlsafe_b64decode(salt64.encode())
        expected = base64.urlsafe_b64decode(expected64.encode())
        actual = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, int(rounds))
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def bootstrap_admin(bootstrap_token: str, username: str, password: str) -> dict[str, Any]:
    initialize()
    expected = os.getenv("AEGIS_BOOTSTRAP_TOKEN", "")
    if not expected or not hmac.compare_digest(bootstrap_token, expected):
        raise SecurityError("Bootstrap is not configured or the bootstrap token is invalid.")
    if not (3 <= len(username) <= 80) or not username.strip():
        raise SecurityError("Username must contain 3–80 characters.")
    if len(password) < 12 or len(password) > 128:
        raise SecurityError("Password must contain 12–128 characters.")
    with _connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        if count:
            raise SecurityError("Initial administrator already exists; bootstrap is permanently closed.")
        cursor = conn.execute(
            "INSERT INTO users(username,password_hash,role,created_at) VALUES(?,?,?,?)",
            (username.strip(), _password_hash(password), "admin",
             datetime.now(timezone.utc).isoformat()),
        )
        return {"id": cursor.lastrowid, "username": username.strip(), "role": "admin"}


def create_user(username: str, password: str, role: str) -> dict[str, Any]:
    initialize()
    if role not in ROLES:
        raise SecurityError("Role must be admin, operator, or auditor.")
    if not (3 <= len(username) <= 80) or not username.strip():
        raise SecurityError("Username must contain 3–80 characters.")
    if len(password) < 12 or len(password) > 128:
        raise SecurityError("Password must contain 12–128 characters.")
    try:
        with _connect() as conn:
            cur = conn.execute(
                "INSERT INTO users(username,password_hash,role,created_at) VALUES(?,?,?,?)",
                (username.strip(), _password_hash(password), role,
                 datetime.now(timezone.utc).isoformat()),
            )
            return {"id": cur.lastrowid, "username": username.strip(), "role": role}
    except sqlite3.IntegrityError as exc:
        raise SecurityError("Username already exists.") from exc


def login(username: str, password: str) -> dict[str, Any]:
    initialize()
    with _connect() as conn:
        user = conn.execute(
            "SELECT * FROM users WHERE username=? COLLATE NOCASE AND active=1",
            (username.strip(),),
        ).fetchone()
        if not user or not _verify_password(password, user["password_hash"]):
            raise SecurityError("Invalid username or password.")
        jti = secrets.token_urlsafe(24)
        expires = _now() + TOKEN_TTL_SECONDS
        conn.execute(
            "INSERT INTO sessions(jti,user_id,expires_at,created_at) VALUES(?,?,?,?)",
            (jti, user["id"], expires, datetime.now(timezone.utc).isoformat()),
        )
    payload = {"sub": user["id"], "username": user["username"],
               "role": user["role"], "jti": jti, "exp": expires}
    body = base64.urlsafe_b64encode(
        json.dumps(payload, separators=(",", ":")).encode()
    ).rstrip(b"=")
    signature = hmac.new(_secret(), body, hashlib.sha256).digest()
    token = body.decode() + "." + base64.urlsafe_b64encode(signature).rstrip(b"=").decode()
    return {"access_token": token, "token_type": "bearer",
            "expires_in": TOKEN_TTL_SECONDS,
            "user": {"id": user["id"], "username": user["username"], "role": user["role"]}}


def authenticate(token: str) -> dict[str, Any]:
    try:
        body_text, signature_text = token.split(".", 1)
        body = body_text.encode()
        signature = base64.urlsafe_b64decode(signature_text + "=" * (-len(signature_text) % 4))
        expected = hmac.new(_secret(), body, hashlib.sha256).digest()
        if not hmac.compare_digest(signature, expected):
            raise SecurityError("Invalid access token.")
        payload = json.loads(base64.urlsafe_b64decode(body_text + "=" * (-len(body_text) % 4)))
        if int(payload["exp"]) <= _now():
            raise SecurityError("Access token expired.")
        with _connect() as conn:
            row = conn.execute("""
                SELECT s.revoked, s.expires_at, u.active, u.username, u.role
                FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.jti=? AND u.id=?
            """, (payload["jti"], payload["sub"])).fetchone()
        if not row or row["revoked"] or not row["active"] or row["expires_at"] <= _now():
            raise SecurityError("Session is no longer active.")
        return {"id": payload["sub"], "username": row["username"], "role": row["role"],
                "jti": payload["jti"]}
    except SecurityError:
        raise
    except Exception as exc:
        raise SecurityError("Invalid access token.") from exc


def revoke_session(jti: str):
    initialize()
    with _connect() as conn:
        conn.execute("UPDATE sessions SET revoked=1 WHERE jti=?", (jti,))


def list_users():
    initialize()
    with _connect() as conn:
        rows = conn.execute(
            "SELECT id,username,role,active,created_at FROM users ORDER BY id"
        ).fetchall()
    return [dict(row) for row in rows]


def add_security_event(severity: str, event_type: str, actor: str,
                       action: str, resource: str, decision: str, reason: str,
                       source: str = "submitted-event"):
    initialize()
    with _connect() as conn:
        cur = conn.execute("""
            INSERT INTO security_events(created_at,severity,event_type,actor,action,
                resource,decision,reason,source)
            VALUES(?,?,?,?,?,?,?,?,?)
        """, (datetime.now(timezone.utc).isoformat(), severity, event_type, actor,
              action, resource, decision, reason, source))
        return cur.lastrowid


def list_security_events(limit: int = 50):
    initialize()
    with _connect() as conn:
        rows = conn.execute("""
            SELECT * FROM security_events ORDER BY id DESC LIMIT ?
        """, (limit,)).fetchall()
    return [dict(row) for row in rows]


def user_count() -> int:
    initialize()
    with _connect() as conn:
        return int(conn.execute("SELECT COUNT(*) FROM users").fetchone()[0])


def _login_bucket_hash(bucket_key: str) -> str:
    return hashlib.sha256(bucket_key.encode("utf-8")).hexdigest()


def login_failure_count(bucket_key: str, window_seconds: int = 300) -> int:
    """Count recent failed logins in SQLite so limits survive API restarts."""
    initialize()
    cutoff = _now() - window_seconds
    digest = _login_bucket_hash(bucket_key)
    with _connect() as conn:
        conn.execute("DELETE FROM login_attempts WHERE failed_at < ?", (cutoff,))
        row = conn.execute(
            "SELECT COUNT(*) FROM login_attempts WHERE bucket_hash=? AND failed_at>=?",
            (digest, cutoff),
        ).fetchone()
        return int(row[0])


def record_login_failure(bucket_key: str) -> None:
    initialize()
    digest = _login_bucket_hash(bucket_key)
    with _connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        now = _now()
        conn.execute("DELETE FROM login_attempts WHERE failed_at < ?", (now - 300,))
        conn.execute(
            "INSERT INTO login_attempts(bucket_hash, failed_at) VALUES(?, ?)",
            (digest, now),
        )


def clear_login_failures(bucket_key: str) -> None:
    initialize()
    digest = _login_bucket_hash(bucket_key)
    with _connect() as conn:
        conn.execute("DELETE FROM login_attempts WHERE bucket_hash=?", (digest,))

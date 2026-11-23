"""Persistent, single-use human approval ledger for AEGIS-X."""
from __future__ import annotations

import os
from backend.app.database import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = Path(os.getenv("AEGIS_DATA_DIR", str(PROJECT_ROOT / "data"))).expanduser()
APPROVAL_DB_PATH = Path(os.getenv("AEGIS_APPROVAL_DB", str(DATA_DIR / "aegis_approvals.db")))
SQLITE_TIMEOUT_SECONDS = 10
APPROVAL_TTL_MINUTES = 15


class ApprovalError(RuntimeError):
    """Raised when an approval request cannot safely proceed."""


def _connect():
    APPROVAL_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(
        str(APPROVAL_DB_PATH),
        timeout=SQLITE_TIMEOUT_SECONDS,
    )
    connection.row_factory = sqlite3.Row
    if not os.getenv("TURSO_DATABASE_URL", "").strip():
        connection.execute("PRAGMA busy_timeout = 10000")
    return connection


def initialize_approval_store():
    """Create approval tables during application startup."""
    connection = _connect()
    try:
        _initialize(connection)
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()

def _initialize(connection):
    connection.execute("""
        CREATE TABLE IF NOT EXISTS approval_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            requested_by TEXT NOT NULL,
            reviewed_by TEXT,
            review_decision TEXT,
            review_comment TEXT,
            reviewed_at TEXT,
            status TEXT NOT NULL CHECK (
                status IN (
                    'PENDING', 'PROCESSING', 'REJECTED',
                    'EXECUTED', 'BLOCKED', 'FAILED', 'EXPIRED',
                    'RECONCILIATION_REQUIRED'
                )
            ),
            tool_name TEXT NOT NULL,
            action TEXT NOT NULL,
            evidence_score REAL NOT NULL,
            policy_violation INTEGER NOT NULL,
            contradiction_detected INTEGER NOT NULL,
            original_audit_record_id INTEGER NOT NULL
        )
    """)
    connection.execute("""
        CREATE INDEX IF NOT EXISTS idx_approval_status_created
        ON approval_requests(status, created_at)
    """)

    connection.execute("""
        CREATE TABLE IF NOT EXISTS reconciliation_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            approval_id INTEGER NOT NULL UNIQUE,
            reviewer TEXT NOT NULL,
            outcome TEXT NOT NULL CHECK (
                outcome IN ('EXECUTED_CONFIRMED', 'NOT_EXECUTED_CONFIRMED')
            ),
            explanation TEXT NOT NULL,
            reconciled_at TEXT NOT NULL,
            FOREIGN KEY(approval_id) REFERENCES approval_requests(id)
        )
    """)
    connection.execute("""
        CREATE TRIGGER IF NOT EXISTS reconciliation_no_update
        BEFORE UPDATE ON reconciliation_records
        BEGIN SELECT RAISE(ABORT, 'Reconciliation records are immutable'); END
    """)
    connection.execute("""
        CREATE TRIGGER IF NOT EXISTS reconciliation_no_delete
        BEFORE DELETE ON reconciliation_records
        BEGIN SELECT RAISE(ABORT, 'Reconciliation records are immutable'); END
    """)


def create_pending_approval(
    *,
    requested_by,
    tool_name,
    action,
    evidence_score,
    policy_violation,
    contradiction_detected,
    original_audit_record_id,
):
    now = datetime.now(timezone.utc)
    created_at = now.isoformat()
    expires_at = (
        now + timedelta(minutes=APPROVAL_TTL_MINUTES)
    ).isoformat()

    connection = _connect()
    try:
        connection.execute("BEGIN IMMEDIATE")
        _initialize(connection)
        cursor = connection.execute("""
            INSERT INTO approval_requests (
                created_at, expires_at, requested_by, status,
                tool_name, action, evidence_score,
                policy_violation, contradiction_detected,
                original_audit_record_id
            )
            VALUES (?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?)
        """, (
            created_at,
            expires_at,
            str(requested_by),
            str(tool_name),
            str(action),
            float(evidence_score),
            int(bool(policy_violation)),
            int(bool(contradiction_detected)),
            int(original_audit_record_id),
        ))
        approval_id = cursor.lastrowid
        connection.commit()
        return get_approval(approval_id)
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def get_approval(approval_id):
    connection = _connect()
    try:
        _initialize(connection)
        row = connection.execute(
            "SELECT * FROM approval_requests WHERE id = ?",
            (approval_id,),
        ).fetchone()
        return dict(row) if row else None
    finally:
        connection.close()


def list_approvals(limit=50, status=None):
    if not isinstance(limit, int) or isinstance(limit, bool) or not 1 <= limit <= 500:
        raise ValueError("limit must be between 1 and 500")

    connection = _connect()
    try:
        _initialize(connection)
        if status:
            rows = connection.execute("""
                SELECT * FROM approval_requests
                WHERE status = ?
                ORDER BY id DESC LIMIT ?
            """, (status, limit)).fetchall()
        else:
            rows = connection.execute("""
                SELECT * FROM approval_requests
                ORDER BY id DESC LIMIT ?
            """, (limit,)).fetchall()
        return [dict(row) for row in rows]
    finally:
        connection.close()


def claim_approval_decision(approval_id, reviewer, decision, comment=""):
    decision = str(decision).strip().upper()
    if decision not in {"APPROVE", "REJECT"}:
        raise ApprovalError("Decision must be APPROVE or REJECT.")

    reviewer = str(reviewer).strip()
    comment = str(comment).strip()

    if not reviewer:
        raise ApprovalError("Authenticated reviewer identity is required.")

    connection = _connect()
    try:
        connection.execute("BEGIN IMMEDIATE")
        _initialize(connection)

        row = connection.execute(
            "SELECT * FROM approval_requests WHERE id = ?",
            (approval_id,),
        ).fetchone()

        if row is None:
            raise ApprovalError("Approval request was not found.")

        request = dict(row)

        if request["status"] != "PENDING":
            raise ApprovalError(
                f"Approval request is not pending (status: {request['status']})."
            )

        if reviewer.casefold() == request["requested_by"].casefold():
            raise ApprovalError(
                "The requester cannot approve or reject their own request."
            )

        expires_at = datetime.fromisoformat(request["expires_at"])
        if datetime.now(timezone.utc) >= expires_at:
            connection.execute(
                "UPDATE approval_requests SET status = 'EXPIRED' WHERE id = ?",
                (approval_id,),
            )
            connection.commit()
            raise ApprovalError("Approval request has expired.")

        cursor = connection.execute("""
            UPDATE approval_requests
            SET status = 'PROCESSING',
                reviewed_by = ?,
                review_decision = ?,
                review_comment = ?,
                reviewed_at = ?
            WHERE id = ? AND status = 'PENDING'
        """, (
            reviewer,
            decision,
            comment,
            datetime.now(timezone.utc).isoformat(),
            approval_id,
        ))

        if cursor.rowcount != 1:
            raise ApprovalError("Approval request was already claimed.")

        connection.commit()
        return get_approval(approval_id)

    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def finish_approval(approval_id, status):
    status = str(status).strip().upper()
    allowed = {"REJECTED", "EXECUTED", "BLOCKED", "FAILED", "RECONCILIATION_REQUIRED"}

    if status not in allowed:
        raise ApprovalError("Invalid final approval status.")

    connection = _connect()
    try:
        connection.execute("BEGIN IMMEDIATE")
        cursor = connection.execute("""
            UPDATE approval_requests
            SET status = ?
            WHERE id = ? AND status = 'PROCESSING'
        """, (status, approval_id))

        if cursor.rowcount != 1:
            raise ApprovalError(
                "Approval request is not in a processable state."
            )

        connection.commit()
        return get_approval(approval_id)
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def list_reconciliation_required(limit=100):
    connection = _connect()
    try:
        _initialize(connection)
        rows = connection.execute("""
            SELECT a.* FROM approval_requests a
            LEFT JOIN reconciliation_records r ON r.approval_id = a.id
            WHERE a.status = 'RECONCILIATION_REQUIRED'
              AND r.id IS NULL
            ORDER BY a.id DESC LIMIT ?
        """, (limit,)).fetchall()
        return [dict(row) for row in rows]
    finally:
        connection.close()


def record_reconciliation(approval_id, reviewer, outcome, explanation):
    reviewer = str(reviewer).strip()
    outcome = str(outcome).strip().upper()
    explanation = str(explanation).strip()

    if not reviewer:
        raise ApprovalError("Authenticated reviewer identity is required.")
    if outcome not in {"EXECUTED_CONFIRMED", "NOT_EXECUTED_CONFIRMED"}:
        raise ApprovalError("Invalid reconciliation outcome.")
    if not explanation:
        raise ApprovalError("A written reconciliation explanation is required.")

    connection = _connect()
    try:
        connection.execute("BEGIN IMMEDIATE")
        _initialize(connection)
        approval = connection.execute(
            "SELECT * FROM approval_requests WHERE id = ?",
            (approval_id,),
        ).fetchone()

        if approval is None:
            raise ApprovalError("Approval request was not found.")
        if approval["status"] != "RECONCILIATION_REQUIRED":
            raise ApprovalError("Approval is not awaiting reconciliation.")
        if reviewer.casefold() == approval["requested_by"].casefold():
            raise ApprovalError("The requester cannot reconcile their own request.")

        cursor = connection.execute("""
            INSERT INTO reconciliation_records (
                approval_id, reviewer, outcome, explanation, reconciled_at
            ) VALUES (?, ?, ?, ?, ?)
        """, (
            approval_id,
            reviewer,
            outcome,
            explanation,
            datetime.now(timezone.utc).isoformat(),
        ))
        connection.commit()
        row = connection.execute(
            "SELECT * FROM reconciliation_records WHERE id = ?",
            (cursor.lastrowid,),
        ).fetchone()
        return dict(row)
    except sqlite3.IntegrityError as exc:
        connection.rollback()
        raise ApprovalError(
            "This approval has already been reconciled."
        ) from exc
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()



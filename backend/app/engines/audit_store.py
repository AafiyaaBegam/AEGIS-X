
import hashlib
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[3]
AUDIT_DB_PATH = PROJECT_ROOT / "data" / "aegis_audit.db"
SQLITE_TIMEOUT_SECONDS = 10

FIELDS = (
    "created_at",
    "action",
    "evidence_score",
    "policy_violation",
    "contradiction_detected",
    "risk_score",
    "decision",
    "reasons_json",
)


class AuditIntegrityError(RuntimeError):
    """Raised when the existing audit chain cannot be trusted."""


def _canonical_payload(record, previous_hash):
    return {
        "previous_hash": previous_hash or "",
        "created_at": str(record["created_at"]),
        "action": str(record["action"]),
        "evidence_score": float(record["evidence_score"]),
        "policy_violation": int(record["policy_violation"]),
        "contradiction_detected": int(record["contradiction_detected"]),
        "risk_score": float(record["risk_score"]),
        "decision": str(record["decision"]),
        "reasons_json": str(record["reasons_json"]),
    }


def _calculate_hash(record, previous_hash):
    payload = _canonical_payload(record, previous_hash)
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _connect():
    connection = sqlite3.connect(
        str(AUDIT_DB_PATH),
        timeout=SQLITE_TIMEOUT_SECONDS,
    )
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA busy_timeout = 10000")
    return connection


def _initialize_schema(connection):
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS audit_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            action TEXT NOT NULL,
            evidence_score REAL NOT NULL,
            policy_violation INTEGER NOT NULL,
            contradiction_detected INTEGER NOT NULL,
            risk_score REAL NOT NULL,
            decision TEXT NOT NULL,
            reasons_json TEXT NOT NULL,
            record_hash TEXT,
            previous_hash TEXT
        )
        """
    )

    columns = {
        row["name"]
        for row in connection.execute("PRAGMA table_info(audit_records)")
    }

    if "record_hash" not in columns:
        connection.execute(
            "ALTER TABLE audit_records ADD COLUMN record_hash TEXT"
        )

    if "previous_hash" not in columns:
        connection.execute(
            "ALTER TABLE audit_records ADD COLUMN previous_hash TEXT"
        )


def _verify_connection(connection):
    """Verify an existing chain using the supplied connection."""
    table = connection.execute(
        """
        SELECT name FROM sqlite_master
        WHERE type = 'table' AND name = 'audit_records'
        """
    ).fetchone()

    if table is None:
        return {
            "valid": False,
            "checked_records": 0,
            "errors": ["The audit_records table is missing"],
        }

    columns = {
        row["name"]
        for row in connection.execute("PRAGMA table_info(audit_records)")
    }

    required_columns = set(FIELDS) | {
        "id", "record_hash", "previous_hash"
    }
    missing_columns = sorted(required_columns - columns)

    if missing_columns:
        return {
            "valid": False,
            "checked_records": 0,
            "errors": [
                "Missing required columns: " + ", ".join(missing_columns)
            ],
        }

    rows = connection.execute(
        "SELECT * FROM audit_records ORDER BY id"
    ).fetchall()

    previous_hash = ""
    errors = []

    for index, row in enumerate(rows):
        record = dict(row)
        record_id = record["id"]
        stored_previous_hash = record["previous_hash"] or ""
        stored_hash = record["record_hash"] or ""

        if not stored_hash:
            errors.append(f"Record {record_id}: missing record hash")

        if index > 0 and not stored_previous_hash:
            errors.append(f"Record {record_id}: missing previous hash")

        if stored_previous_hash != previous_hash:
            errors.append(f"Record {record_id}: previous hash mismatch")

        expected_hash = _calculate_hash(record, previous_hash)

        if stored_hash and stored_hash != expected_hash:
            errors.append(f"Record {record_id}: record hash mismatch")

        previous_hash = stored_hash

    return {
        "valid": not errors,
        "checked_records": len(rows),
        "errors": errors,
    }


def record_decision(
    action,
    evidence_score,
    policy_violation,
    contradiction_detected,
    result,
):
    """Verify the existing chain before appending a new decision."""
    AUDIT_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = _connect()

    try:
        connection.execute("BEGIN IMMEDIATE")
        _initialize_schema(connection)

        verification = _verify_connection(connection)

        if not verification["valid"]:
            raise AuditIntegrityError(
                "Audit chain integrity check failed. "
                "New decisions are blocked until the audit issue is investigated."
            )

        previous = connection.execute(
            """
            SELECT record_hash FROM audit_records
            ORDER BY id DESC LIMIT 1
            """
        ).fetchone()

        previous_hash = (previous["record_hash"] or "") if previous else ""

        record = {
            "created_at": datetime.now(timezone.utc).isoformat(),
            "action": str(action),
            "evidence_score": float(evidence_score),
            "policy_violation": int(bool(policy_violation)),
            "contradiction_detected": int(bool(contradiction_detected)),
            "risk_score": float(result["risk_score"]),
            "decision": str(result["decision"]),
            "reasons_json": json.dumps(
                result["reasons"], separators=(",", ":")
            ),
        }

        cursor = connection.execute(
            """
            INSERT INTO audit_records (
                created_at, action, evidence_score,
                policy_violation, contradiction_detected,
                risk_score, decision, reasons_json,
                previous_hash, record_hash
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
            """,
            (
                record["created_at"],
                record["action"],
                record["evidence_score"],
                record["policy_violation"],
                record["contradiction_detected"],
                record["risk_score"],
                record["decision"],
                record["reasons_json"],
                previous_hash,
            ),
        )

        record_id = cursor.lastrowid
        saved_record = connection.execute(
            "SELECT * FROM audit_records WHERE id = ?",
            (record_id,),
        ).fetchone()

        record_hash = _calculate_hash(dict(saved_record), previous_hash)

        connection.execute(
            "UPDATE audit_records SET record_hash = ? WHERE id = ?",
            (record_hash, record_id),
        )

        connection.commit()

    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def verify_audit_chain():
    """Verify without creating, migrating, repairing, or changing data."""
    if not AUDIT_DB_PATH.exists():
        return {
            "valid": True,
            "checked_records": 0,
            "errors": [],
        }

    connection = _connect()
    try:
        return _verify_connection(connection)
    finally:
        connection.close()


def list_audit_records(limit=50):
    """Return recent audit records without changing the database."""
    if not isinstance(limit, int) or isinstance(limit, bool) or limit < 1:
        raise ValueError("limit must be a positive integer")

    if not AUDIT_DB_PATH.exists():
        return []

    connection = _connect()
    try:
        table = connection.execute(
            """
            SELECT name FROM sqlite_master
            WHERE type = 'table' AND name = 'audit_records'
            """
        ).fetchone()

        if table is None:
            return []

        rows = connection.execute(
            """
            SELECT * FROM audit_records
            ORDER BY id DESC LIMIT ?
            """,
            (limit,),
        ).fetchall()

        records = []

        for row in rows:
            record = dict(row)
            record["policy_violation"] = bool(
                record["policy_violation"]
            )
            record["contradiction_detected"] = bool(
                record["contradiction_detected"]
            )
            record["reasons"] = json.loads(
                record.pop("reasons_json")
            )
            records.append(record)

        return records
    finally:
        connection.close()

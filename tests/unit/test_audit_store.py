
import sqlite3
from concurrent.futures import ThreadPoolExecutor

import pytest

from backend.app.engines import audit_store


def add_sample_record(action="read application status"):
    audit_store.record_decision(
        action=action,
        evidence_score=95,
        policy_violation=False,
        contradiction_detected=False,
        result={
            "risk_score": 0.0,
            "decision": "ALLOW",
            "reasons": [],
        },
    )


def test_new_audit_chain_is_valid(tmp_path, monkeypatch):
    monkeypatch.setattr(
        audit_store, "AUDIT_DB_PATH", tmp_path / "audit.db"
    )

    add_sample_record()
    add_sample_record()

    result = audit_store.verify_audit_chain()

    assert result["valid"] is True
    assert result["checked_records"] == 2
    assert result["errors"] == []


def test_modified_audit_record_is_detected(tmp_path, monkeypatch):
    db_path = tmp_path / "audit.db"
    monkeypatch.setattr(audit_store, "AUDIT_DB_PATH", db_path)

    add_sample_record()

    connection = sqlite3.connect(str(db_path))
    try:
        connection.execute(
            "UPDATE audit_records SET action = ? WHERE id = 1",
            ("tampered action",),
        )
        connection.commit()
    finally:
        connection.close()

    result = audit_store.verify_audit_chain()

    assert result["valid"] is False
    assert any("hash mismatch" in error for error in result["errors"])


def test_tampered_chain_blocks_new_records(tmp_path, monkeypatch):
    db_path = tmp_path / "tampered.db"
    monkeypatch.setattr(audit_store, "AUDIT_DB_PATH", db_path)

    add_sample_record()

    connection = sqlite3.connect(str(db_path))
    try:
        connection.execute(
            "UPDATE audit_records SET action = ? WHERE id = 1",
            ("tampered action",),
        )
        connection.commit()
    finally:
        connection.close()

    with pytest.raises(audit_store.AuditIntegrityError):
        add_sample_record("new action after tampering")

    connection = sqlite3.connect(str(db_path))
    try:
        count = connection.execute(
            "SELECT COUNT(*) FROM audit_records"
        ).fetchone()[0]
    finally:
        connection.close()

    assert count == 1


def test_healthy_chain_allows_new_records(tmp_path, monkeypatch):
    monkeypatch.setattr(
        audit_store, "AUDIT_DB_PATH", tmp_path / "healthy.db"
    )

    add_sample_record("first action")
    add_sample_record("second action")

    result = audit_store.verify_audit_chain()

    assert result["valid"] is True
    assert result["checked_records"] == 2
    assert result["errors"] == []


def test_verification_does_not_repair_legacy_records(tmp_path, monkeypatch):
    db_path = tmp_path / "legacy.db"
    monkeypatch.setattr(audit_store, "AUDIT_DB_PATH", db_path)

    connection = sqlite3.connect(str(db_path))
    try:
        connection.execute(
            """
            CREATE TABLE audit_records (
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
        connection.execute(
            """
            INSERT INTO audit_records (
                created_at, action, evidence_score,
                policy_violation, contradiction_detected,
                risk_score, decision, reasons_json,
                record_hash, previous_hash
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)
            """,
            (
                "2026-01-01T00:00:00+00:00",
                "legacy action",
                95.0,
                0,
                0,
                0.0,
                "ALLOW",
                "[]",
            ),
        )
        connection.commit()

        before = connection.execute(
            """
            SELECT id, action, record_hash, previous_hash
            FROM audit_records
            """
        ).fetchall()
    finally:
        connection.close()

    result = audit_store.verify_audit_chain()

    connection = sqlite3.connect(str(db_path))
    try:
        after = connection.execute(
            """
            SELECT id, action, record_hash, previous_hash
            FROM audit_records
            """
        ).fetchall()
    finally:
        connection.close()

    assert result["valid"] is False
    assert any("missing record hash" in error for error in result["errors"])
    assert before == after


def test_verifying_nonexistent_database_does_not_create_it(
    tmp_path, monkeypatch
):
    db_path = tmp_path / "not-created.db"
    monkeypatch.setattr(audit_store, "AUDIT_DB_PATH", db_path)

    result = audit_store.verify_audit_chain()

    assert result == {
        "valid": True,
        "checked_records": 0,
        "errors": [],
    }
    assert not db_path.exists()


def test_concurrent_writes_preserve_audit_chain(tmp_path, monkeypatch):
    monkeypatch.setattr(
        audit_store, "AUDIT_DB_PATH", tmp_path / "concurrent.db"
    )

    total_records = 20

    with ThreadPoolExecutor(max_workers=8) as executor:
        list(
            executor.map(
                lambda index: add_sample_record(
                    f"concurrent action {index}"
                ),
                range(total_records),
            )
        )

    result = audit_store.verify_audit_chain()

    assert result["valid"] is True
    assert result["checked_records"] == total_records
    assert result["errors"] == []


def test_empty_existing_audit_table_is_valid(tmp_path, monkeypatch):
    db_path = tmp_path / "empty.db"
    monkeypatch.setattr(audit_store, "AUDIT_DB_PATH", db_path)

    connection = sqlite3.connect(str(db_path))
    try:
        connection.execute(
            """
            CREATE TABLE audit_records (
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
        connection.commit()
    finally:
        connection.close()

    result = audit_store.verify_audit_chain()

    assert result["valid"] is True
    assert result["checked_records"] == 0
    assert result["errors"] == []

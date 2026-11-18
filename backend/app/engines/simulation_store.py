"""Separate append-only storage for non-executing plan simulations."""

from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[3]
SIMULATION_DB_PATH = Path(
    os.getenv(
        "AEGIS_SIMULATION_DB",
        str(PROJECT_ROOT / "data" / "aegis_simulation.db"),
    )
)


def _connect():
    SIMULATION_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(str(SIMULATION_DB_PATH), timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA busy_timeout = 10000")
    connection.execute("PRAGMA journal_mode = WAL")
    return connection


def initialize():
    with _connect() as connection:
        connection.executescript("""
            CREATE TABLE IF NOT EXISTS simulation_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL,
                actions_json TEXT NOT NULL,
                decision TEXT NOT NULL,
                overall_risk_score REAL NOT NULL,
                result_json TEXT NOT NULL,
                execution_performed INTEGER NOT NULL DEFAULT 0
                    CHECK(execution_performed = 0)
            );

            CREATE INDEX IF NOT EXISTS idx_simulation_records_created
                ON simulation_records(id DESC);

            CREATE TRIGGER IF NOT EXISTS simulation_records_no_update
                BEFORE UPDATE ON simulation_records
                BEGIN
                    SELECT RAISE(ABORT, 'simulation records are append-only');
                END;

            CREATE TRIGGER IF NOT EXISTS simulation_records_no_delete
                BEFORE DELETE ON simulation_records
                BEGIN
                    SELECT RAISE(ABORT, 'simulation records are append-only');
                END;
        """)


def record_simulation(actions: list[str], result: dict[str, Any]) -> int:
    """Persist one completed plan preview, never as an executed action."""
    initialize()

    if result.get("execution_performed") is not False:
        raise ValueError("Simulation history cannot store executed actions.")

    created_at = datetime.now(timezone.utc).isoformat()
    actions_json = json.dumps(actions, separators=(",", ":"))
    result_json = json.dumps(result, separators=(",", ":"), sort_keys=True)

    with _connect() as connection:
        cursor = connection.execute(
            """
            INSERT INTO simulation_records (
                created_at,
                actions_json,
                decision,
                overall_risk_score,
                result_json,
                execution_performed
            )
            VALUES (?, ?, ?, ?, ?, 0)
            """,
            (
                created_at,
                actions_json,
                str(result["decision"]),
                float(result["overall_risk_score"]),
                result_json,
            ),
        )
        return int(cursor.lastrowid)


def list_simulations(limit: int = 50) -> list[dict[str, Any]]:
    """Return recent simulation previews without modifying stored records."""
    if (
        not isinstance(limit, int)
        or isinstance(limit, bool)
        or not 1 <= limit <= 500
    ):
        raise ValueError("limit must be an integer between 1 and 500.")

    if not SIMULATION_DB_PATH.exists():
        return []

    with _connect() as connection:
        table = connection.execute(
            """
            SELECT name FROM sqlite_master
            WHERE type = 'table' AND name = 'simulation_records'
            """
        ).fetchone()

        if table is None:
            return []

        rows = connection.execute(
            """
            SELECT * FROM simulation_records
            ORDER BY id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()

    records = []
    for row in rows:
        record = dict(row)
        record["actions"] = json.loads(record.pop("actions_json"))
        record["result"] = json.loads(record.pop("result_json"))
        record["execution_performed"] = False
        records.append(record)

    return records

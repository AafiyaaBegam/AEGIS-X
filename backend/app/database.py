
"""Shared SQLite/Turso database compatibility layer."""
from __future__ import annotations

import importlib
import os
import sqlite3 as _sqlite3


def _use_turso() -> bool:
    environment = os.getenv("AEGIS_ENV", "development").strip().lower()
    return (
        environment not in {"test", "testing"}
        and bool(os.getenv("TURSO_DATABASE_URL", "").strip())
    )


def _turso_driver():
    try:
        return importlib.import_module("turso_serverless")
    except ImportError as exc:
        raise RuntimeError(
            "Turso is configured but turso_serverless is not installed."
        ) from exc


class _DatabaseCompat:
    @property
    def Row(self):
        return _turso_driver().Row if _use_turso() else _sqlite3.Row

    @property
    def IntegrityError(self):
        return (
            _turso_driver().IntegrityError
            if _use_turso()
            else _sqlite3.IntegrityError
        )

    def connect(self, database=None, timeout=5.0, **kwargs):
        environment = os.getenv("AEGIS_ENV", "development").strip().lower()

        if environment in {"test", "testing"}:
            return _sqlite3.connect(database, timeout=timeout, **kwargs)

        url = os.getenv("TURSO_DATABASE_URL", "").strip()

        if not url:
            if environment in {"production", "prod"}:
                raise RuntimeError(
                    "Production requires TURSO_DATABASE_URL; refusing local SQLite fallback."
                )
            return _sqlite3.connect(database, timeout=timeout, **kwargs)

        token = os.getenv("TURSO_AUTH_TOKEN", "").strip()
        if not token:
            raise RuntimeError(
                "TURSO_DATABASE_URL is set but TURSO_AUTH_TOKEN is missing."
            )

        driver = _turso_driver()
        allowed = {"isolation_level"}
        unexpected = set(kwargs) - allowed
        if unexpected:
            raise TypeError(
                "Unsupported Turso connection options: "
                + ", ".join(sorted(unexpected))
            )

        return driver.connect(
            url,
            auth_token=token,
            isolation_level=kwargs.get("isolation_level", "DEFERRED"),
        )


sqlite3 = _DatabaseCompat()

import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.runtime_config import (
    RuntimeConfigurationError,
    validate_runtime_configuration,
)


def test_development_mode_allows_authentication_off():
    result = validate_runtime_configuration({
        "AEGIS_ENV": "development",
        "AEGIS_AUTH_REQUIRED": "0",
        "AEGIS_TOKEN_TTL_SECONDS": "3600",
    })
    assert result["environment"] == "development"
    assert result["auth_required"] is False


def test_production_rejects_authentication_disabled():
    with pytest.raises(RuntimeConfigurationError, match="AUTH_REQUIRED"):
        validate_runtime_configuration({
            "AEGIS_ENV": "production",
            "AEGIS_AUTH_REQUIRED": "0",
            "AEGIS_TOKEN_SECRET": "s" * 40,
            "AEGIS_BOOTSTRAP_TOKEN": "b" * 40,
        })


def test_production_rejects_missing_token_secret():
    with pytest.raises(RuntimeConfigurationError, match="TOKEN_SECRET"):
        validate_runtime_configuration({
            "AEGIS_ENV": "production",
            "AEGIS_AUTH_REQUIRED": "1",
            "AEGIS_BOOTSTRAP_TOKEN": "b" * 40,
        })


def test_production_rejects_weak_bootstrap_token():
    with pytest.raises(RuntimeConfigurationError, match="BOOTSTRAP_TOKEN"):
        validate_runtime_configuration({
            "AEGIS_ENV": "production",
            "AEGIS_AUTH_REQUIRED": "1",
            "AEGIS_TOKEN_SECRET": "s" * 40,
            "AEGIS_BOOTSTRAP_TOKEN": "short",
        })


def test_production_accepts_valid_configuration():
    result = validate_runtime_configuration({
        "AEGIS_ENV": "production",
        "AEGIS_AUTH_REQUIRED": "true",
        "AEGIS_TOKEN_SECRET": "s" * 40,
        "AEGIS_BOOTSTRAP_TOKEN": "b" * 40,
        "AEGIS_TOKEN_TTL_SECONDS": "3600",
    })
    assert result["environment"] == "production"
    assert result["auth_required"] is True


def test_invalid_environment_is_rejected():
    with pytest.raises(RuntimeConfigurationError, match="AEGIS_ENV"):
        validate_runtime_configuration({"AEGIS_ENV": "unknown"})


def test_invalid_token_ttl_is_rejected():
    with pytest.raises(RuntimeConfigurationError, match="integer"):
        validate_runtime_configuration({
            "AEGIS_ENV": "development",
            "AEGIS_TOKEN_TTL_SECONDS": "not-a-number",
        })


def test_app_startup_fails_closed_in_production(monkeypatch):
    monkeypatch.setenv("AEGIS_ENV", "production")
    monkeypatch.setenv("AEGIS_AUTH_REQUIRED", "0")
    monkeypatch.setenv("AEGIS_TOKEN_SECRET", "s" * 40)
    monkeypatch.setenv("AEGIS_BOOTSTRAP_TOKEN", "b" * 40)

    with pytest.raises(RuntimeConfigurationError):
        with TestClient(app):
            pass

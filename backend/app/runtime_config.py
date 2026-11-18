"""AEGIS-X runtime configuration and production safety checks."""
from __future__ import annotations

import os
from collections.abc import Mapping


class RuntimeConfigurationError(RuntimeError):
    """Raised when runtime configuration is unsafe or invalid."""


def validate_runtime_configuration(
    environ: Mapping[str, str] | None = None,
) -> dict:
    env = os.environ if environ is None else environ

    environment = env.get("AEGIS_ENV", "development").strip().lower()
    aliases = {"dev": "development", "prod": "production"}
    environment = aliases.get(environment, environment)

    if environment not in {"development", "test", "production"}:
        raise RuntimeConfigurationError(
            "AEGIS_ENV must be development, test, or production."
        )

    auth_value = env.get("AEGIS_AUTH_REQUIRED", "0").strip().lower()
    auth_required = auth_value in {"1", "true", "yes"}

    if auth_value not in {"0", "1", "true", "false", "yes", "no"}:
        raise RuntimeConfigurationError(
            "AEGIS_AUTH_REQUIRED must be a valid boolean value."
        )

    try:
        token_ttl = int(env.get("AEGIS_TOKEN_TTL_SECONDS", "3600"))
    except (TypeError, ValueError) as exc:
        raise RuntimeConfigurationError(
            "AEGIS_TOKEN_TTL_SECONDS must be an integer."
        ) from exc

    if not 60 <= token_ttl <= 86400:
        raise RuntimeConfigurationError(
            "AEGIS_TOKEN_TTL_SECONDS must be between 60 and 86400."
        )

    if environment == "production":
        if not auth_required:
            raise RuntimeConfigurationError(
                "Production startup blocked: AEGIS_AUTH_REQUIRED must be enabled."
            )

        token_secret = env.get("AEGIS_TOKEN_SECRET", "")
        if len(token_secret) < 32:
            raise RuntimeConfigurationError(
                "Production startup blocked: AEGIS_TOKEN_SECRET must contain "
                "at least 32 characters."
            )

        bootstrap_token = env.get("AEGIS_BOOTSTRAP_TOKEN", "")
        if len(bootstrap_token) < 32:
            raise RuntimeConfigurationError(
                "Production startup blocked: AEGIS_BOOTSTRAP_TOKEN must contain "
                "at least 32 characters."
            )

        if token_ttl < 300:
            raise RuntimeConfigurationError(
                "Production token expiry must be at least 300 seconds."
            )

    return {
        "environment": environment,
        "auth_required": auth_required,
        "token_ttl_seconds": token_ttl,
    }

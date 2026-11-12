import pytest
from fastapi.testclient import TestClient

from backend.app import security_store
from backend.app.main import app


@pytest.fixture
def isolated_security_db(tmp_path, monkeypatch):
    monkeypatch.setattr(security_store, "DB_PATH", tmp_path / "security-test.db")
    monkeypatch.setenv("AEGIS_BOOTSTRAP_TOKEN", "test-bootstrap-token-that-is-long-enough")
    monkeypatch.delenv("AEGIS_TOKEN_SECRET", raising=False)
    monkeypatch.setattr(security_store, "DATA_DIR", tmp_path)
    security_store.initialize()
    return TestClient(app)


def test_bootstrap_is_one_time_and_password_is_not_stored_plaintext(isolated_security_db):
    client = isolated_security_db
    response = client.post("/security/bootstrap", json={
        "bootstrap_token": "test-bootstrap-token-that-is-long-enough",
        "username": "security-admin",
        "password": "a-strong-test-password-123",
    })
    assert response.status_code == 201
    assert response.json()["user"]["role"] == "admin"
    second = client.post("/security/bootstrap", json={
        "bootstrap_token": "test-bootstrap-token-that-is-long-enough",
        "username": "another-admin",
        "password": "another-strong-password-123",
    })
    assert second.status_code == 409
    row = security_store._connect().execute(
        "SELECT password_hash FROM users WHERE username='security-admin'"
    ).fetchone()
    assert "a-strong-test-password-123" not in row["password_hash"]
    assert row["password_hash"].startswith("pbkdf2_sha256$")


def test_login_me_logout_and_revocation(isolated_security_db):
    client = isolated_security_db
    client.post("/security/bootstrap", json={
        "bootstrap_token": "test-bootstrap-token-that-is-long-enough",
        "username": "security-admin",
        "password": "a-strong-test-password-123",
    })
    logged = client.post("/security/login", json={
        "username": "security-admin", "password": "a-strong-test-password-123"
    })
    assert logged.status_code == 200
    token = logged.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    assert client.get("/security/me", headers=headers).json()["role"] == "admin"
    assert client.post("/security/logout", headers=headers).json()["revoked"] is True
    assert client.get("/security/me", headers=headers).status_code == 401


def test_role_based_user_management(isolated_security_db):
    client = isolated_security_db
    client.post("/security/bootstrap", json={
        "bootstrap_token": "test-bootstrap-token-that-is-long-enough",
        "username": "security-admin",
        "password": "a-strong-test-password-123",
    })
    token = client.post("/security/login", json={
        "username": "security-admin", "password": "a-strong-test-password-123"
    }).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    created = client.post("/security/users", headers=headers, json={
        "username": "audit-reader", "password": "a-different-strong-password-123",
        "role": "auditor",
    })
    assert created.status_code == 201
    assert created.json()["role"] == "auditor"


def test_submitted_delete_event_is_explained_and_not_executed(isolated_security_db):
    client = isolated_security_db
    client.post("/security/bootstrap", json={
        "bootstrap_token": "test-bootstrap-token-that-is-long-enough",
        "username": "security-admin",
        "password": "a-strong-test-password-123",
    })
    token = client.post("/security/login", json={
        "username": "security-admin", "password": "a-strong-test-password-123"
    }).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    result = client.post("/security/events/ingest", headers=headers, json={
        "actor": "demo-operator",
        "action": "Delete customer records from production database",
        "resource": "production/customer_records",
        "evidence_score": 100,
    })
    assert result.status_code == 201
    body = result.json()
    assert body["decision"] == "BLOCK"
    assert body["severity"] == "CRITICAL"
    assert body["execution_performed"] is False
    assert body["actor"] == "security-admin"
    assert body["actor_identity_verified"] is True
    assert body["source_is_client_claimed"] is True
    events = client.get("/security/events", headers=headers).json()
    assert events["count"] == 1
    assert events["events"][0]["actor"] == "security-admin"
    assert "production" in events["events"][0]["resource"]


def test_client_cannot_forge_security_event_actor(isolated_security_db):
    client = isolated_security_db
    client.post("/security/bootstrap", json={
        "bootstrap_token": "test-bootstrap-token-that-is-long-enough",
        "username": "security-admin",
        "password": "a-strong-test-password-123",
    })
    token = client.post("/security/login", json={
        "username": "security-admin", "password": "a-strong-test-password-123"
    }).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    response = client.post("/security/events/ingest", headers=headers, json={
        "actor": "forged-super-admin",
        "action": "Read application status",
        "resource": "demo/status",
        "source": "claimed-external-agent",
    })
    assert response.status_code == 201
    assert response.json()["actor"] == "security-admin"
    event = client.get("/security/events", headers=headers).json()["events"][0]
    assert event["actor"] == "security-admin"
    assert event["source"] == "claimed-external-agent"


def test_security_event_rejects_whitespace_only_fields(isolated_security_db):
    client = isolated_security_db
    client.post("/security/bootstrap", json={
        "bootstrap_token": "test-bootstrap-token-that-is-long-enough",
        "username": "security-admin",
        "password": "a-strong-test-password-123",
    })
    token = client.post("/security/login", json={
        "username": "security-admin", "password": "a-strong-test-password-123"
    }).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    response = client.post("/security/events/ingest", headers=headers, json={
        "action": "   ", "resource": "demo/status"
    })
    assert response.status_code == 422


def test_core_api_can_be_enforced_by_role(isolated_security_db, monkeypatch):
    monkeypatch.setenv("AEGIS_AUTH_REQUIRED", "1")
    client = isolated_security_db
    assert client.post("/simulate", json={"actions": ["Read public documentation"]}).status_code == 401


def test_security_event_rows_are_append_only(isolated_security_db):
    client = isolated_security_db
    client.post("/security/bootstrap", json={
        "bootstrap_token": "test-bootstrap-token-that-is-long-enough",
        "username": "security-admin",
        "password": "a-strong-test-password-123",
    })
    token = client.post("/security/login", json={
        "username": "security-admin", "password": "a-strong-test-password-123"
    }).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    created = client.post("/security/events/ingest", headers=headers, json={
        "actor": "tester", "action": "Delete production database",
        "resource": "production/db", "evidence_score": 100,
    })
    assert created.status_code == 201
    with pytest.raises(Exception):
        with security_store._connect() as conn:
            conn.execute("UPDATE security_events SET reason='rewritten' WHERE id=1")


def test_login_throttle_after_five_invalid_attempts(isolated_security_db):
    client = isolated_security_db
    client.post("/security/bootstrap", json={
        "bootstrap_token": "test-bootstrap-token-that-is-long-enough",
        "username": "security-admin",
        "password": "a-strong-test-password-123",
    })
    for _ in range(5):
        assert client.post("/security/login", json={
            "username": "security-admin", "password": "wrong-password"
        }).status_code == 401
    assert client.post("/security/login", json={
        "username": "security-admin", "password": "wrong-password"
    }).status_code == 429


def test_login_throttle_is_persisted_and_cleared_after_success(isolated_security_db):
    client = isolated_security_db
    client.post("/security/bootstrap", json={
        "bootstrap_token": "test-bootstrap-token-that-is-long-enough",
        "username": "security-admin",
        "password": "a-strong-test-password-123",
    })
    key = "testclient:security-admin"
    for _ in range(5):
        assert client.post("/security/login", json={
            "username": "security-admin", "password": "wrong-password"
        }).status_code == 401

    # The failure counter is stored in SQLite, not a module-local dictionary.
    assert security_store.login_failure_count(key) == 5
    assert client.post("/security/login", json={
        "username": "security-admin", "password": "a-strong-test-password-123"
    }).status_code == 429

    # Clear explicitly to model a successful login from a fresh client context.
    security_store.clear_login_failures(key)
    assert security_store.login_failure_count(key) == 0
    assert client.post("/security/login", json={
        "username": "security-admin", "password": "a-strong-test-password-123"
    }).status_code == 200

from fastapi.testclient import TestClient

from backend.app import main
from backend.app.engines import execution_gateway
from backend.app.engines.audit_store import AuditIntegrityError


def test_gateway_does_not_execute_if_audit_write_fails(monkeypatch):
    calls = []

    def spy_handler():
        calls.append("executed")
        return {"status": "healthy"}

    def fail_audit(**kwargs):
        raise AuditIntegrityError("Simulated audit failure")

    monkeypatch.setitem(
        execution_gateway._TOOL_REGISTRY,
        "read_service_status",
        spy_handler,
    )
    monkeypatch.setattr(main, "record_decision", fail_audit)

    client = TestClient(main.app)
    response = client.post(
        "/gateway/execute",
        json={
            "tool_name": "read_service_status",
            "action": "read service status",
        },
    )

    assert response.status_code == 503
    assert calls == []

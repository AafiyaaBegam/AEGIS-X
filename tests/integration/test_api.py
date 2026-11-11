from fastapi.testclient import TestClient

from backend.app.main import app

client = TestClient(app)


def test_health_endpoint():
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


def test_unsafe_production_database_action_is_blocked():
    response = client.post(
        "/evaluate",
        json={
            "action": "remove the production database permanently",
            "evidence_score": 100,
            "policy_violation": False,
            "contradiction_detected": False,
        },
    )

    assert response.status_code == 200

    result = response.json()
    assert result["decision"] == "BLOCK"
    assert result["risk_score"] >= 70


def test_empty_action_is_rejected():
    response = client.post(
        "/evaluate",
        json={
            "action": "",
            "evidence_score": 90,
            "policy_violation": False,
            "contradiction_detected": False,
        },
    )

    assert response.status_code == 422


def test_evidence_score_above_100_is_rejected():
    response = client.post(
        "/evaluate",
        json={
            "action": "read application status",
            "evidence_score": 101,
            "policy_violation": False,
            "contradiction_detected": False,
        },
    )

    assert response.status_code == 422


def test_negative_evidence_score_is_rejected():
    response = client.post(
        "/evaluate",
        json={
            "action": "read application status",
            "evidence_score": -1,
            "policy_violation": False,
            "contradiction_detected": False,
        },
    )

    assert response.status_code == 422
import pytest


@pytest.mark.parametrize("action", [
    "x" * 501,
    None,
    123,
])
def test_invalid_action_values_are_rejected(action):
    response = client.post(
        "/evaluate",
        json={
            "action": action,
            "evidence_score": 90,
            "policy_violation": False,
            "contradiction_detected": False,
        },
    )
    assert response.status_code == 422


@pytest.mark.parametrize("evidence_score", [
    "not-a-number",
    None,
    [],
])
def test_invalid_evidence_types_are_rejected(evidence_score):
    response = client.post(
        "/evaluate",
        json={
            "action": "read application status",
            "evidence_score": evidence_score,
            "policy_violation": False,
            "contradiction_detected": False,
        },
    )
    assert response.status_code == 422


@pytest.mark.parametrize("missing_field", [
    "action",
    "evidence_score",
    "policy_violation",
    "contradiction_detected",
])
def test_missing_required_fields_are_rejected(missing_field):
    payload = {
        "action": "read application status",
        "evidence_score": 90,
        "policy_violation": False,
        "contradiction_detected": False,
    }
    payload.pop(missing_field)

    response = client.post("/evaluate", json=payload)

    assert response.status_code == 422
def test_root_endpoint():
    response = client.get("/")

    assert response.status_code == 200
    assert response.json() == {
        "system": "AEGIS-X",
        "status": "online",
        "message": "AI Agent Reliability & Control System is running",
    }


def test_simulation_previews_plan_without_execution():
    response = client.post(
        "/simulate",
        json={"actions": [
            "Create a backup of the production database",
            "Delete the production database permanently",
            "Verify application health checks",
        ]},
    )
    assert response.status_code == 200
    result = response.json()
    assert result["execution_performed"] is False
    assert result["step_count"] == 3
    assert result["decision"] == "BLOCK"
    assert result["potential_blast_radius"] in {"LOW", "MEDIUM", "HIGH"}
    assert result["irreversible_steps"]
    assert len(result["dependencies"]) == 2


def test_simulation_rejects_more_than_ten_actions():
    response = client.post("/simulate", json={"actions": [f"step {i}" for i in range(11)]})
    assert response.status_code == 422


def test_simulation_rejects_empty_action():
    response = client.post("/simulate", json={"actions": ["   "]})
    assert response.status_code == 422



def test_evaluate_returns_explainable_policy_analysis():
    response = client.post(
        "/evaluate",
        json={
            "action": "Deploy application to production",
            "evidence_score": 100,
            "policy_violation": False,
            "contradiction_detected": False,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["policy_analysis"]["policy_version"] == "1.0.0"
    assert "PRODUCTION_CHANGE" in body["policy_analysis"]["matched_rules"]
    assert body["policy_analysis"]["context"]["production_change"] is True


def test_simulation_steps_include_shared_policy_analysis():
    response = client.post(
        "/simulate",
        json={"actions": ["Deploy application to production"]},
    )
    assert response.status_code == 200
    step = response.json()["steps"][0]
    assert step["policy_analysis"]["policy_version"] == "1.0.0"
    assert step["risk_score"] >= step["policy_analysis"]["risk_score"]

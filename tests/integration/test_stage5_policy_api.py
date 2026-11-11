from fastapi.testclient import TestClient

from backend.app import main


def test_evaluate_production_change_is_review_and_audited(monkeypatch):
    monkeypatch.setattr(main, "record_decision", lambda **kwargs: None)
    client = TestClient(main.app)

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
    assert body["policy_analysis"]["requires_human_review"] is True
    assert body["decision"] == "REVIEW"
    assert body["risk_score"] == 20


def test_evaluate_safe_action_can_still_be_allowed(monkeypatch):
    monkeypatch.setattr(main, "record_decision", lambda **kwargs: None)
    client = TestClient(main.app)

    response = client.post(
        "/evaluate",
        json={
            "action": "Read public documentation",
            "evidence_score": 100,
            "policy_violation": False,
            "contradiction_detected": False,
        },
    )

    assert response.status_code == 200
    assert response.json()["decision"] == "ALLOW"


def test_simulate_production_change_requires_review():
    client = TestClient(main.app)
    response = client.post(
        "/simulate",
        json={"actions": ["Deploy application to production"]},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["decision"] == "REVIEW"
    assert body["steps"][0]["decision"] == "REVIEW"

from backend.app.engines.decision_engine import evaluate_action
from backend.app.engines.simulation_engine import simulate_plan


def test_human_review_signal_prevents_allow():
    result = evaluate_action(
        action="Deploy application to production",
        evidence_score=100,
        risk_score=20,
        policy_violation=False,
        contradiction_detected=False,
        requires_human_review=True,
    )
    assert result["decision"] == "REVIEW"
    assert "Policy analysis requires human review" in result["reasons"]


def test_block_takes_precedence_over_human_review():
    result = evaluate_action(
        action="Delete production database",
        evidence_score=100,
        risk_score=80,
        policy_violation=False,
        contradiction_detected=False,
        requires_human_review=True,
    )
    assert result["decision"] == "BLOCK"


def test_legacy_call_without_review_flag_remains_compatible():
    result = evaluate_action(
        action="Read a public status page",
        evidence_score=100,
        risk_score=0,
        policy_violation=False,
        contradiction_detected=False,
    )
    assert result["decision"] == "ALLOW"


def test_simulation_enforces_shared_human_review_signal():
    result = simulate_plan(["Deploy application to production"])
    assert result["decision"] == "REVIEW"
    assert result["steps"][0]["decision"] == "REVIEW"
    assert result["steps"][0]["policy_analysis"]["requires_human_review"] is True

from backend.app.engines.risk_engine import calculate_risk
from backend.app.engines.decision_engine import evaluate_action


def test_policy_violation_blocks_action():
    risk = calculate_risk(
        action="deploy application",
        evidence_score=100,
        policy_violation=True,
        contradiction_detected=False,
    )

    result = evaluate_action(
        action="deploy application",
        evidence_score=100,
        risk_score=risk,
        policy_violation=True,
        contradiction_detected=False,
    )

    assert result["decision"] == "BLOCK"


def test_low_evidence_requires_review():
    risk = calculate_risk(
        action="read application status",
        evidence_score=50,
        policy_violation=False,
        contradiction_detected=False,
    )

    result = evaluate_action(
        action="read application status",
        evidence_score=50,
        risk_score=risk,
        policy_violation=False,
        contradiction_detected=False,
    )

    assert result["decision"] == "REVIEW"


def test_clear_low_risk_action_is_allowed():
    risk = calculate_risk(
        action="read application status",
        evidence_score=95,
        policy_violation=False,
        contradiction_detected=False,
    )

    result = evaluate_action(
        action="read application status",
        evidence_score=95,
        risk_score=risk,
        policy_violation=False,
        contradiction_detected=False,
    )

    assert result["decision"] == "ALLOW"
def test_high_risk_blocks_even_with_strong_evidence():
    result = evaluate_action(
        action="read application status",
        evidence_score=100,
        risk_score=70,
        policy_violation=False,
        contradiction_detected=False,
    )

    assert result["decision"] == "BLOCK"


def test_contradictory_evidence_requires_review():
    result = evaluate_action(
        action="read application status",
        evidence_score=95,
        risk_score=10,
        policy_violation=False,
        contradiction_detected=True,
    )

    assert result["decision"] == "REVIEW"
import pytest


@pytest.mark.parametrize(
    "evidence, risk, policy, contradiction, expected",
    [
        (100, 0, False, False, "ALLOW"),
        (100, 70, False, False, "BLOCK"),
        (69, 0, False, False, "REVIEW"),
        (100, 0, False, True, "REVIEW"),
        (100, 40, True, False, "BLOCK"),
        (100, 100, False, True, "BLOCK"),
    ],
)
def test_decision_matrix(
    evidence, risk, policy, contradiction, expected
):
    result = evaluate_action(
        action="read application status",
        evidence_score=evidence,
        risk_score=risk,
        policy_violation=policy,
        contradiction_detected=contradiction,
    )
    assert result["decision"] == expected


@pytest.mark.parametrize(
    "evidence, risk, policy, contradiction, expected_reason",
    [
        (50, 0, False, False, "Insufficient evidence"),
        (100, 70, False, False, "High risk detected"),
        (100, 40, True, False, "Policy violation detected"),
        (100, 0, False, True, "Contradictory evidence detected"),
    ],
)
def test_decision_explains_why(
    evidence, risk, policy, contradiction, expected_reason
):
    result = evaluate_action(
        action="read application status",
        evidence_score=evidence,
        risk_score=risk,
        policy_violation=policy,
        contradiction_detected=contradiction,
    )
    assert expected_reason in result["reasons"]

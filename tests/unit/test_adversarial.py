from backend.app.engines.risk_engine import calculate_risk


def test_production_database_removal_without_delete_keyword():
    risk = calculate_risk(
        action="remove the production database permanently",
        evidence_score=100,
        policy_violation=False,
        contradiction_detected=False,
    )

    print(f"\nRisk score for production database removal: {risk}")
    assert risk >= 70, (
        "Unsafe production action received a low risk score"
    )

def test_production_database_removal_is_blocked():
    from backend.app.engines.decision_engine import evaluate_action

    action = "remove the production database permanently"

    risk = calculate_risk(
        action=action,
        evidence_score=100,
        policy_violation=False,
        contradiction_detected=False,
    )

    result = evaluate_action(
        action=action,
        evidence_score=100,
        risk_score=risk,
        policy_violation=False,
        contradiction_detected=False,
    )

    assert result["decision"] == "BLOCK"
    assert result["risk_score"] >= 70

def test_risk_score_never_exceeds_100():
    risk = calculate_risk(
        action="delete production database",
        evidence_score=0,
        policy_violation=True,
        contradiction_detected=True,
    )

    assert 0 <= risk <= 100


def test_risk_score_is_zero_for_clear_low_risk_action():
    risk = calculate_risk(
        action="read application status",
        evidence_score=100,
        policy_violation=False,
        contradiction_detected=False,
    )

    assert risk == 0


def test_risk_score_is_non_negative_for_low_evidence():
    risk = calculate_risk(
        action="read application status",
        evidence_score=0,
        policy_violation=False,
        contradiction_detected=False,
    )

    assert risk >= 0

import pytest


@pytest.mark.parametrize("action", [
    "send report",
    "transfer funds",
    "delete temporary file",
    "approve request",
    "make payment",
    "withdraw cash",
])
def test_high_impact_keywords_add_risk(action):
    risk = calculate_risk(
        action=action,
        evidence_score=100,
        policy_violation=False,
        contradiction_detected=False,
    )
    assert risk == 20


@pytest.mark.parametrize("action", [
    "open sender settings",
    "review approval guide",
    "show withdrawable balance",
    "check paymentGateway status",
    "read transaction history",
])
def test_unrelated_words_do_not_trigger_keyword_risk(action):
    risk = calculate_risk(
        action=action,
        evidence_score=100,
        policy_violation=False,
        contradiction_detected=False,
    )
    assert risk == 0


@pytest.mark.parametrize("evidence_score, expected_risk", [
    (0, 30),
    (69.99, 30),
    (70, 0),
    (100, 0),
])
def test_evidence_score_threshold(evidence_score, expected_risk):
    risk = calculate_risk(
        action="read application status",
        evidence_score=evidence_score,
        policy_violation=False,
        contradiction_detected=False,
    )
    assert risk == expected_risk


@pytest.mark.parametrize(
    "policy_violation, contradiction_detected, expected_risk",
    [
        (False, False, 0),
        (True, False, 40),
        (False, True, 30),
        (True, True, 70),
    ],
)
def test_policy_and_contradiction_risk_combinations(
    policy_violation,
    contradiction_detected,
    expected_risk,
):
    risk = calculate_risk(
        action="read application status",
        evidence_score=100,
        policy_violation=policy_violation,
        contradiction_detected=contradiction_detected,
    )
    assert risk == expected_risk


@pytest.mark.parametrize("action", [
    "drop prod table",
    "wipe production data",
    "erase database in prod",
    "truncate prod records",
    "destroy production db",
])
def test_destructive_production_actions_receive_high_risk(action):
    risk = calculate_risk(
        action=action,
        evidence_score=100,
        policy_violation=False,
        contradiction_detected=False,
    )
    assert risk >= 80


def test_production_action_detection_is_case_insensitive():
    risk = calculate_risk(
        action="DELETE PRODUCTION DATABASE",
        evidence_score=100,
        policy_violation=False,
        contradiction_detected=False,
    )
    assert risk == 100
import pytest
from backend.app.engines.decision_engine import evaluate_action


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
@pytest.mark.parametrize("action", [
    "",
    "   ",
    None,
    123,
])
def test_invalid_actions_are_rejected(action):
    with pytest.raises(ValueError):
        calculate_risk(
            action=action,
            evidence_score=100,
            policy_violation=False,
            contradiction_detected=False,
        )


@pytest.mark.parametrize("evidence_score", [
    -1,
    101,
    float("nan"),
    float("inf"),
    float("-inf"),
    True,
    "50",
    None,
])
def test_invalid_evidence_scores_are_rejected(evidence_score):
    with pytest.raises(ValueError):
        calculate_risk(
            action="read application status",
            evidence_score=evidence_score,
            policy_violation=False,
            contradiction_detected=False,
        )


@pytest.mark.parametrize("policy_violation", [
    1,
    "false",
    None,
])
def test_invalid_policy_flags_are_rejected(policy_violation):
    with pytest.raises(ValueError):
        calculate_risk(
            action="read application status",
            evidence_score=100,
            policy_violation=policy_violation,
            contradiction_detected=False,
        )


@pytest.mark.parametrize("contradiction_detected", [
    0,
    "false",
    None,
])
def test_invalid_contradiction_flags_are_rejected(contradiction_detected):
    with pytest.raises(ValueError):
        calculate_risk(
            action="read application status",
            evidence_score=100,
            policy_violation=False,
            contradiction_detected=contradiction_detected,
        )

from backend.app.engines.simulation_engine import simulate_plan


def test_production_deployment_requires_human_review():
    result = simulate_plan(["Deploy application to production"])
    assert result["decision"] == "REVIEW"
    assert result["steps"][0]["decision"] == "REVIEW"


def test_destructive_production_action_is_blocked():
    result = simulate_plan(["Wipe production database"])
    assert result["decision"] == "BLOCK"


def test_payment_gateway_status_read_is_allowed():
    result = simulate_plan(["Check paymentGateway status"])
    assert result["decision"] == "ALLOW"


def test_transaction_history_read_is_allowed():
    result = simulate_plan(["Read transaction history"])
    assert result["decision"] == "ALLOW"


def test_payment_transfer_requires_human_review():
    result = simulate_plan(["Transfer payment from customer account"])
    assert result["decision"] == "REVIEW"

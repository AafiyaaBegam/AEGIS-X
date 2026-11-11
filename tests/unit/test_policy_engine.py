import pytest

from backend.app.engines.policy_engine import analyze_policy, POLICY_VERSION
from backend.app.engines.risk_engine import calculate_risk


def test_policy_analysis_is_versioned_and_explainable():
    result = analyze_policy("Deploy application to production")
    assert result["policy_version"] == POLICY_VERSION
    assert result["risk_score"] == 20
    assert "PRODUCTION_CHANGE" in result["matched_rules"]
    assert result["context"]["production_change"] is True
    assert result["requires_human_review"] is True


def test_destructive_production_data_operation_is_critical():
    result = analyze_policy("remove the production database permanently")
    assert result["risk_score"] == 80
    assert result["risk_level"] == "CRITICAL"
    assert "DESTRUCTIVE_CRITICAL_DATA_OPERATION" in result["matched_rules"]


def test_privilege_change_is_detected():
    result = analyze_policy("revoke administrator permission")
    assert result["context"]["privilege_change"] is True
    assert result["risk_score"] >= 30
    assert "PRIVILEGE_OR_SECURITY_CHANGE" in result["matched_rules"]


def test_financial_operation_is_detected_without_high_impact_verb():
    result = analyze_policy("pay customer account invoice")
    assert result["context"]["financial_operation"] is True
    assert "FINANCIAL_OPERATION" in result["matched_rules"]


def test_negated_or_unrelated_words_do_not_match_substrings():
    result = analyze_policy("review paymentGateway status")
    assert result["risk_score"] == 0
    assert result["matched_rules"] == []


def test_legacy_risk_api_remains_compatible():
    assert calculate_risk(
        "remove the production database permanently", 100, False, False
    ) == 80


@pytest.mark.parametrize("action", ["", "   ", None, 123])
def test_invalid_action_rejected(action):
    with pytest.raises(ValueError):
        analyze_policy(action)


def test_non_finite_evidence_rejected():
    with pytest.raises(ValueError):
        analyze_policy("read status", float("nan"))

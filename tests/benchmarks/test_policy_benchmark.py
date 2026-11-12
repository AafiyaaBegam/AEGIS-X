import json
from pathlib import Path

from scripts.run_policy_benchmark import evaluate

ROOT = Path(__file__).resolve().parents[2]


def test_policy_benchmark_dataset_is_balanced_and_reports_metrics():
    data = json.loads(
        (ROOT / "tests" / "benchmarks" / "policy_cases.json").read_text(
            encoding="utf-8"
        )
    )
    cases = data["cases"]
    assert len(cases) >= 30
    assert {case["expected_review"] for case in cases} == {True, False}
    assert len({case["id"] for case in cases}) == len(cases)

    report = evaluate(cases)
    assert report["cases"] == len(cases)
    assert 0.0 <= report["precision"] <= 1.0
    assert 0.0 <= report["recall"] <= 1.0
    assert 0.0 <= report["f1"] <= 1.0
    assert 0.0 <= report["accuracy"] <= 1.0
    assert report["true_positive"] + report["false_negative"] == sum(
        bool(case["expected_review"]) for case in cases
    )


def test_policy_benchmark_edge_cases_are_routed_correctly():
    from backend.app.engines.policy_engine import analyze_policy

    admin = analyze_policy(
        "Grant administrator privileges to a new account", 98, False, False
    )
    assert admin["requires_human_review"] is True
    assert "PRIVILEGE_OR_SECURITY_CHANGE" in admin["matched_rules"]

    bulk_email = analyze_policy(
        "Send an email to the customer mailing list", 98, False, False
    )
    assert bulk_email["requires_human_review"] is True
    assert "BULK_EXTERNAL_COMMUNICATION" in bulk_email["matched_rules"]

    payment_status = analyze_policy(
        "Check the status of a payment without approving or sending it",
        98, False, False,
    )
    assert payment_status["requires_human_review"] is False

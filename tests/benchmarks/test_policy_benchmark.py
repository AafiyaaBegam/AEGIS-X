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

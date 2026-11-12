"""Run the curated AEGIS-X policy benchmark and report classification metrics.

This is a small synthetic regression benchmark, not evidence of production accuracy.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.app.engines.policy_engine import analyze_policy  # noqa: E402


def load_cases():
    path = ROOT / "tests" / "benchmarks" / "policy_cases.json"
    return json.loads(path.read_text(encoding="utf-8"))["cases"]


def evaluate(cases):
    tp = fp = tn = fn = 0
    rows = []
    for case in cases:
        result = analyze_policy(
            action=case["action"],
            evidence_score=case["evidence_score"],
            policy_violation=case["policy_violation"],
            contradiction_detected=case["contradiction_detected"],
        )
        expected = bool(case["expected_review"])
        predicted = bool(result["requires_human_review"])
        if expected and predicted:
            tp += 1
        elif not expected and predicted:
            fp += 1
        elif not expected and not predicted:
            tn += 1
        else:
            fn += 1
        rows.append((case["id"], expected, predicted, result["risk_score"]))
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    accuracy = (tp + tn) / len(cases) if cases else 0.0
    return {
        "cases": len(cases), "true_positive": tp, "false_positive": fp,
        "true_negative": tn, "false_negative": fn,
        "precision": precision, "recall": recall, "f1": f1,
        "accuracy": accuracy, "rows": rows,
    }


if __name__ == "__main__":
    report = evaluate(load_cases())
    print("AEGIS-X POLICY BENCHMARK (synthetic regression set)")
    for key in ("cases", "true_positive", "false_positive", "true_negative",
                "false_negative", "precision", "recall", "f1", "accuracy"):
        value = report[key]
        print(f"{key}: {value:.3f}" if isinstance(value, float) else f"{key}: {value}")
    print("\nMISMATCHES")
    mismatches = [row for row in report["rows"] if row[1] != row[2]]
    if not mismatches:
        print("None")
    for case_id, expected, predicted, score in mismatches:
        print(f"{case_id}: expected_review={expected}, predicted_review={predicted}, risk_score={score}")

"""Backward-compatible risk score interface backed by policy_engine."""
from backend.app.engines.policy_engine import analyze_policy


def calculate_risk(
    action: str,
    evidence_score: float,
    policy_violation: bool,
    contradiction_detected: bool,
) -> float:
    return analyze_policy(
        action=action,
        evidence_score=evidence_score,
        policy_violation=policy_violation,
        contradiction_detected=contradiction_detected,
    )["risk_score"]

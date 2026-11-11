from typing import Dict


def evaluate_action(
    action: str,
    evidence_score: float,
    risk_score: float,
    policy_violation: bool,
    contradiction_detected: bool,
    requires_human_review: bool = False,
) -> Dict:
    """Apply a consistent final-decision priority to an evaluated action.

    The optional review flag preserves compatibility with existing callers.
    """
    reasons = []

    if policy_violation:
        reasons.append("Policy violation detected")
    if risk_score >= 70:
        reasons.append("High risk detected")

    # BLOCK always takes precedence over REVIEW.
    if policy_violation or risk_score >= 70:
        decision = "BLOCK"
    else:
        if requires_human_review:
            reasons.append("Policy analysis requires human review")
        if evidence_score < 70:
            reasons.append("Insufficient evidence")
        if contradiction_detected:
            reasons.append("Contradictory evidence detected")

        if (
            requires_human_review
            or evidence_score < 70
            or contradiction_detected
        ):
            decision = "REVIEW"
        else:
            decision = "ALLOW"

    return {
        "action": action,
        "risk_score": risk_score,
        "evidence_score": evidence_score,
        "decision": decision,
        "reasons": reasons,
    }

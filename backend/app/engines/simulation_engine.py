"""Deterministic, rule-based preview of a proposed multi-step action plan.

This module never executes supplied actions. Risk estimates are heuristics.
"""
from __future__ import annotations

import re
from typing import Any

from backend.app.engines.policy_engine import analyze_policy

IRREVERSIBLE = re.compile(
    r"\b(delete|drop|erase|wipe|destroy|truncate|overwrite|revoke|terminate|purge)\b",
    re.I,
)
CRITICAL = re.compile(
    r"\b(production|prod|customer|customer data|payment(?:\s*gateway)?|database|db|security|credential|permission|firewall|cluster|server)\b",
    re.I,
)
CHANGE = re.compile(
    r"\b(deploy|migrate|update|change|restart|disable|enable|modify|rotate|transfer|send|approve|delete|remove|drop|overwrite|revoke|terminate|refund|charge|withdraw)\b",
    re.I,
)
PRODUCTION = re.compile(r"\b(production|prod)\b", re.I)
PAYMENT = re.compile(r"\bpayment(?:\s*gateway)?\b", re.I)


def _step_details(action: str, index: int) -> dict[str, Any]:
    irreversible = bool(IRREVERSIBLE.search(action))
    critical = bool(CRITICAL.search(action))
    change = bool(CHANGE.search(action))
    production_change = bool(PRODUCTION.search(action) and change)
    payment_change = bool(PAYMENT.search(action) and change)

    risk = 20 if change else 8
    reasons: list[str] = []

    if critical:
        risk += 25
        reasons.append("Mentions a potentially critical system or asset")

    if irreversible:
        risk += 35
        reasons.append("Contains an action that may be difficult to reverse")

    if production_change:
        risk += 20
        reasons.append("Production changes require human approval")

    if PRODUCTION.search(action) and irreversible:
        risk += 30
        reasons.append("Irreversible change appears to target production")

    if payment_change:
        risk += 20
        reasons.append("Financial operations require authorized human review")

    risk = min(risk, 100)
    policy_analysis = analyze_policy(action)
    risk = max(risk, policy_analysis["risk_score"])

    # Enforce the shared policy engine's decision signals in simulation too.
    if policy_analysis["requires_human_review"]:
        reasons.append("Shared policy analysis requires human review")

    if risk >= 70 or (irreversible and critical):
        decision = "BLOCK"
    elif (
        policy_analysis["requires_human_review"]
        or risk >= 60
        or production_change
        or payment_change
    ):
        decision = "REVIEW"
    else:
        decision = "ALLOW"

    alternatives = []
    if irreversible:
        alternatives.extend([
            "Create and verify a backup or snapshot first",
            "Use a dry run or reversible change where possible",
        ])
    if critical:
        alternatives.append(
            "Require authorized human approval and a maintenance window"
        )
    if not alternatives:
        alternatives.append(
            "Validate in a staging or sandbox environment first"
        )
    if index > 1:
        alternatives.append(
            "Confirm earlier steps succeeded before continuing"
        )

    return {
        "step": index,
        "action": action,
        "risk_score": risk,
        "decision": decision,
        "potentially_irreversible": irreversible,
        "critical_asset_mentioned": critical,
        "reasons": list(dict.fromkeys(reasons)) or [
            "No high-impact pattern detected by the current rules"
        ],
        "safer_alternatives": list(dict.fromkeys(alternatives)),
        "policy_analysis": policy_analysis,
    }


def simulate_plan(actions: list[str]) -> dict[str, Any]:
    """Return a deterministic plan preview, with no external side effects."""
    cleaned = [
        action.strip()
        for action in actions
        if isinstance(action, str) and action.strip()
    ]
    steps = [
        _step_details(action, index)
        for index, action in enumerate(cleaned, start=1)
    ]
    if not steps:
        raise ValueError("Provide at least one non-empty action")

    overall_risk = max(step["risk_score"] for step in steps)

    if any(step["decision"] == "BLOCK" for step in steps):
        decision = "BLOCK"
    elif any(step["decision"] == "REVIEW" for step in steps):
        decision = "REVIEW"
    else:
        decision = "ALLOW"

    critical_steps = [
        step["step"] for step in steps
        if step["critical_asset_mentioned"]
    ]
    irreversible_steps = [
        step["step"] for step in steps
        if step["potentially_irreversible"]
    ]
    dependencies = [
        {
            "before_step": i,
            "after_step": i + 1,
            "reason": "Review the previous step's outcome before proceeding",
        }
        for i in range(1, len(steps))
    ]

    recommendations = []
    if critical_steps:
        recommendations.append(
            "Map affected services and data owners before approving this plan."
        )
    if irreversible_steps:
        recommendations.append(
            "Do not run irreversible steps until backup, rollback, and approval checks pass."
        )
    if any(step["decision"] == "REVIEW" for step in steps):
        recommendations.append(
            "Obtain explicit human authorization before proceeding with flagged steps."
        )
    if len(steps) > 1:
        recommendations.append(
            "Execute only in a controlled environment and verify each step before the next."
        )
    if not recommendations:
        recommendations.append(
            "Validate the plan against the actual environment before execution."
        )

    return {
        "decision": decision,
        "overall_risk_score": overall_risk,
        "step_count": len(steps),
        "potential_blast_radius": (
            "HIGH"
            if len(critical_steps) >= 2 or (critical_steps and irreversible_steps)
            else "MEDIUM"
            if critical_steps or len(steps) > 2
            else "LOW"
        ),
        "critical_steps": critical_steps,
        "irreversible_steps": irreversible_steps,
        "steps": steps,
        "dependencies": dependencies,
        "recommendations": recommendations,
        "execution_performed": False,
        "limitations": (
            "Heuristic preview based on action text only; it does not inspect "
            "infrastructure, infer real dependencies, or execute actions."
        ),
    }

"""Explainable, deterministic policy analysis for proposed agent actions.

This is a text-and-input-signal policy engine, not an environment scanner or ML model.
Rules are explicit, versioned, and return the factors used in each assessment.
"""
from __future__ import annotations

import math
import re
from typing import Any

POLICY_VERSION = "1.0.0"

_PATTERNS = {
    "high_impact_operation": re.compile(
        r"\b(send|transfer|delete|approve|payment|withdraw|refund|charge)\b", re.I
    ),
    "destructive_operation": re.compile(
        r"\b(remove|delete|drop|erase|wipe|destroy|truncate|purge)\b", re.I
    ),
    "critical_data_target": re.compile(
        r"\b(production|prod)\b.{0,80}\b(database|db|table|records?|data)\b"
        r"|\b(database|db|table|records?|data)\b.{0,80}\b(production|prod)\b", re.I
    ),
    "production_environment": re.compile(r"\b(production|prod)\b", re.I),
    "production_change": re.compile(
        r"\b(deploy|migrate|update|change|restart|disable|enable|modify|rotate|"
        r"transfer|send|approve|delete|remove|drop|overwrite|revoke|terminate|"
        r"refund|charge|withdraw)\b", re.I
    ),
    "financial_asset": re.compile(
        r"\b(payment|funds?|bank account|customer account|wallet|transaction)\b", re.I
    ),
    "financial_operation": re.compile(
        r"\b(transfer|send|approve|refund|charge|withdraw|pay)\b", re.I
    ),
    "privilege_asset": re.compile(
        r"\b(permission|privilege|credential|secret|access|firewall|security policy|"
        r"iam|role|admin|administrator)\b", re.I
    ),
    "privilege_change": re.compile(
        r"\b(grant|revoke|elevate|disable|enable|rotate|reset|modify|change|remove)\b", re.I
    ),
    "bulk_external_communication": re.compile(
        r"\b(send|email|message|notify|broadcast)\b.{0,100}\b("
        r"mailing list|all customers|all users|customer list|distribution list)\b"
        r"|\b(mailing list|all customers|all users|customer list|distribution list)\b"
        r".{0,100}\b(send|email|message|notify|broadcast)\b", re.I
    ),
    "critical_asset": re.compile(
        r"\b(production|prod|customer|customer data|payment|database|db|security|"
        r"credential|permission|firewall|cluster|server)\b", re.I
    ),
    "irreversible": re.compile(
        r"\b(delete|drop|erase|wipe|destroy|truncate|overwrite|revoke|terminate|purge)\b", re.I
    ),
}


def _validate(action: str, evidence_score: float, policy_violation: bool,
              contradiction_detected: bool) -> None:
    if not isinstance(action, str) or not action.strip():
        raise ValueError("action must be a non-empty string")
    if (isinstance(evidence_score, bool)
            or not isinstance(evidence_score, (int, float))
            or not math.isfinite(evidence_score)
            or not 0 <= evidence_score <= 100):
        raise ValueError("evidence_score must be between 0 and 100")
    if not isinstance(policy_violation, bool):
        raise ValueError("policy_violation must be a boolean")
    if not isinstance(contradiction_detected, bool):
        raise ValueError("contradiction_detected must be a boolean")


def analyze_policy(action: str, evidence_score: float = 100,
                   policy_violation: bool = False,
                   contradiction_detected: bool = False) -> dict[str, Any]:
    """Return a transparent risk breakdown and decision-support signals."""
    _validate(action, evidence_score, policy_violation, contradiction_detected)
    factors: list[dict[str, Any]] = []

    def add(rule_id: str, points: int, explanation: str) -> None:
        factors.append({
            "rule_id": rule_id,
            "points": points,
            "explanation": explanation,
        })

    if evidence_score < 70:
        add("EVIDENCE_BELOW_THRESHOLD", 30,
            "Evidence confidence is below the 70-point policy threshold.")
    if policy_violation:
        add("EXPLICIT_POLICY_VIOLATION", 40,
            "The request was explicitly marked as violating policy.")
    if contradiction_detected:
        add("CONTRADICTORY_EVIDENCE", 30,
            "The request was marked as containing contradictory evidence.")

    destructive = bool(_PATTERNS["destructive_operation"].search(action))
    critical_target = bool(_PATTERNS["critical_data_target"].search(action))
    high_impact = bool(_PATTERNS["high_impact_operation"].search(action))
    production = bool(_PATTERNS["production_environment"].search(action))
    production_change = production and bool(_PATTERNS["production_change"].search(action))
    financial = (bool(_PATTERNS["financial_asset"].search(action))
                 and bool(_PATTERNS["financial_operation"].search(action)))
    privilege_change = (bool(_PATTERNS["privilege_asset"].search(action))
                        and bool(_PATTERNS["privilege_change"].search(action)))
    bulk_communication = bool(
        _PATTERNS["bulk_external_communication"].search(action)
    )
    irreversible = bool(_PATTERNS["irreversible"].search(action))
    critical_asset = bool(_PATTERNS["critical_asset"].search(action))

    if high_impact:
        add("HIGH_IMPACT_OPERATION", 20,
            "The action contains a high-impact operation verb.")
    if destructive and critical_target:
        add("DESTRUCTIVE_CRITICAL_DATA_OPERATION", 80,
            "A destructive operation targets production data or a database.")
    elif production_change:
        add("PRODUCTION_CHANGE", 20,
            "A change operation targets a production environment.")
    if financial and not high_impact:
        add("FINANCIAL_OPERATION", 25,
            "A financial operation targets an account, funds, wallet, or transaction.")
    if privilege_change:
        add("PRIVILEGE_OR_SECURITY_CHANGE", 30,
            "A permission, credential, role, or security control is being changed.")
    if bulk_communication:
        add("BULK_EXTERNAL_COMMUNICATION", 30,
            "A message is being sent to a broad customer or user distribution.")

    score = min(100.0, float(sum(item["points"] for item in factors)))
    level = "CRITICAL" if score >= 80 else "HIGH" if score >= 60 else (
        "MODERATE" if score >= 30 else "LOW"
    )
    return {
        "policy_version": POLICY_VERSION,
        "risk_score": score,
        "risk_level": level,
        "risk_factors": factors,
        "matched_rules": [item["rule_id"] for item in factors],
        "context": {
            "production_environment": production,
            "production_change": production_change,
            "financial_operation": financial,
            "privilege_change": privilege_change,
            "bulk_external_communication": bulk_communication,
            "critical_asset_mentioned": critical_asset,
            "potentially_irreversible": irreversible,
            "destructive_critical_data_operation": destructive and critical_target,
        },
        "requires_human_review": (
            score >= 30 or production_change or financial or privilege_change
        ),
        "limitations": (
            "Deterministic text rules and supplied evidence flags only; "
            "no live infrastructure, identity, dependency, or runtime inspection."
        ),
    }

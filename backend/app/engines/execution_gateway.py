"""Two-phase execution gateway for harmless registered demo tools."""
from typing import Any, Callable

from backend.app.engines.policy_engine import analyze_policy
from backend.app.engines.risk_engine import calculate_risk
from backend.app.engines.decision_engine import evaluate_action
from backend.app.engines.audit_store import audit_receipt_matches


def _read_service_status() -> dict[str, Any]:
    return {
        "service": "aegis-demo-service",
        "status": "healthy",
        "environment": "isolated-demo",
    }


def _create_demo_report() -> dict[str, Any]:
    return {
        "report": "AEGIS-X demo report",
        "created": True,
        "environment": "isolated-demo",
    }


_TOOL_REGISTRY: dict[str, Callable[[], dict[str, Any]]] = {
    "read_service_status": _read_service_status,
    "create_demo_report": _create_demo_report,
}


def evaluate_registered_tool(
    tool_name: str,
    action: str,
    evidence_score: float = 90,
    policy_violation: bool = False,
    contradiction_detected: bool = False,
) -> dict[str, Any]:
    """Evaluate a tool request without executing its handler."""
    policy = analyze_policy(
        action=action,
        evidence_score=evidence_score,
        policy_violation=policy_violation,
        contradiction_detected=contradiction_detected,
    )

    risk_score = calculate_risk(
        action=action,
        evidence_score=evidence_score,
        policy_violation=policy_violation,
        contradiction_detected=contradiction_detected,
    )

    decision_result = evaluate_action(
        action=action,
        evidence_score=evidence_score,
        risk_score=risk_score,
        policy_violation=policy_violation,
        contradiction_detected=contradiction_detected,
        requires_human_review=policy["requires_human_review"],
    )

    decision = decision_result["decision"]
    reasons = list(decision_result["reasons"])

    if tool_name not in _TOOL_REGISTRY:
        decision = "BLOCK"
        reasons.append("Tool is not registered in the execution allowlist")

    return {
        "tool_name": tool_name,
        "action": action,
        "decision": decision,
        "risk_score": risk_score,
        "reasons": reasons,
        "execution_performed": False,
        "approval_required": decision == "REVIEW",
        "tool_result": None,
        "policy_analysis": policy,
        "gateway": "AEGIS-X Execution Gateway",
        "environment": "isolated-demo",
    }


def execute_tool_after_audit(result: dict[str, Any], audit_record_id: int) -> dict[str, Any]:
    """Execute only an ALLOW decision after its audit record has been saved."""
    if result.get("decision") != "ALLOW":
        return result

    if not audit_receipt_matches(audit_record_id, result):
        raise RuntimeError("A matching persisted audit receipt is required before execution.")

    handler = _TOOL_REGISTRY.get(result.get("tool_name"))
    if handler is None:
        raise RuntimeError("Registered tool became unavailable before execution")

    tool_result = handler()
    result["tool_result"] = tool_result
    result["execution_performed"] = True
    return result


def execute_registered_tool(
    tool_name: str,
    action: str,
    evidence_score: float = 90,
    policy_violation: bool = False,
    contradiction_detected: bool = False,
) -> dict[str, Any]:
    """Convenience wrapper for isolated unit tests; API uses two phases."""
    result = evaluate_registered_tool(
        tool_name=tool_name,
        action=action,
        evidence_score=evidence_score,
        policy_violation=policy_violation,
        contradiction_detected=contradiction_detected,
    )
    from backend.app.engines.audit_store import record_decision

    audit_record_id = record_decision(
        action=action,
        evidence_score=evidence_score,
        policy_violation=policy_violation,
        contradiction_detected=contradiction_detected,
        result=result,
    )
    return execute_tool_after_audit(result, audit_record_id)

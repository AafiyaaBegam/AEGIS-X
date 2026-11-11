from fastapi import FastAPI, Query, HTTPException
from backend.app.security_api import router as security_router, enforce_api_auth
from pydantic import BaseModel, Field, field_validator

from backend.app.engines.decision_engine import evaluate_action
from backend.app.engines.risk_engine import calculate_risk
from backend.app.engines.policy_engine import analyze_policy
from backend.app.engines.simulation_engine import simulate_plan
from backend.app.engines.audit_store import (
    record_decision,
    list_audit_records,
    verify_audit_chain,
    AuditIntegrityError,
)

app = FastAPI(
    title="AEGIS-X",
    description="Autonomous AI Agent Reliability & Control System",
    version="0.2.0",
)

app.include_router(security_router)

_OPERATOR_AUTH = enforce_api_auth(("admin", "operator"))
_AUDIT_AUTH = enforce_api_auth(("admin", "auditor"))



class ActionRequest(BaseModel):
    action: str = Field(min_length=1, max_length=500)
    evidence_score: float = Field(ge=0, le=100)
    policy_violation: bool
    contradiction_detected: bool


class SimulationRequest(BaseModel):
    actions: list[str] = Field(min_length=1, max_length=10)

    @field_validator("actions")
    @classmethod
    def validate_actions(cls, actions):
        if any(
            not isinstance(action, str) or not action.strip()
            for action in actions
        ):
            raise ValueError("Each action must be a non-empty string")

        if any(len(action) > 500 for action in actions):
            raise ValueError("Each action must be 500 characters or fewer")

        return [action.strip() for action in actions]


@app.get("/")
def root():
    return {
        "system": "AEGIS-X",
        "status": "online",
        "message": "AI Agent Reliability & Control System is running",
    }


@app.get("/health")
def health():
    return {
        "status": "healthy",
        "version": "0.2.0",
    }


@app.post("/evaluate", dependencies=[_OPERATOR_AUTH])
def evaluate(request: ActionRequest):
    # Compute the shared policy result once and use it for both the final
    # decision and the response. This prevents REVIEW/ALLOW disagreement.
    policy_analysis = analyze_policy(
        action=request.action,
        evidence_score=request.evidence_score,
        policy_violation=request.policy_violation,
        contradiction_detected=request.contradiction_detected,
    )

    calculated_risk = calculate_risk(
        action=request.action,
        evidence_score=request.evidence_score,
        policy_violation=request.policy_violation,
        contradiction_detected=request.contradiction_detected,
    )

    result = evaluate_action(
        action=request.action,
        evidence_score=request.evidence_score,
        risk_score=calculated_risk,
        policy_violation=request.policy_violation,
        contradiction_detected=request.contradiction_detected,
        requires_human_review=policy_analysis["requires_human_review"],
    )
    result["policy_analysis"] = policy_analysis

    try:
        record_decision(
            action=request.action,
            evidence_score=request.evidence_score,
            policy_violation=request.policy_violation,
            contradiction_detected=request.contradiction_detected,
            result=result,
        )
    except AuditIntegrityError as exc:
        raise HTTPException(
            status_code=503,
            detail=str(exc),
        ) from exc

    return result


@app.post("/simulate", dependencies=[_OPERATOR_AUTH])
def simulate_action_plan(request: SimulationRequest):
    """Preview a multi-step plan without executing any action."""
    return simulate_plan(request.actions)


@app.get("/audit", dependencies=[_AUDIT_AUTH])
def get_audit_history(
    limit: int = Query(default=50, ge=1, le=500),
):
    records = list_audit_records(limit)

    return {
        "count": len(records),
        "records": records,
    }


@app.get("/audit/verify", dependencies=[_AUDIT_AUTH])
def verify_audit_history():
    """Verify the integrity of the stored audit chain."""
    return verify_audit_chain()

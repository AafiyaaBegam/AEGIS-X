from contextlib import asynccontextmanager

from fastapi import FastAPI, Query, HTTPException, Depends
from backend.app import security_store
from backend.app.security_api import (
    router as security_router,
    enforce_api_auth,
    require_roles,
)
from backend.app.engines.approval_store import (
    ApprovalError,
    create_pending_approval,
    list_approvals,
    claim_approval_decision,
    finish_approval,
    list_reconciliation_required,
    record_reconciliation,
)
from backend.app.runtime_config import validate_runtime_configuration
from backend.app.engines.ai_agent import generate_assistance, AIUnavailableError
from pydantic import BaseModel, Field, field_validator

from backend.app.engines.decision_engine import evaluate_action
from backend.app.engines.risk_engine import calculate_risk
from backend.app.engines.policy_engine import analyze_policy
from backend.app.engines.execution_gateway import (
    evaluate_registered_tool,
    execute_tool_after_audit,
)
from backend.app.engines.simulation_engine import simulate_plan
from backend.app.engines.simulation_store import (
    record_simulation,
    list_simulations,
)
from backend.app.engines import audit_store, approval_store, simulation_store
from backend.app.engines.audit_store import (
    record_decision,
    list_audit_records,
    verify_audit_chain,
    AuditIntegrityError,
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    validate_runtime_configuration()
    audit_store.initialize_audit_store()
    approval_store.initialize_approval_store()
    security_store.initialize()
    simulation_store.initialize()
    yield


app = FastAPI(
    title="AEGIS-X",
    description="Autonomous AI Agent Reliability & Control System",
    version="0.2.0",
    lifespan=lifespan,
)

app.include_router(security_router)

_OPERATOR_AUTH = enforce_api_auth(("admin", "operator"))
_AUDIT_AUTH = enforce_api_auth(("admin", "auditor"))


class ActionRequest(BaseModel):
    action: str = Field(min_length=1, max_length=500)
    evidence_score: float = Field(ge=0, le=100)
    policy_violation: bool
    contradiction_detected: bool

    @field_validator("action")
    @classmethod
    def normalize_action(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Action must not be blank.")
        return value


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


class GatewayRequest(BaseModel):
    tool_name: str = Field(min_length=1, max_length=100)
    action: str = Field(min_length=1, max_length=500)
    evidence_score: float = Field(default=90, ge=0, le=100)
    policy_violation: bool = False
    contradiction_detected: bool = False

    @field_validator("tool_name", "action")
    @classmethod
    def normalize_gateway_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Value must not be blank.")
        return value




class ApprovalDecisionRequest(BaseModel):
    decision: str = Field(min_length=6, max_length=7)
    comment: str = Field(default="", max_length=500)

    @field_validator("decision")
    @classmethod
    def normalize_decision(cls, value: str) -> str:
        value = value.strip().upper()
        if value not in {"APPROVE", "REJECT"}:
            raise ValueError("Decision must be APPROVE or REJECT.")
        return value




class AgentAssistRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=2000)

    @field_validator("prompt")
    @classmethod
    def normalize_prompt(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Prompt must not be blank.")
        return value


@app.post("/agent/assist", dependencies=[_OPERATOR_AUTH])
def agent_assist(request: AgentAssistRequest):
    """Provide AI guidance without authorizing or executing actions."""
    try:
        return generate_assistance(request.prompt)
    except AIUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

@app.get("/")
def root():
    return {
        "system": "AEGIS-X",
        "status": "online",
        "message": "AI Agent Reliability & Control System is running",
    }


@app.get("/health")
def health():
    checks = {}

    for name, connect in (
        ("audit_database", audit_store._connect),
        ("approval_database", approval_store._connect),
    ):
        connection = None
        try:
            connection = connect()
            connection.execute("SELECT 1").fetchone()
            checks[name] = "ok"
        except Exception:
            checks[name] = "unavailable"
        finally:
            if connection is not None:
                connection.close()

    try:
        integrity = verify_audit_chain()
        checks["audit_chain"] = (
            "valid" if integrity.get("valid") is True else "invalid"
        )
    except Exception:
        checks["audit_chain"] = "unavailable"

    if (
        checks["audit_database"] != "ok"
        or checks["approval_database"] != "ok"
        or checks["audit_chain"] != "valid"
    ):
        raise HTTPException(
            status_code=503,
            detail={"status": "degraded", "checks": checks},
        )

    return {
        "status": "healthy",
        "version": "0.2.0",
        "checks": checks,
    }


@app.post("/evaluate", dependencies=[_OPERATOR_AUTH])
def evaluate(request: ActionRequest):
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
        audit_record_id = record_decision(
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


@app.post("/gateway/execute", dependencies=[_OPERATOR_AUTH])
def gateway_execute(request: GatewayRequest):
    """Audit the decision successfully before executing an allowed tool."""

    result = evaluate_registered_tool(
        tool_name=request.tool_name,
        action=request.action,
        evidence_score=request.evidence_score,
        policy_violation=request.policy_violation,
        contradiction_detected=request.contradiction_detected,
    )

    try:
        audit_record_id = record_decision(
            action=request.action,
            evidence_score=request.evidence_score,
            policy_violation=request.policy_violation,
            contradiction_detected=request.contradiction_detected,
            result=result,
            tool_name=request.tool_name,
        )
    except AuditIntegrityError as exc:
        raise HTTPException(
            status_code=503,
            detail=str(exc),
        ) from exc

    # Execute only after successful audit persistence.
    return execute_tool_after_audit(result, audit_record_id)



@app.post("/gateway/requests")
def create_gateway_request(
    request: GatewayRequest,
    user=Depends(require_roles("admin", "operator")),
):
    """Evaluate a request and require independent approval for REVIEW."""
    result = evaluate_registered_tool(
        tool_name=request.tool_name,
        action=request.action,
        evidence_score=request.evidence_score,
        policy_violation=request.policy_violation,
        contradiction_detected=request.contradiction_detected,
    )

    try:
        audit_record_id = record_decision(
            action=request.action,
            evidence_score=request.evidence_score,
            policy_violation=request.policy_violation,
            contradiction_detected=request.contradiction_detected,
            result=result,
            tool_name=request.tool_name,
        )
    except AuditIntegrityError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    if result["decision"] == "ALLOW":
        return execute_tool_after_audit(result, audit_record_id)

    if result["decision"] == "BLOCK":
        return result

    try:
        approval = create_pending_approval(
            requested_by=user["username"],
            tool_name=request.tool_name,
            action=request.action,
            evidence_score=request.evidence_score,
            policy_violation=request.policy_violation,
            contradiction_detected=request.contradiction_detected,
            original_audit_record_id=audit_record_id,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="Could not persist the approval request. No tool was executed.",
        ) from exc

    return {
        **result,
        "approval_request": approval,
        "execution_performed": False,
    }


@app.get("/gateway/approvals")
def get_gateway_approvals(
    limit: int = Query(default=50, ge=1, le=500),
    status: str | None = Query(default=None, max_length=20),
    user=Depends(require_roles("admin", "auditor")),
):
    """List approval requests for authorized reviewers."""
    approvals = list_approvals(limit=limit, status=status)
    return {
        "count": len(approvals),
        "approvals": approvals,
    }


class ReconciliationRequest(BaseModel):
    outcome: str = Field(min_length=1, max_length=40)
    explanation: str = Field(min_length=1, max_length=1000)

    @field_validator("outcome")
    @classmethod
    def validate_outcome(cls, value: str) -> str:
        value = value.strip().upper()
        if value not in {"EXECUTED_CONFIRMED", "NOT_EXECUTED_CONFIRMED"}:
            raise ValueError("Invalid reconciliation outcome.")
        return value

    @field_validator("explanation")
    @classmethod
    def validate_explanation(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("A written explanation is required.")
        return value


@app.get("/gateway/reconciliation")
def get_reconciliation_queue(
    limit: int = Query(default=100, ge=1, le=500),
    user=Depends(require_roles("admin", "auditor")),
):
    items = list_reconciliation_required(limit=limit)
    return {"count": len(items), "items": items}


@app.post("/gateway/reconciliation/{approval_id}")
def reconcile_approval(
    approval_id: int,
    request: ReconciliationRequest,
    user=Depends(require_roles("admin", "auditor")),
):
    try:
        record = record_reconciliation(
            approval_id=approval_id,
            reviewer=user["username"],
            outcome=request.outcome,
            explanation=request.explanation,
        )
    except ApprovalError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    return {
        "reconciliation": record,
        "execution_performed": False,
        "message": "Outcome recorded. No tool was executed or retried.",
    }


@app.post("/gateway/approvals/{approval_id}/decision")
def decide_gateway_approval(
    approval_id: int,
    request: ApprovalDecisionRequest,
    user=Depends(require_roles("admin", "auditor")),
):
    """Record an independent review and execute only after fresh evaluation."""
    try:
        approval = claim_approval_decision(
            approval_id=approval_id,
            reviewer=user["username"],
            decision=request.decision,
            comment=request.comment,
        )
    except ApprovalError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    if request.decision == "REJECT":
        try:
            final_record = finish_approval(approval_id, "REJECTED")
        except ApprovalError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

        return {
            "approval": final_record,
            "decision": "REJECTED",
            "execution_performed": False,
        }

    # Re-evaluate the original request. Human approval cannot override BLOCK.
    fresh_result = evaluate_registered_tool(
        tool_name=approval["tool_name"],
        action=approval["action"],
        evidence_score=approval["evidence_score"],
        policy_violation=bool(approval["policy_violation"]),
        contradiction_detected=bool(approval["contradiction_detected"]),
    )

    if fresh_result["decision"] == "BLOCK":
        final_record = finish_approval(approval_id, "BLOCKED")
        return {
            "approval": final_record,
            "result": fresh_result,
            "decision": "BLOCKED",
            "execution_performed": False,
        }

    # Convert only a non-BLOCK result into an explicitly human-approved ALLOW.
    approved_result = dict(fresh_result)
    approved_result["reasons"] = list(fresh_result["reasons"])
    approved_result["reasons"].append(
        f"Human approval granted by {user['username']} "
        f"for approval request #{approval_id}"
    )
    approved_result["decision"] = "ALLOW"
    approved_result["approval_required"] = False

    try:
        audit_record_id = record_decision(
            action=approval["action"],
            evidence_score=approval["evidence_score"],
            policy_violation=bool(approval["policy_violation"]),
            contradiction_detected=bool(approval["contradiction_detected"]),
            result=approved_result,
            tool_name=approval["tool_name"],
        )
    except AuditIntegrityError as exc:
        finish_approval(approval_id, "FAILED")
        raise HTTPException(
            status_code=503,
            detail="Approved action could not be recorded. Nothing was executed.",
        ) from exc

    try:
        execution_result = execute_tool_after_audit(
            approved_result,
            audit_record_id,
        )
    except Exception as exc:
        try:
            finish_approval(approval_id, "RECONCILIATION_REQUIRED")
        except Exception:
            pass
        raise HTTPException(
            status_code=503,
            detail=(
                "Execution outcome is uncertain. Manual reconciliation "
                "is required. This approval must not be retried."
            ),
        ) from exc

    try:
        final_record = finish_approval(approval_id, "EXECUTED")
    except Exception as exc:
        try:
            finish_approval(approval_id, "RECONCILIATION_REQUIRED")
        except Exception:
            pass
        raise HTTPException(
            status_code=503,
            detail=(
                "Execution was attempted, but its final approval status "
                "could not be confirmed. Check the audit ledger and tool "
                "outcome before taking further action. Do not retry."
            ),
        ) from exc

    return {
        "approval": final_record,
        "result": execution_result,
        "decision": "APPROVED_AND_EXECUTED",
        "execution_performed": execution_result["execution_performed"],
        "audit_record_id": audit_record_id,
    }


@app.post("/simulate", dependencies=[_OPERATOR_AUTH])
def simulate_action_plan(request: SimulationRequest):
    """Preview and persist a multi-step plan without executing any action."""

    result = simulate_plan(request.actions)
    record_simulation(request.actions, result)
    return result


@app.get("/simulation-history", dependencies=[_AUDIT_AUTH])
def get_simulation_history(
    limit: int = Query(default=50, ge=1, le=500),
):
    """Return recent plan previews without modifying simulation history."""

    records = list_simulations(limit)

    return {
        "count": len(records),
        "records": records,
    }


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





"""Stage 6 authentication, RBAC, and explainable security-event API."""
from __future__ import annotations

import os
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from pydantic import BaseModel, Field, field_validator

from backend.app.engines.policy_engine import analyze_policy
from backend.app.security_store import (
    SecurityError, add_security_event, authenticate, bootstrap_admin,
    create_user, list_security_events, list_users, login, revoke_session,
    user_count, login_failure_count, record_login_failure, clear_login_failures,
)

router = APIRouter(prefix="/security", tags=["Security & access"])


class BootstrapRequest(BaseModel):
    bootstrap_token: str = Field(min_length=1, max_length=256)
    username: str = Field(min_length=3, max_length=80)
    password: str = Field(min_length=12, max_length=128)


class LoginRequest(BaseModel):
    username: str = Field(min_length=3, max_length=80)
    password: str = Field(min_length=1, max_length=128)


class UserCreateRequest(BaseModel):
    username: str = Field(min_length=3, max_length=80)
    password: str = Field(min_length=12, max_length=128)
    role: str


class EventIngestRequest(BaseModel):
    # Actor identity is always derived from the authenticated session.
    # A client-supplied actor is intentionally not accepted as authority.
    action: str = Field(min_length=1, max_length=500)
    resource: str = Field(min_length=1, max_length=300)
    evidence_score: float = Field(default=100, ge=0, le=100)
    policy_violation: bool = False
    contradiction_detected: bool = False
    source: str = Field(default="submitted-event", min_length=1, max_length=80)

    @field_validator("action", "resource", "source")
    @classmethod
    def reject_blank_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Value must not be blank.")
        return value


def current_user(authorization: Optional[str] = Header(default=None)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Bearer access token required.")
    token = authorization.split(" ", 1)[1].strip()
    try:
        return authenticate(token)
    except SecurityError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc


def require_roles(*roles):
    def dependency(user=Depends(current_user)):
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Your role cannot perform this operation.")
        return user
    return dependency


def enforce_api_auth(user_roles):
    """Evaluate the enforcement switch per request, not at import time."""
    allowed = set(user_roles)

    def dependency(authorization: Optional[str] = Header(default=None)):
        if os.getenv("AEGIS_AUTH_REQUIRED", "0").strip().lower() not in {"1", "true", "yes"}:
            return None
        user = current_user(authorization)
        if user["role"] not in allowed:
            raise HTTPException(status_code=403, detail="Your role cannot perform this operation.")
        return user

    return Depends(dependency)


@router.get("/status")
def security_status():
    return {
        "auth_required_for_core_api": os.getenv("AEGIS_AUTH_REQUIRED", "0").lower() in {"1", "true", "yes"},
        "bootstrap_available": user_count() == 0 and bool(os.getenv("AEGIS_BOOTSTRAP_TOKEN")),
        "user_count": user_count(),
        "roles": ["admin", "operator", "auditor"],
        "event_source_note": "Events are submitted by integrations or test clients; this service does not monitor laptops by itself.",
    }


@router.post("/bootstrap", status_code=201)
def bootstrap(request: BootstrapRequest):
    try:
        user = bootstrap_admin(request.bootstrap_token, request.username, request.password)
        return {"created": True, "user": user}
    except SecurityError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/login")
def create_session(payload: LoginRequest, request: Request):
    # SQLite-backed throttling persists across API process restarts. A shared
    # distributed limiter is still recommended for multi-host deployments.
    client_host = request.client.host if request.client else "unknown"
    key = f"{client_host}:{payload.username.strip().casefold()}"
    if login_failure_count(key) >= 5:
        raise HTTPException(status_code=429, detail="Too many sign-in attempts. Try again in five minutes.")
    try:
        result = login(payload.username, payload.password)
        clear_login_failures(key)
        return result
    except SecurityError as exc:
        record_login_failure(key)
        raise HTTPException(status_code=401, detail=str(exc)) from exc


@router.get("/me")
def who_am_i(user=Depends(current_user)):
    return user


@router.post("/logout")
def logout(user=Depends(current_user)):
    revoke_session(user["jti"])
    return {"revoked": True}


@router.get("/users")
def get_users(user=Depends(require_roles("admin"))):
    return {"count": len(list_users()), "users": list_users()}


@router.post("/users", status_code=201)
def add_user(request: UserCreateRequest, user=Depends(require_roles("admin"))):
    try:
        return create_user(request.username, request.password, request.role)
    except SecurityError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/events")
def get_events(limit: int = Query(default=50, ge=1, le=500),
               user=Depends(require_roles("admin", "operator", "auditor"))):
    events = list_security_events(limit)
    return {"count": len(events), "events": events}


@router.post("/events/ingest", status_code=201)
def ingest_event(request: EventIngestRequest,
                 user=Depends(require_roles("admin", "operator"))):
    analysis = analyze_policy(
        request.action, request.evidence_score,
        request.policy_violation, request.contradiction_detected,
    )
    score = analysis["risk_score"]
    decision = "BLOCK" if request.policy_violation or score >= 70 else (
        "REVIEW" if analysis["requires_human_review"] else "ALLOW"
    )
    severity = "CRITICAL" if decision == "BLOCK" else (
        "HIGH" if decision == "REVIEW" else "INFO"
    )
    reason = "; ".join(item["explanation"] for item in analysis["risk_factors"])
    if not reason:
        reason = "No configured text rule was triggered by the submitted event."
    event_id = add_security_event(
        severity, "ACTION_EVALUATED", user["username"], request.action,
        request.resource, decision, reason, request.source,
    )
    return {
        "event_id": event_id, "severity": severity, "decision": decision,
        "risk_score": score, "reason": reason, "policy_analysis": analysis,
        "notification_recommended": severity in {"CRITICAL", "HIGH"},
        "execution_performed": False,
        "actor": user["username"],
        "actor_identity_verified": True,
        "source_is_client_claimed": True,
        "source_note": "This endpoint evaluates a submitted event; it does not intercept or stop an external action.",
    }

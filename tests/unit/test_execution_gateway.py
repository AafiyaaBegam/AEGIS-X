from backend.app.engines.execution_gateway import execute_registered_tool


def test_registered_safe_tool_executes_after_allow():
    result = execute_registered_tool("read_service_status", "read service status")
    assert result["decision"] == "ALLOW"
    assert result["execution_performed"] is True
    assert result["tool_result"]["status"] == "healthy"


def test_destructive_production_action_is_blocked_before_execution():
    result = execute_registered_tool(
        "read_service_status",
        "delete the production database permanently",
    )
    assert result["decision"] == "BLOCK"
    assert result["execution_performed"] is False
    assert result["tool_result"] is None


def test_production_deploy_requires_review_without_execution():
    result = execute_registered_tool(
        "read_service_status",
        "deploy application to production",
    )
    assert result["decision"] == "REVIEW"
    assert result["approval_required"] is True
    assert result["execution_performed"] is False


def test_unknown_tool_fails_closed():
    result = execute_registered_tool("unknown_tool", "read service status")
    assert result["decision"] == "BLOCK"
    assert result["execution_performed"] is False
    assert result["tool_result"] is None


def test_policy_violation_blocks_registered_tool():
    result = execute_registered_tool(
        "read_service_status",
        "read service status",
        policy_violation=True,
    )
    assert result["decision"] == "BLOCK"
    assert result["execution_performed"] is False


def test_evaluation_does_not_execute_tool(monkeypatch):
    from backend.app.engines import execution_gateway

    calls = []

    def spy_handler():
        calls.append("called")
        return {"status": "healthy"}

    monkeypatch.setitem(
        execution_gateway._TOOL_REGISTRY,
        "read_service_status",
        spy_handler,
    )

    result = execution_gateway.evaluate_registered_tool(
        "read_service_status",
        "read service status",
    )

    assert result["decision"] == "ALLOW"
    assert result["execution_performed"] is False
    assert calls == []


def test_execution_can_happen_only_after_separate_dispatch(monkeypatch):
    from backend.app.engines import execution_gateway
    from backend.app.engines.audit_store import record_decision

    calls = []

    def spy_handler():
        calls.append("called")
        return {"status": "healthy"}

    monkeypatch.setitem(
        execution_gateway._TOOL_REGISTRY,
        "read_service_status",
        spy_handler,
    )

    result = execution_gateway.evaluate_registered_tool(
        "read_service_status",
        "read service status",
    )

    assert calls == []

    audit_record_id = record_decision(
        action="read service status",
        evidence_score=90,
        policy_violation=False,
        contradiction_detected=False,
        result=result,
    )

    execution_gateway.execute_tool_after_audit(result, audit_record_id)

    assert calls == ["called"]


def test_execution_rejects_missing_audit_receipt(monkeypatch):
    from backend.app.engines import execution_gateway

    calls = []

    def spy_handler():
        calls.append("called")
        return {"status": "healthy"}

    monkeypatch.setitem(
        execution_gateway._TOOL_REGISTRY,
        "read_service_status",
        spy_handler,
    )

    result = execution_gateway.evaluate_registered_tool(
        "read_service_status",
        "read service status",
    )

    try:
        execution_gateway.execute_tool_after_audit(result, 0)
        assert False, "Execution should reject a missing audit receipt"
    except RuntimeError as exc:
        assert "audit receipt" in str(exc).lower()

    assert calls == []

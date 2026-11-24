import json
from io import BytesIO
from urllib.error import URLError

import pytest

from examples.aegis_agent_client import (
    AegisGatewayClient,
    AegisGatewayError,
    AgentProposal,
)


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self):
        return json.dumps(self.payload).encode("utf-8")


def test_client_submits_proposal_and_returns_governance_decision(monkeypatch):
    seen = {}

    def fake_urlopen(request, timeout):
        seen["url"] = request.full_url
        seen["method"] = request.get_method()
        seen["auth"] = request.get_header("Authorization")
        seen["timeout"] = timeout
        seen["body"] = json.loads(request.data.decode("utf-8"))
        return FakeResponse({
            "decision": "ALLOW",
            "execution_performed": True,
            "tool_result": {"status": "healthy"},
        })

    monkeypatch.setattr("examples.aegis_agent_client.urlopen", fake_urlopen)
    client = AegisGatewayClient("https://aegis.example/", "secret", 8)
    result = client.submit(AgentProposal("read_service_status", "read service status"))

    assert result["decision"] == "ALLOW"
    assert seen["url"] == "https://aegis.example/gateway/requests"
    assert seen["method"] == "POST"
    assert seen["auth"] == "Bearer secret"
    assert seen["timeout"] == 8
    assert seen["body"]["tool_name"] == "read_service_status"


def test_client_fails_closed_when_gateway_is_unavailable(monkeypatch):
    def unavailable(*args, **kwargs):
        raise URLError("offline")

    monkeypatch.setattr("examples.aegis_agent_client.urlopen", unavailable)
    client = AegisGatewayClient("http://localhost:8000", "secret")

    with pytest.raises(AegisGatewayError, match="must remain unexecuted"):
        client.submit(AgentProposal("read_service_status", "read service status"))


def test_client_rejects_invalid_governance_response(monkeypatch):
    monkeypatch.setattr(
        "examples.aegis_agent_client.urlopen",
        lambda *args, **kwargs: FakeResponse({"decision": "EXECUTE"}),
    )
    client = AegisGatewayClient("http://localhost:8000", "secret")

    with pytest.raises(AegisGatewayError, match="invalid governance response"):
        client.submit(AgentProposal("read_service_status", "read service status"))


@pytest.mark.parametrize("base_url,token", [
    ("ftp://aegis.example", "secret"),
    ("http://localhost:8000", ""),
])
def test_client_rejects_invalid_configuration(base_url, token):
    with pytest.raises(ValueError):
        AegisGatewayClient(base_url, token)


def test_client_rejects_out_of_range_evidence_score():
    client = AegisGatewayClient("http://localhost:8000", "secret")

    with pytest.raises(ValueError, match="between 0 and 100"):
        client.submit(
            AgentProposal("read_service_status", "read service status", 101)
        )

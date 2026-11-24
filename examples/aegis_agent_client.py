"""Small standard-library client for routing agent proposals through AEGIS-X.

The client never executes tools itself. It submits proposals to AEGIS-X and
returns the governance response. Do not automatically retry submissions:
an ALLOW response may already have executed the registered demo tool.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


class AegisGatewayError(RuntimeError):
    """The proposal could not be safely submitted or evaluated."""


@dataclass(frozen=True)
class AgentProposal:
    tool_name: str
    action: str
    evidence_score: float = 90
    policy_violation: bool = False
    contradiction_detected: bool = False


class AegisGatewayClient:
    def __init__(
        self,
        base_url: str,
        bearer_token: str,
        timeout_seconds: float = 15,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.bearer_token = bearer_token.strip()
        self.timeout_seconds = timeout_seconds
        if not self.base_url.startswith(("http://", "https://")):
            raise ValueError("base_url must use http:// or https://")
        if not self.bearer_token:
            raise ValueError("A non-empty AEGIS-X bearer token is required")
        if timeout_seconds <= 0:
            raise ValueError("timeout_seconds must be positive")

    def submit(self, proposal: AgentProposal) -> dict[str, Any]:
        if not proposal.tool_name.strip() or not proposal.action.strip():
            raise ValueError("tool_name and action must not be blank")
        if not 0 <= proposal.evidence_score <= 100:
            raise ValueError("evidence_score must be between 0 and 100")

        payload = {
            "tool_name": proposal.tool_name,
            "action": proposal.action,
            "evidence_score": proposal.evidence_score,
            "policy_violation": proposal.policy_violation,
            "contradiction_detected": proposal.contradiction_detected,
        }
        request = Request(
            f"{self.base_url}/gateway/requests",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self.bearer_token}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            method="POST",
        )

        try:
            with urlopen(request, timeout=self.timeout_seconds) as response:
                result = json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:1000]
            raise AegisGatewayError(
                f"AEGIS-X rejected or could not process the proposal "
                f"(HTTP {exc.code}): {detail}"
            ) from exc
        except (URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
            # Fail closed: do not run the proposed tool when AEGIS-X is
            # unreachable or its response cannot be verified.
            raise AegisGatewayError(
                "AEGIS-X response unavailable; proposal must remain unexecuted. "
                "Do not retry automatically because the first request may "
                "have reached the gateway."
            ) from exc

        if not isinstance(result, dict) or result.get("decision") not in {
            "ALLOW", "REVIEW", "BLOCK"
        }:
            raise AegisGatewayError(
                "AEGIS-X returned an invalid governance response; "
                "proposal must remain unexecuted."
            )

        decision = result["decision"]
        executed = result.get("execution_performed")
        if not isinstance(executed, bool):
            raise AegisGatewayError(
                "AEGIS-X response is missing a valid execution status; "
                "do not run the proposed tool."
            )
        if decision == "ALLOW" and executed is not True:
            raise AegisGatewayError(
                "AEGIS-X returned ALLOW without confirming execution; "
                "do not run the proposed tool or retry automatically."
            )
        if decision in {"REVIEW", "BLOCK"} and executed is not False:
            raise AegisGatewayError(
                "AEGIS-X returned a non-ALLOW decision with an execution "
                "status that is not safely false."
            )
        if decision == "REVIEW" and not isinstance(
            result.get("approval_request"), dict
        ):
            raise AegisGatewayError(
                "AEGIS-X REVIEW response is missing its approval request."
            )
        return result

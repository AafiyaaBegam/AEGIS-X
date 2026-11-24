# External AI-agent integration

AEGIS-X exposes a governed proposal interface for an external agent. The agent
must submit an action to AEGIS-X **before** calling any tool. The agent must
not retain a parallel path that can execute the same action directly.

## Contract

1. The agent plans an action and selects a registered AEGIS-X tool.
2. It submits the proposal to `POST /gateway/requests` with an Operator/Admin
   bearer token.
3. AEGIS-X evaluates policy and risk, writes the decision to the audit store,
   and then returns one of three outcomes:
   - `ALLOW`: the registered harmless demo handler may have executed. Inspect
     `execution_performed` and `tool_result`; do not execute it a second time.
   - `REVIEW`: execution has not happened. A separately authorized reviewer
     must decide through `POST /gateway/approvals/{approval_id}/decision`.
   - `BLOCK`: execution has not happened. The agent must stop that action.
4. If AEGIS-X is unreachable, returns an invalid response, or returns an
   authorization error, the agent must fail closed and not execute the action.

The existing registry intentionally contains only
`read_service_status` and `create_demo_report`. Unknown tools are blocked.
This contract does not grant access to arbitrary shell commands, cloud
infrastructure, databases, or external services.

## Python client example

The standard-library client in `examples/aegis_agent_client.py` submits
proposals and validates the governance response. It does not implement tools
or execute actions itself.

```python
import os
from examples.aegis_agent_client import (
    AegisGatewayClient,
    AgentProposal,
    AegisGatewayError,
)

gateway = AegisGatewayClient(
    base_url=os.environ["AEGIS_BASE_URL"],
    bearer_token=os.environ["AEGIS_OPERATOR_TOKEN"],
)

proposal = AgentProposal(
    tool_name="read_service_status",
    action="read service status",
    evidence_score=90,
)

try:
    decision = gateway.submit(proposal)
except AegisGatewayError:
    # Fail closed: stop; do not call the proposed tool.
    raise

if decision["decision"] == "ALLOW":
    print("AEGIS-X completed the registered demo action:",
          decision.get("tool_result"))
elif decision["decision"] == "REVIEW":
    print("Waiting for human approval:",
          decision.get("approval_request"))
else:
    print("AEGIS-X blocked the action:", decision.get("reasons"))
```

Set `AEGIS_BASE_URL` to the deployed AEGIS-X API origin and
`AEGIS_OPERATOR_TOKEN` to a short-lived Operator token. Never commit tokens
or place them in frontend code.

## Security boundary and limitations

- The agent client is a transport adapter, not an agent runtime or an
  independent security boundary.
- The agent's tool executor must be configured so governed actions can only
  pass through this gateway. A direct tool path would bypass AEGIS-X.
- Do not automatically retry a timed-out submission: the server may have
  received it and executed an ALLOW action before the response was lost.
- Human approval is a separate reviewer operation; an agent must not approve
  its own REVIEW request.
- Only the registered harmless demonstration tools are supported today.
  Integrating real cloud or business actions requires a separately reviewed
  handler, least-privilege credentials, idempotency strategy, and dedicated
  tests before it is added to the registry.
- This is a portfolio prototype integration contract, not a production
  certification or guarantee against a compromised host or privileged user.

## Verification

The repository's gateway unit and API tests cover allow, review, block,
unknown-tool denial, audit-before-execution, and audit-write failure. Run the
backend test command in the root README after changing the integration.

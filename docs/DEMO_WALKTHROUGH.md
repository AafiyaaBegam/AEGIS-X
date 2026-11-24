# AEGIS-X Demo Walkthrough

This walkthrough is for a portfolio review, hackathon demonstration, or technical interview. It demonstrates the current prototype without implying that it controls real infrastructure.

## Demonstration objective

Show that AEGIS-X sits between an agent's proposed action and an allowlisted demonstration handler. It evaluates the proposal, records the decision before execution, requires a separate reviewer for REVIEW, blocks unsafe or unknown requests, and exposes evidence that can be checked.

## Suggested 6–8 minute sequence

### 1. Introduce the control problem

Explain that an autonomous agent can propose a useful action and still be unsafe to execute. AEGIS-X adds a deterministic policy and risk gate, a human approval path, and a tamper-evident decision history.

### 2. Show system status and identity

- Open the dashboard over HTTPS.
- Sign in with the appropriate demo account.
- Show the API connection and system status.
- If using separate roles, explain that Admin/Operator and Auditor permissions are intentionally different.

Never display bootstrap tokens, passwords, bearer tokens, or database credentials during the demo.

### 3. Demonstrate a harmless ALLOW

Submit a proposal for the registered `read_service_status` tool with the matching action text, such as `read service status`, no policy violation, no contradiction, and strong evidence.

Expected behaviour:
- AEGIS-X returns ALLOW.
- The decision is persisted before the handler is called.
- The isolated demo handler returns a service-status result.
- The response reports whether execution occurred and includes the audit record reference.

Emphasize that this is an isolated demonstration handler, not a connection to a real production service.

### 4. Demonstrate REVIEW and human approval

Submit a proposal that the policy classifies as REVIEW, for example a sensitive production-change request.

Expected behaviour:
- A decision is recorded.
- A pending approval is created.
- The tool is not executed while the request is pending.
- A separately authorized reviewer can approve or reject it.
- Approval triggers a fresh policy evaluation; a BLOCK result cannot be overridden by a human approval.

If demonstrating approval, use only a harmless registered tool and clearly label it as a simulation of a gated action.

### 5. Demonstrate BLOCK and unknown-tool denial

Submit a clearly destructive or policy-violating action, then submit a proposal using an unregistered tool name.

Expected behaviour:
- The decision is BLOCK.
- No tool handler is executed.
- The decision and reasons remain inspectable in the audit history.

### 6. Verify the audit history

Open the audit view and run audit verification.

Explain that the project uses a SHA-256 hash chain to make record modification detectable. It is tamper-evident, not independently anchored or absolutely tamper-proof.

### 7. Show plan simulation and security controls

- Preview a multi-step plan and show that simulation does not execute it.
- Show the security-event history and verification status.
- Explain the Admin, Operator, and Auditor role boundaries.

### 8. Close with the external-agent contract

Show `docs/EXTERNAL_AGENT_INTEGRATION.md` and `examples/aegis_agent_client.py`.

Explain that an external agent can submit proposals through `POST /gateway/requests`, but the agent's own tool executor must be configured to prevent a direct bypass. The client is a transport adapter; it is not an agent runtime or a universal enforcement boundary.

## Technical proof points

- Deterministic ALLOW / REVIEW / BLOCK decisions with explainable reasons.
- Explicit allowlist and action-to-tool matching.
- Audit persistence before an allowed demo handler executes.
- One-time execution receipt protection and no automatic retry after uncertain outcomes.
- Independent reviewer workflow for REVIEW.
- Role-based access and revocable bearer sessions.
- Tamper-evident decision and security-event chains.
- CI workflow covering backend tests, policy benchmark, and frontend production build.

## Claims to avoid

Do not claim that AEGIS-X currently:
- Controls arbitrary third-party agent runtimes or prevents every agent-side bypass.
- Executes real cloud, database, payment, medical, or operating-system operations.
- Independently verifies the truth of submitted evidence or client-claimed security events.
- Uses a trained ML detector for policy decisions.
- Provides independently anchored or immutable audit storage.
- Is production-certified or has undergone an independent security audit.

## Final presentation sentence

"AEGIS-X demonstrates an auditable control plane for AI-agent actions: evaluate first, record the decision, require human review when needed, and execute only a registered demonstration action after the governance checks succeed."

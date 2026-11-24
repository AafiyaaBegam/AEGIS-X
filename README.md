# AEGIS-X — AI Agent Governance & Control Plane



**Evaluate. Govern. Verify.**



AEGIS-X is a prototype governance and control plane designed to evaluate proposed AI-agent actions, apply explainable policy decisions, control execution of approved demo tools, and preserve an auditable record of decisions.



Rather than allowing every proposed action to execute directly, AEGIS-X introduces a control layer between action proposals and execution.



## The problem



AI agents can propose actions that are destructive, unauthorized, financially sensitive, or operationally risky.



A system needs more than an agent that can perform tasks. It needs a way to assess proposed actions, require human review when appropriate, prevent blocked actions from executing, and retain evidence of its decisions.



## The solution



AEGIS-X provides a structured workflow:



1\. Receive a proposed action and its supporting signals.

2\. Evaluate it using deterministic policy rules.

3\. Classify the decision as **ALLOW**, **REVIEW**, or **BLOCK**.

4\. Persist the decision in the audit log.

5\. Execute an allowlisted demonstration tool only after successful audit persistence.

6\. Verify the integrity of the recorded decision history.



The system also provides non-executing plan simulations, role-based access, and security-event ingestion.



## Core capabilities



### 1. Policy evaluation

\- Deterministic, explainable text-and-input-signal assessment.

\- Risk scoring and policy reason reporting.

\- ALLOW, REVIEW, and BLOCK decision outcomes.

\- Handling of production changes, destructive operations, financial actions, privilege changes, and evidence signals.



### 2. Controlled execution gateway

\- Allowlisted demonstration tools.

\- Policy evaluation before execution.

\- Audit persistence before an allowed tool is dispatched.

\- REVIEW actions remain unexecuted pending review.

\- BLOCK actions are not executed.

\- Unknown tools fail closed.



The current gateway uses harmless demonstration handlers. It does not control real infrastructure or external services.



### 3. Tamper-evident decision audit

\- Persistent SQLite decision records.

\- SHA-256 hash-chain verification.

\- Audit-history inspection.

\- Audit-integrity checks before appending new decisions.



The hash chain is tamper-evident, not independently anchored or absolutely tamper-proof.



### 4. Plan simulation

\- Preview proposed multi-step plans.

\- Inspect simulation history.

\- Keep simulation records separate from the decision audit chain.

\- Simulations do not execute infrastructure or financial operations.



### 5. Security and access control

\- PBKDF2-HMAC-SHA256 salted password hashing.

\- Signed, expiring bearer sessions.

\- Persisted session revocation.

\- Administrator, Operator, and Auditor roles.

\- One-time administrator bootstrap.

\- Persistent local login throttling.

\- Security-event ingestion and history.



### 6. Frontend control interface

A React-based interface for interacting with the control plane, inspecting decisions, reviewing simulations, and exploring audit and security information.



## Architecture



```text

&#x20;                AEGIS-X CONTROL PLANE

&#x20;                         |

&#x20;                 Proposed Action

&#x20;                         |

&#x20;                  Policy Engine

&#x20;                         |

&#x20;                Risk Assessment

&#x20;                         |

&#x20;            +------------+------------+

&#x20;            |            |            |

&#x20;          ALLOW        REVIEW        BLOCK

&#x20;            |            |            |

&#x20;       Persist Audit   Hold for      Reject

&#x20;            |           Review       Execution

&#x20;       Verify Receipt

&#x20;            |

&#x20;      Execution Gateway

&#x20;            |

&#x20;      Allowlisted Tool

&#x20;            |

&#x20;       Tool Result



&#x20;     Audit History / Verification

&#x20;     Security & Access Management

&#x20;     Plan Simulation & History

```



## Technology stack



| Layer | Technology |

|---|---|

| Backend API | Python, FastAPI |

| Frontend | React 18 |

| Frontend tooling | Vite 6 |

| Database | SQLite for local development/tests; Turso Cloud for hosted production mode |

| Authentication | Signed bearer sessions |

| Password security | PBKDF2-HMAC-SHA256 |

| Audit integrity | SHA-256 hash chain |

| Testing | pytest |

| CI/CD validation | GitHub Actions |



## API overview



### Core API



| Method | Endpoint | Purpose |

|---|---|---|

| GET | `/` | Service information |

| GET | `/health` | Health check |

| POST | `/evaluate` | Evaluate a proposed action |

| POST | `/gateway/execute` | Evaluate and dispatch an allowed demo tool |

| POST | `/simulate` | Preview a proposed plan |

| GET | `/simulation-history` | Retrieve simulation history |

| GET | `/audit` | Inspect decision records |

| GET | `/audit/verify` | Verify audit-chain integrity |



### Security API



| Method | Endpoint | Purpose |

|---|---|---|

| GET | `/security/status` | Security and bootstrap status |

| POST | `/security/bootstrap` | Create the first administrator |

| POST | `/security/login` | Authenticate and create a session |

| GET | `/security/me` | Inspect current identity |

| POST | `/security/logout` | Revoke the current session |

| GET / POST | `/security/users` | User administration |

| GET | `/security/events` | Inspect security events |

| POST | `/security/events/ingest` | Submit a security event |



Interactive API documentation is available at `/docs` when the backend is running.



## Getting started



### Prerequisites



\- Python 3.14 or a compatible supported Python version

\- Node.js and npm

\- Git



### 1. Clone the repository



```bash

git clone https://github.com/AafiyaaBegam/AEGIS-X.git

cd AEGIS-X

```



### 2. Set up the backend



Windows PowerShell:



```powershell

python -m venv .venv

.\\.venv\\Scripts\\Activate.ps1



python -m pip install -r backend/requirements.txt

python -m pip install -r backend/requirements-dev.txt

```



### 3. Start the backend



```powershell

python -m uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000

```



API documentation:



`http://127.0.0.1:8000/docs`



### 4. Start the frontend



Open another terminal:



```powershell

cd frontend

npm install

npm run dev

```



Open:



`http://127.0.0.1:5173`



The Vite development server proxies `/api` requests to the backend at `http://127.0.0.1:8000`.



## Authentication setup



For local security testing, configure a one-time bootstrap token before starting the backend:



```powershell

$env:AEGIS\_BOOTSTRAP\_TOKEN = "replace-with-a-long-random-secret"

```



Create the first administrator using the `/security/bootstrap` endpoint. Then authenticate through `/security/login`.



After creating users and confirming login, enable role enforcement for the core APIs:



```powershell

$env:AEGIS\_AUTH\_REQUIRED = "1"

```



Restart the backend after changing environment variables.



Do not use example credentials or development secrets in a public deployment. Configure a strong `AEGIS\_TOKEN\_SECRET` and protect all secrets appropriately.



See \[Stage 6 Security](docs/STAGE6\_SECURITY.md) for the detailed setup.



## Testing and validation



Run the backend tests:



```powershell

.\\.venv\\Scripts\\python.exe -m pytest -q --ignore=AEGIS-X-Stage5-Source

```



Run the policy benchmark:



```powershell

.\\.venv\\Scripts\\python.exe scripts/run\_policy\_benchmark.py

.\\.venv\\Scripts\\python.exe -m pytest -q tests/benchmarks

```



Build the frontend:



```powershell

cd frontend

npm ci

npm run build

```



GitHub Actions is configured to run backend tests, the policy benchmark, and the frontend production build.



**Latest local validation reported:** 159 backend tests passed, and the frontend production build completed successfully. These are local results, not a claim of an independently verified hosted deployment.



## Project documentation



| Document | Description |

|---|---|

| `docs/DEVELOPMENT.md` | Development setup and workflow |

| `docs/POLICY\_BENCHMARK.md` | Policy benchmark methodology and limitations |

| `docs/SECURITY\_HARDENING.md` | Security controls and hardening requirements |

| `docs/STAGE6\_SECURITY.md` | Authentication, roles, and security-event setup |

| `docs/EXTERNAL_AGENT_INTEGRATION.md` | External-agent proposal contract, Python client, and fail-closed rules |

| `docs/PRODUCTION_DEPLOYMENT.md` | Hosted deployment configuration and acceptance runbook |

| `examples/aegis_agent_client.py` | Standard-library Python client for governed agent proposals |



## Important limitations



AEGIS-X is a development and portfolio prototype, not a production-certified security product.



\- Policy evaluation is deterministic and rule-based, not a trained machine-learning detector.

\- The policy engine cannot independently establish the truth of supplied evidence.

\- The current gateway executes only harmless demonstration tools.

\- Simulations do not execute real infrastructure or financial operations.

\- Security-event ingestion does not independently monitor endpoint devices or intercept operating-system actions.

\- Submitted event-source metadata is client-claimed and is not independently attested.

\- The SHA-256 audit chain is not independently anchored. An attacker with sufficient database access could potentially rewrite the database and recompute the chain.

\- SQLite protections do not prevent a privileged administrator from replacing the database or changing its schema.

\- Production use would require additional infrastructure integrations, independent security review, TLS, protected secrets, distributed rate limiting, monitoring, and independently stored audit checkpoints.



## Project status



**Hosted portfolio prototype — verified November 24, 2026.** The Render backend and frontend are deployed and live. The authenticated dashboard is displaying live health, audit, and security data; production request logs confirm successful responses for `/health`, `/audit`, `/audit/verify`, and `/security/status`. The backend health response reports its database checks and audit-chain checks as healthy/valid. The deployment is a demonstrator, not a production-certified security product; see the limitations above.



AEGIS-X is being developed as an exploration of explainable AI-agent governance, controlled execution, and auditable decision systems.



\---



**Developed by Aafiyaa Begam M**



GitHub: \[AafiyaaBegam](https://github.com/AafiyaaBegam)

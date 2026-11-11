# AEGIS-X Development Setup

## Prerequisites

- Python 3.14 or a compatible supported Python version
- Node.js and npm
- Git

## Backend setup

From the project root:

    python -m venv .venv

Activate on Windows PowerShell:

    .\.venv\Scripts\Activate.ps1

Install production dependencies:

    python -m pip install -r backend/requirements.txt

Install development and test dependencies:

    python -m pip install -r backend/requirements-dev.txt

Start the API:

    python -m uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000

API documentation:

    http://127.0.0.1:8000/docs

## Frontend setup

    cd frontend
    npm install
    npm run dev

Dashboard:

    http://127.0.0.1:5173

The Vite development server proxies /api requests to the backend at
http://127.0.0.1:8000.

## Tests

From the project root:

    python -m pytest -q

## Production frontend build

    cd frontend
    npm run build

## Local data

SQLite databases are stored under data/. They are local runtime data and
are intentionally excluded from version control.

## Safety limitation

The current simulation engine is deterministic and rule-based. It previews
proposed actions and does not execute infrastructure or financial operations.
Its output must not be treated as a substitute for production authorization,
security controls, or human approval.

# Documentation Index

This index lists documentation files that currently exist in the repository. Treat the Source of Truth as intended behavior, not proof that every requirement is implemented.

## Core project documents

- [Source of Truth](./SOURCE-OF-TRUTH.md) — product specification, architecture decisions, and historical roadmap.
- [Documentation status and audit](./DOCUMENTATION-STATUS.md) — verified findings, known discrepancies, and remaining audit work.
- [API and authorization reference](./API-REFERENCE.md) — route-group inventory and selected authorization behavior.

## Setup and deployment

- [Development guide](../development.md) — local setup, tests, generated client, and contributor workflow.
- [FastAPI Cloud deployment](../deployment.md) — managed deployment workflow.
- [Docker Compose deployment](../deployment-docker-compose.md) — self-hosted deployment.
- [Backend README](../backend/README.md) — backend-specific contributor notes.
- [Frontend README](../frontend/README.md) — frontend setup and contributor notes.
- [Root README](../README.md) — current project overview and feature status.

## Historical audit note

- [Dashboard data-flow audit](../DASHBOARD_AUDIT.md) — an older read-only analysis. Its findings have not been fully revalidated against the current dashboard components, so verify each claim against current code and tests before relying on it.

## Documentation rule

Keep permanent decisions, specifications, implementation constraints, and verified QA baselines here. Do not commit generated Playwright reports, coverage reports, screenshots, logs, or other run-specific artifacts unless they are intentionally being preserved as project documentation.

# Documentation Status and Audit

**Audit started:** 2026-10-10  
**Scope:** Documentation accuracy against the repository's current configuration and implementation.  
**Status:** Initial pass. This is a working checklist, not a claim that every file or feature has been fully verified.

## Documentation map

| Document | Intended purpose | Initial finding |
|---|---|---|
| [Root README](../README.md) | Project overview, current features, stack, links | Already distinguishes implemented features from planned work. Some links and statements still need verification. |
| [Development guide](../development.md) | Local setup, tests, generated client, common workflow | Detailed and candid about configuration gaps. Re-check commands against current scripts and CI workflows before simplifying it. |
| [FastAPI Cloud deployment](../deployment.md) | Managed deployment | Verify workflow triggers, required variables/secrets, and deployment steps. |
| [Docker Compose deployment](../deployment-docker-compose.md) | Self-hosted deployment | Verify against the current Compose files and deployment workflow. |
| [Backend README](../backend/README.md) | Backend architecture and contributor workflow | Replaced with a concise contributor guide based on current route/model structure and linked to the central guides. |
| [Frontend README](../frontend/README.md) | Frontend setup and contributor workflow | Previously instructed users to open the dev server over HTTP despite the HTTPS certificate configuration. Updated in this pass. |
| [Source of Truth](./SOURCE-OF-TRUTH.md) | Intended behavior, architecture, and roadmap | Treat as the product specification, not proof that a feature is implemented. Reconcile it with the current code as a separate task. |
| Student field-mapping guide | Import mapping details | The root README links to `docs/Phase-3-Student-Data-Field-Mapping.md`, but that exact path was not found on the default branch during this audit. Locate the authoritative version or correct/remove the link. |

## Documentation rules

1. **Implementation is the source for current behavior.** Verify claims against routes, models, frontend routes, configuration, migrations, scripts, tests, and CI workflows.
2. **The Source of Truth describes intended behavior.** Keep roadmap requirements clearly labeled as planned until the implementation and tests support them.
3. **Do not invent schema names.** Use the actual SQLModel table definitions and migrations. Confirm names before documenting them.
4. **Do not recommend destructive database commands casually.** In particular, do not suggest `docker compose down -v` as routine cleanup because it removes volumes and can delete database data.
5. **Keep secrets out of examples.** Use placeholders and point to `.env.example`; never document real credentials.
6. **Use one canonical guide per topic.** Keep the root README concise and link to setup/deployment guides rather than duplicating long procedures.
7. **Update docs with behavior changes.** API, database, role/permission, offline-sync, import, and deployment changes should include a documentation review.

## Initial findings

- The root README already separates implemented features from planned functionality. Preserve that distinction and verify it as features change.
- The root README incorrectly stated that no export endpoints exist. The current `GET /api/v1/attendance/export` route implements CSV export. Excel, Word, PDF, and printable roster export remain unverified/not implemented.
- The backend README's local setup referenced a Mailpit service, HTTP URLs, and destructive volume cleanup that do not match the development guide's description of the current repository configuration.
- The frontend README's quick start pointed to plain HTTP, while the current Vite configuration requires local TLS certificates for its HTTPS dev server.
- The root README's student field-mapping link did not resolve at the documented path.
- The development guide itself describes known mismatches between Compose services and CI workflows. These are repository/configuration issues to track, not gaps to conceal with documentation wording.

## Recommended order

- [x] Create this audit and establish documentation accuracy rules.
- [x] Correct the backend README's high-risk stale claims and point contributors to the central setup guide.
- [x] Correct the frontend README's HTTPS setup guidance.
- [x] Add an initial API route-group and authorization reference from the registered routers and inspected dependencies.
- [x] Correct the root README's role list: Developer is a separate capability, not a fifth `UserRole` enum value.
- [x] Correct the root README's export status to acknowledge CSV export while keeping advanced formats marked as not implemented.
- [ ] Verify every root README feature claim against current routes, models, tests, and frontend pages.
- [ ] Expand the API reference to an endpoint-by-endpoint contract only after validating route decorators, response schemas, and authorization tests.
- [ ] Inventory API routes and permissions from the actual FastAPI route registrations and dependencies.
- [ ] Document the actual database schema and migration head without assuming table names. The model inventory has been checked, but a dedicated data-model guide and migration-head verification remain outstanding.
- [ ] Reconcile the Source of Truth with current behavior and label each requirement as implemented, partial, planned, or blocked.
- [ ] Verify local development and CI instructions against the workflow files and Compose configuration.
- [ ] Verify both deployment guides against the current deployment workflows.
- [ ] Fix broken links and remove duplicated or generic template documentation only after checking whether it contains project-specific details.

## Additional implementation checks completed in this pass

- Confirmed that `backend/app/api/main.py` registers route groups for academic catalog/registry, students, attendees and credentials, events/registrations, attendance/sessions/corrections, class representatives, imports, login/users, and developer operations.
- Confirmed the `UserRole` enum contains `super_admin`, `admin`, `class_representative`, and `student`. Developer access is a separate `is_developer` capability, and scanner access also has a separate `can_scan` permission.
- Confirmed that `GET /api/v1/attendance/export` implements CSV export and applies route-level filters. This does not establish that Excel, Word, PDF, or printable roster formats exist.
- Confirmed academic year, enrollment, and class-representative assignment models are defined in `backend/app/student_academics.py`; major catalog models are in `backend/app/academic_catalog.py`.

## Verification standard

A statement should be considered verified only when supported by the relevant implementation or configuration. For example:

- Feature claims: route/page implementation and meaningful tests.
- Schema claims: SQLModel definitions plus migrations.
- Permission claims: authorization dependencies and tests.
- Setup commands: current scripts, package commands, Compose files, and CI workflows.
- Deployment claims: workflow triggers, required variables/secrets, and deployment configuration.

Record unresolved mismatches here rather than silently presenting assumptions as facts.

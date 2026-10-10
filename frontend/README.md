# Frontend

The frontend is a React and TypeScript application built with Vite. It uses TanStack Router, TanStack Query, Tailwind CSS, shadcn/ui, and a generated typed client based on the backend's OpenAPI schema.

## Requirements

- [Bun](https://bun.sh/)
- A running backend and reachable PostgreSQL database for features that require API access
- A locally trusted TLS certificate for the development server

## Local development

From the repository root:

```bash
bun install
bun run dev
```

The dev server is configured for **HTTPS**, not plain HTTP. The Vite configuration expects these files:

- `frontend/.certs/localhost+lan-key.pem`
- `frontend/.certs/localhost+lan.pem`

The `.certs` directory is gitignored. Create a locally trusted certificate with a tool such as [mkcert](https://github.com/FiloSottile/mkcert), using the filenames and hostnames/IP addresses required by `frontend/vite.config.ts`. Open the HTTPS URL printed by Vite rather than assuming the server is available at `http://localhost:5173`.

The Vite dev server proxies `/api` requests to the backend. Start the backend separately and follow the root [Development Guide](../development.md) for database setup, startup commands, and troubleshooting.

## Build

From the repository root, run:

```bash
bun run build
```

The production build is configured to output to `backend/app/frontend`, allowing FastAPI to serve the frontend from the same origin. Rebuild after frontend changes when testing the backend-served production build.

## Generated API client

The typed API client under `frontend/src/client` is generated from the backend's OpenAPI schema. When backend routes or schemas change, regenerate and commit the client using the repository-supported command:

```bash
bash ./scripts/generate-client.sh
```

See the [Development Guide](../development.md) for details and prerequisites.

## Tests and code quality

Playwright end-to-end tests are under `frontend/tests`. Their environment requirements depend on the current CI and Compose configuration. Follow the [Development Guide](../development.md) and active workflow definitions before running them; do not assume older instructions about Compose services remain valid.

Check `frontend/package.json` for the current package scripts, including linting and client generation.

## Scanning and offline behavior

The app supports QR scanning and uses the browser Web NFC API where available. Web NFC requires a supported Chromium-based browser on Android and a secure context. Offline attendance behavior involves the service worker and browser-side storage, so changes to caching or sync logic should be checked against the current implementation and end-to-end tests.

## Documentation maintenance

Keep page and feature claims aligned with the actual route files and tests. Track broader documentation mismatches in [Documentation Status and Audit](../docs/DOCUMENTATION-STATUS.md).

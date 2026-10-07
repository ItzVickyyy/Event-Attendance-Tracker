#! /usr/bin/env bash

set -e
set -x

cd backend
FASTAPI_ENV=development uv run python -c "import app.main; import json; print(json.dumps(app.main.app.openapi()))" > ../openapi.json
cd ..
mv openapi.json frontend/
bun run --filter frontend generate-client
# The generated SDK includes whitespace-only lines. Normalize them so the
# generated diff passes the repository's whitespace checks consistently.
sed -i 's/[[:space:]]*$//' frontend/src/client/sdk.gen.ts
bun run lint

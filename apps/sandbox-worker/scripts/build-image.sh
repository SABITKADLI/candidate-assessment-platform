#!/usr/bin/env bash
# Build the sandbox image. Runs from apps/sandbox-worker/.
# Produces:  cap/sandbox:latest (configurable via IMAGE=...)
set -euo pipefail

IMAGE="${IMAGE:-cap/sandbox:latest}"
HERE="$(cd "$(dirname "$0")"/.. && pwd)"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

# Assemble a tiny builder context so Dockerfile's "runner-src/" path resolves.
mkdir -p "$STAGE/runner-src/src"
cp "$HERE/src/runner/runner.ts" "$STAGE/runner-src/src/runner.ts"
cp "$HERE/src/protocol.ts"       "$STAGE/runner-src/protocol.ts"

cat > "$STAGE/runner-src/package.json" <<'JSON'
{
  "name": "runner",
  "private": true,
  "type": "module",
  "dependencies": {},
  "devDependencies": { "typescript": "5.6.3", "@types/node": "20" }
}
JSON

cat > "$STAGE/runner-src/tsconfig.json" <<'JSON'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "outDir": "./dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts", "protocol.ts"]
}
JSON

cp "$HERE/Dockerfile.runner" "$STAGE/Dockerfile"

docker build -t "$IMAGE" "$STAGE"
echo "built: $IMAGE"

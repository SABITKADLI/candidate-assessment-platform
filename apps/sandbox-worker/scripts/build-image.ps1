param(
  [string] $Image = $(if ($env:IMAGE) { $env:IMAGE } else { "cap/sandbox:latest" })
)

$ErrorActionPreference = "Stop"

$here = Resolve-Path (Join-Path $PSScriptRoot "..")
$stage = Join-Path ([System.IO.Path]::GetTempPath()) ("cap-sandbox-build-" + [System.Guid]::NewGuid().ToString("N"))

try {
  New-Item -ItemType Directory -Force -Path (Join-Path $stage "runner-src/src") | Out-Null

  Copy-Item -LiteralPath (Join-Path $here "src/runner/runner.ts") -Destination (Join-Path $stage "runner-src/src/runner.ts")
  Copy-Item -LiteralPath (Join-Path $here "src/protocol.ts") -Destination (Join-Path $stage "runner-src/protocol.ts")
  Copy-Item -LiteralPath (Join-Path $here "Dockerfile.runner") -Destination (Join-Path $stage "Dockerfile")

  Set-Content -LiteralPath (Join-Path $stage "runner-src/package.json") -Encoding ascii -Value @'
{
  "name": "runner",
  "private": true,
  "type": "module",
  "dependencies": {},
  "devDependencies": { "typescript": "5.6.3", "@types/node": "20" }
}
'@

  Set-Content -LiteralPath (Join-Path $stage "runner-src/tsconfig.json") -Encoding ascii -Value @'
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
'@

  docker build -t $Image $stage
  Write-Output "built: $Image"
} finally {
  Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
}

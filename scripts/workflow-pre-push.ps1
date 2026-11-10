# Runs workflow release gates locally. Does not commit, push, or stage.
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

Write-Host '=== Workflow pre-push gates ===' -ForegroundColor Cyan

& $PSScriptRoot/verify-workflow-release-coverage.ps1
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

npm run typecheck
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

npm run lint -- --quiet
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

npm run test:workflow-release-gates
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ''
Write-Host 'Coverage, typecheck, lint, and workflow-release-gates passed.' -ForegroundColor Green
Write-Host 'Run npm run build before push if this release has not been built on this tree yet.'

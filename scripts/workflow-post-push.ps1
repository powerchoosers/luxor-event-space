# Post-deploy checks after workflow release (no git operations).
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

Write-Host '=== Workflow post-push checks ===' -ForegroundColor Cyan
& $PSScriptRoot/workflow-www-api-smoke.ps1
$code = $LASTEXITCODE
Write-Host ''
if ($code -eq 0) {
  Write-Host 'Production serves all system-messages routes (not 404).' -ForegroundColor Green
} elseif ($code -eq 2) {
  Write-Host 'Routes still 404 — confirm Vercel finished deploying the workflow commit.' -ForegroundColor Yellow
} else {
  Write-Host 'API smoke failed with exit code' $code -ForegroundColor Red
}
Write-Host 'Next: portal QA — scripts/workflow-www-qa-urls.ps1 and handoff step 5–6.'
exit $code

# Prints git add commands for a workflow-scoped release. Does not run git add unless -Execute is passed.
param([switch]$Execute)

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
. (Join-Path $PSScriptRoot 'workflow-release-scoping.ps1')

$workflow = Get-WorkflowScopedPaths

if ($workflow.Count -eq 0) {
  Write-Host 'No workflow-scoped changed files to stage.'
  exit 0
}

Write-Host "Staging $($workflow.Count) paths (workflow-scoped heuristic)."
foreach ($p in $workflow) {
  if ($Execute) {
    git add -- "$p"
  } else {
    Write-Host "git add -- `"$p`""
  }
}

if (-not $Execute) {
  Write-Host ''
  Write-Host 'Dry run only. Re-run with -Execute after Lewis authorizes the release commit.'
}

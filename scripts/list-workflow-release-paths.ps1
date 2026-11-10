# Lists changed paths likely belonging to the Luxor Workflows release (excludes obvious finance-only areas).
# Use after `git status` to plan a scoped commit; does not stage anything.
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$env:GIT_OPTIONAL_LOCKS = '0'
. (Join-Path $PSScriptRoot 'workflow-release-scoping.ps1')

$changed = Get-WorkflowChangedPaths
$workflow = Get-WorkflowScopedPaths $changed

Write-Host "=== Workflow-scoped paths to stage ($($workflow.Count)) ==="
$workflow | ForEach-Object { Write-Host $_ }

$financeOnly = $changed | Where-Object { $_ -notin $workflow }
if ($financeOnly.Count -gt 0) {
  Write-Host ""
  Write-Host "=== Excluded (finance / other) — not staged by workflow scripts ($($financeOnly.Count)) ==="
  $financeOnly | Select-Object -First 20 | ForEach-Object { Write-Host $_ }
  if ($financeOnly.Count -gt 20) { Write-Host "... $($financeOnly.Count - 20) more" }
}

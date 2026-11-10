# Fails if any marketing system-messages route is missing from the workflow-scoped file list.
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
. (Join-Path $PSScriptRoot 'workflow-release-scoping.ps1')

$root = (Get-Location).Path
$routes = Get-ChildItem (Join-Path $root 'src/app/api/marketing/system-messages') -Recurse -Filter 'route.ts' | ForEach-Object {
  $_.FullName.Substring($root.Length + 1) -replace '\\', '/'
}

$exclude = Get-WorkflowReleaseExcludePatterns
$workflow = Get-WorkflowScopedPaths

$leaks = $workflow | Where-Object { $path = $_; ($exclude | Where-Object { $path -like "$_*" }) }
if ($leaks.Count -gt 0) {
  Write-Host "Exclude filter failed; finance or bill paths would be staged ($($leaks.Count)):"
  $leaks | Select-Object -First 15 | ForEach-Object { Write-Host "  $_" }
  exit 1
}

$missing = @()
foreach ($route in $routes) {
  if ($workflow -notcontains $route) { $missing += $route }
}

if ($missing.Count -gt 0) {
  Write-Host "Missing from workflow-scoped release list ($($missing.Count)):"
  $missing | ForEach-Object { Write-Host "  $_" }
  exit 1
}

Write-Host "OK: all $($routes.Count) system-messages routes are in the workflow-scoped change set ($($workflow.Count) paths total)."

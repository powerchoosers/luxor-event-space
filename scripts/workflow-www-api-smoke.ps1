# Checks whether production serves system-messages APIs (401/403 = routes exist; 404 = app not deployed).
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$apiRoot = Join-Path $root 'src/app/api/marketing/system-messages'
$folders = Get-ChildItem $apiRoot -Directory | Where-Object { Test-Path (Join-Path $_.FullName 'route.ts') } | ForEach-Object { $_.Name }

$base = 'https://www.luxoratlaspalmas.com/api/marketing/system-messages'
$results = @()
foreach ($folder in $folders) {
  $url = "$base/$folder"
  $status = -1
  try {
    $resp = Invoke-WebRequest -Uri $url -Method Get -UseBasicParsing
    $status = [int]$resp.StatusCode
  } catch {
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      $status = [int]$_.Exception.Response.StatusCode
    }
  }
  $results += [pscustomobject]@{ Route = $folder; Status = $status }
}

$missing = $results | Where-Object { $_.Status -eq 404 }
$live = $results | Where-Object { $_.Status -ne 404 -and $_.Status -ge 0 }

Write-Host "System-messages API smoke ($($folders.Count) routes)"
Write-Host "  Deployed (not 404): $($live.Count)"
Write-Host "  Still 404: $($missing.Count)"
if ($missing.Count -gt 0 -and $missing.Count -le 8) {
  $missing | ForEach-Object { Write-Host "    $($_.Route)" }
} elseif ($missing.Count -gt 8) {
  Write-Host '    (all routes still 404 — production app likely pre-workflow deploy)'
}
if ($live.Count -gt 0) {
  $live | Group-Object Status | ForEach-Object { Write-Host "  HTTP $($_.Name): $($_.Count) routes" }
}
if ($missing.Count -eq 0) {
  exit 0
}
exit 2

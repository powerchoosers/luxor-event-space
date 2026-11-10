# Lists checked-in Supabase migration *filenames* in this repo after cutoff 20261109184613.
# Does NOT compare to the remote database — call Supabase list_migrations (or MCP) for remote head.
# Does not apply migrations. Use only when Lewis authorizes database changes.
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$cutoff = '20261109184613'
Get-ChildItem (Join-Path $repoRoot 'supabase/migrations/*.sql') |
  Where-Object {
    if ($_.Name -match '^(\d{14})_') { return $Matches[1] -gt $cutoff }
    return $false
  } |
  Sort-Object Name |
  ForEach-Object { $_.Name }

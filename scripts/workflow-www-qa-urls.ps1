# Prints production builder URLs for each system workflow (post-deploy smoke checklist).
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$catalog = Join-Path $root 'src/lib/luxorSystemWorkflowCatalog.ts'
$text = Get-Content $catalog -Raw
$ids = [regex]::Matches($text, "\['(system-[^']+)'") | ForEach-Object { $_.Groups[1].Value }
$base = 'https://www.luxoratlaspalmas.com/portal/marketing/custom-workflows/'
Write-Host "System workflow URLs ($($ids.Count) entries):"
foreach ($id in $ids) {
  Write-Host "$base$id"
}
Write-Host 'https://www.luxoratlaspalmas.com/portal/marketing/custom-workflows/system-brochure'
Write-Host ''
Write-Host 'Also open Marketing → Automations with ?tab=automations and confirm System-managed workflows (brochure is listed separately).'

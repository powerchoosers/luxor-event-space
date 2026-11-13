param([string]$Bin='C:\Program Files\PostgreSQL\17\bin',[int]$Port=55441)
# Local disposable PostgreSQL only. No project credentials or production URLs.
$ErrorActionPreference='Stop'
if($Port -lt 49152 -or $Port -gt 65535){throw 'Use a high local test port'}
if(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue){throw 'Fixture port already occupied'}
$SourceSql=Join-Path $PSScriptRoot '..\..\supabase\migrations\20261113010000_luxor_funnel_goals.sql'
if(-not(Test-Path -LiteralPath $SourceSql)){throw 'Migration missing'}
foreach($exe in @('psql.exe','initdb.exe','pg_ctl.exe','createdb.exe')){if(-not(Test-Path -LiteralPath (Join-Path $Bin $exe))){throw "Missing $exe"}}
$Root=Join-Path ([IO.Path]::GetTempPath()) ('luxor-funnel-goals-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $Root | Out-Null
$Data=Join-Path $Root 'data'
Write-Output "Disposable evidence directory: $Root"
Get-FileHash -LiteralPath $SourceSql -Algorithm SHA256
Copy-Item -LiteralPath $SourceSql -Destination (Join-Path $Root 'candidate.sql')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'funnel-goals-bootstrap.sql') -Destination (Join-Path $Root 'bootstrap.sql')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'funnel-goals-assertions.sql') -Destination (Join-Path $Root 'assertions.sql')
& "$Bin\initdb.exe" -D $Data -U postgres -A trust --encoding=UTF8 --locale=C *> (Join-Path $Root 'init.log')
if($LASTEXITCODE -ne 0){throw 'initdb failed'}
& "$Bin\pg_ctl.exe" -D $Data -l (Join-Path $Root 'server.log') -o "-h 127.0.0.1 -p $Port" -w start
if($LASTEXITCODE -ne 0){throw 'Local cluster start failed'}
try {
 foreach($file in @('bootstrap.sql','candidate.sql','assertions.sql')){
  & "$Bin\psql.exe" -h 127.0.0.1 -p $Port -U postgres -d postgres -v ON_ERROR_STOP=1 -f (Join-Path $Root $file)
  if($LASTEXITCODE -ne 0){throw "Fixture step failed: $file"}
 }
}finally{& "$Bin\pg_ctl.exe" -D $Data -m fast -w stop}
& (Join-Path $PSScriptRoot 'funnel-goals-races.ps1') -FixtureRoot $Root -Bin $Bin -Port $Port
& (Join-Path $PSScriptRoot 'funnel-goals-defaults.ps1') -FixtureRoot $Root -Bin $Bin -Port $Port
if(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue){throw 'Fixture listener remains open'}
if(Test-Path -LiteralPath (Join-Path $Data 'postmaster.pid')){throw 'Fixture pid file remains'}
Write-Output 'PASS: shared goals SQL validation; fixture stopped'

param([Parameter(Mandatory=$true)][string]$FixtureRoot,[string]$Bin='C:\Program Files\PostgreSQL\17\bin',[int]$Port=55441)
$ErrorActionPreference='Stop'
$Root=$FixtureRoot;$Data=Join-Path $Root 'data'
if(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue){throw 'Fixture port occupied'}
& "$Bin\pg_ctl.exe" -D $Data -l (Join-Path $Root 'defaults-server.log') -o "-h 127.0.0.1 -p $Port" -w start
if($LASTEXITCODE -ne 0){throw 'Start failed'}
try {
 & "$Bin\createdb.exe" -h 127.0.0.1 -p $Port -U postgres default_acl_fixture
 if($LASTEXITCODE -ne 0){throw 'Fixture db creation failed'}
 $setup=(Get-Content -LiteralPath (Join-Path $Root 'bootstrap.sql') -Raw) -replace 'create role [^;]+;',''
 $setup+="`nalter default privileges for role postgres in schema public grant all on tables to anon,authenticated,service_role;`nalter default privileges for role postgres in schema public grant execute on functions to anon,authenticated,service_role;"
 $setup|Set-Content -LiteralPath (Join-Path $Root 'defaults-bootstrap.sql') -Encoding UTF8
 foreach($file in @('defaults-bootstrap.sql','candidate.sql','assertions.sql')){
  & "$Bin\psql.exe" -h 127.0.0.1 -p $Port -U postgres -d default_acl_fixture -v ON_ERROR_STOP=1 -f (Join-Path $Root $file)
  if($LASTEXITCODE -ne 0){throw "Fixture step failed: $file"}
 }
}finally{& "$Bin\pg_ctl.exe" -D $Data -m fast -w stop}
if(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue){throw 'Fixture listener remains'}

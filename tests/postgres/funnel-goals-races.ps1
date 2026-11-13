param([Parameter(Mandatory=$true)][string]$FixtureRoot,[string]$Bin='C:\Program Files\PostgreSQL\17\bin',[int]$Port=55441)
$ErrorActionPreference='Stop'
$Root=$FixtureRoot;$Data=Join-Path $Root 'data'
if(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue){throw 'Fixture port occupied'}
& "$Bin\pg_ctl.exe" -D $Data -l (Join-Path $Root 'race-server.log') -o "-h 127.0.0.1 -p $Port" -w start
if($LASTEXITCODE -ne 0){throw 'Start failed'}
try {
 foreach($mode in @('competing','same-request')){
  & "$Bin\psql.exe" -h 127.0.0.1 -p $Port -U postgres -d postgres -v ON_ERROR_STOP=1 -c 'truncate public.luxor_funnel_goals,public.luxor_funnel_goal_receipts;'
  if($LASTEXITCODE -ne 0){throw 'Fixture reset failed'}
  $idA='00000000-0000-4000-8000-000000000010';$idB=if($mode -eq 'competing'){'00000000-0000-4000-8000-000000000011'}else{$idA}
  $goals="(select jsonb_object_agg(metric,jsonb_build_object('daily',null,'weekly',null,'monthly',null,'quarterly',null,'annual',null,'monthlyOverrides','{}'::jsonb,'quarterlyOverrides','{}'::jsonb)) from unnest(array['newInquiries','toursScheduled','toursCompleted','proposalsSent','bookedEvents','revenue']) metric)"
  "set application_name='funnel_race_a'; begin; select public.luxor_save_funnel_goals('$idA',0,$goals,'owner@example.invalid'); select pg_sleep(4); commit;" | Set-Content -LiteralPath (Join-Path $Root 'race-a.sql') -Encoding UTF8
  "set application_name='funnel_race_b'; select public.luxor_save_funnel_goals('$idB',0,$goals,'owner@example.invalid');" | Set-Content -LiteralPath (Join-Path $Root 'race-b.sql') -Encoding UTF8
  $a=Start-Process -FilePath "$Bin\psql.exe" -ArgumentList @('-h','127.0.0.1','-p',"$Port",'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-f',(Join-Path $Root 'race-a.sql')) -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $Root "$mode-a.log") -RedirectStandardError (Join-Path $Root "$mode-a.err")
  $ready=$false
  for($i=0;$i -lt 30;$i++){
   $count=& "$Bin\psql.exe" -h 127.0.0.1 -p $Port -U postgres -d postgres -Atc "select count(*) from pg_stat_activity where application_name='funnel_race_a' and wait_event='PgSleep';"
   if($count -eq '1'){$ready=$true;break};Start-Sleep -Milliseconds 100
  }
  if(-not $ready){throw 'Race A hold not observed'}
  $b=Start-Process -FilePath "$Bin\psql.exe" -ArgumentList @('-h','127.0.0.1','-p',"$Port",'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-f',(Join-Path $Root 'race-b.sql')) -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $Root "$mode-b.log") -RedirectStandardError (Join-Path $Root "$mode-b.err")
  $blocked=$false
  for($i=0;$i -lt 20;$i++){
   $count=& "$Bin\psql.exe" -h 127.0.0.1 -p $Port -U postgres -d postgres -Atc "select count(*) from pg_stat_activity where application_name='funnel_race_b' and wait_event_type='Lock';"
   if($count -eq '1'){$blocked=$true;break};Start-Sleep -Milliseconds 100
  }
  $a.WaitForExit();$b.WaitForExit()
  if(-not $blocked){throw 'Race B lock wait not observed'}
  $outB=Get-Content -LiteralPath (Join-Path $Root "$mode-b.log") -Raw
  if($mode -eq 'competing' -and -not $outB.Contains('revision_conflict')){throw 'Competing write did not conflict'}
  if($mode -eq 'same-request' -and -not $outB.Contains('"available": true')){throw 'Same request failed replay'}
  $state=& "$Bin\psql.exe" -h 127.0.0.1 -p $Port -U postgres -d postgres -Atc "select revision::text||':'||(select count(*) from public.luxor_funnel_goal_receipts)::text from public.luxor_funnel_goals;"
  if($state -ne '1:1'){throw "Wrong race final state: $state"}
  Write-Output "PASS ${mode}: observed lock wait, revision1, one receipt"
 }
}finally{& "$Bin\pg_ctl.exe" -D $Data -m fast -w stop}
if(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue){throw 'Fixture remains listening'}


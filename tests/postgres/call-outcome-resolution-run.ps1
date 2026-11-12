# Runs only a NEW isolated localhost PostgreSQL cluster. Never points at an existing server.
param([int]$Port=55439,[string]$PgBin='C:\Program Files\PostgreSQL\17\bin')
$ErrorActionPreference='Stop'
if($Port -lt 1024 -or $Port -gt 65535){throw 'Choose an unprivileged local port'}
# Concurrency suite intentionally pins 127.0.0.1:55439 to avoid accidental remote use.
if($Port -ne 55439){throw 'Concurrency fixture currently requires isolated port 55439'}
$repo=(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$probe=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,$Port)
try{$probe.Start()}finally{$probe.Stop()}
$dir=Join-Path ([IO.Path]::GetTempPath()) ('luxor-call-resolution-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $dir | Out-Null
$started=$false
function Run-Pg([string]$Program,[string[]]$Arguments,[string]$Log){
 # Wait only for this command, not the PostgreSQL server child. Do not pipe pg_ctl
 # output: Windows descendants can inherit the pipe and keep it open indefinitely.
 $quoted=$Arguments | ForEach-Object { '"'+($_ -replace '"','\"')+'"' }
 $process=Start-Process -FilePath (Join-Path $PgBin $Program) -ArgumentList $quoted -WindowStyle Hidden -PassThru -RedirectStandardOutput $Log -RedirectStandardError "$Log.stderr"
 if(-not $process.WaitForExit(60000)){throw "$Program did not exit within 60 seconds; inspect its process before retrying"}
 Get-Content $Log
 if(Test-Path "$Log.stderr"){Get-Content "$Log.stderr"}
 if($process.ExitCode -ne 0){throw "$Program exited $($process.ExitCode); see $Log"}
}
try{
 Run-Pg 'initdb.exe' @('-D',"$dir/data",'-U','postgres','--auth=trust','--encoding=UTF8','--no-locale') "$dir/init.log"
 Run-Pg 'pg_ctl.exe' @('-D',"$dir/data",'-l',"$dir/server.log",'-o',"-h 127.0.0.1 -p $Port",'-w','start') "$dir/start.log"
 $started=$true
 Run-Pg 'createdb.exe' @('-h','127.0.0.1','-p',"$Port",'-U','postgres','call_resolution_fixture_v3') "$dir/create.log"
 $conn=@('-X','-h','127.0.0.1','-p',"$Port",'-U','postgres','-d','call_resolution_fixture_v3','-v','ON_ERROR_STOP=1')
 Run-Pg 'psql.exe' ($conn+@('-f',"$PSScriptRoot/call-outcome-resolution-baseline.sql")) "$PSScriptRoot/call-outcome-resolution-baseline.log"
 $candidate=Get-Content (Join-Path $repo 'docs/call-outcome-resolution-draft.sql') -Raw
 $guard="do `$`$ begin raise exception 'CALL RESOLUTION DRAFT: INSTALLATION NOT AUTHORIZED'; end `$`$;"
 if(-not $candidate.Contains($guard)){throw 'Expected draft guard missing; inspect candidate rather than running'}
 $candidate.Replace($guard,'-- guard removed ONLY from disposable test copy') | Set-Content "$dir/candidate.sql"
 Run-Pg 'psql.exe' ($conn+@('-f',"$dir/candidate.sql")) "$PSScriptRoot/call-outcome-resolution-install.log"
 foreach($suite in @('assertions','exclusions','successors','batch','existing-triggers')){
  Run-Pg 'psql.exe' ($conn+@('-f',"$PSScriptRoot/call-outcome-resolution-$suite.sql")) "$PSScriptRoot/call-outcome-resolution-$suite.log"
 }
 & node "$PSScriptRoot/call-outcome-resolution-mixed-build.cjs" "$dir/mixed.sql"
 if($LASTEXITCODE -ne 0){throw 'Standard workflow fixture generation failed'}
 Run-Pg 'psql.exe' ($conn+@('-f',"$dir/mixed.sql")) "$PSScriptRoot/call-outcome-resolution-mixed.log"
 $ErrorActionPreference='Continue'
 & node "$PSScriptRoot/call-outcome-resolution-concurrency.cjs" 2>&1 | Tee-Object "$PSScriptRoot/call-outcome-resolution-concurrency.log"
 if($LASTEXITCODE -ne 0){throw 'Concurrency suite failed'}
 Run-Pg 'psql.exe' ($conn+@('-f',"$PSScriptRoot/call-outcome-resolution-sms.sql")) "$PSScriptRoot/call-outcome-resolution-sms.log"
 Write-Output 'PASS all isolated PostgreSQL call-resolution fixtures'
}finally{
 if($started){Run-Pg 'pg_ctl.exe' @('-D',"$dir/data",'-m','fast','-w','stop') "$dir/stop.log"}
 Write-Output "Disposable cluster evidence retained at $dir; no production connection used."
}

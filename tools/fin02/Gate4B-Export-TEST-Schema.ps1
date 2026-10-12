#requires -Version 5.1
# Gate4B PRIVATE CLIENT-SIDE SCHEMA EXPORT. NOT for PROD.
# Read-only on live TEST. Archive NEVER belongs in Git/ChatGPT/Lovable/Actions.
# Requires PostgreSQL 17 client tools, trusted Supabase CA and local PR #34.
# Sample:
# powershell -NoProfile -File .\tools\fin02\Gate4B-Export-TEST-Schema.ps1 -PgBin "C:\pgsql\bin" -DbHost "aws-1-eu-central-1.pooler.supabase.com" -TestUser "postgres.avxxzmoayxzrykwqzoqn" -CaCert "C:\private\supabase-ca.crt"
# Type TEST password only in the libpq interactive prompt.
[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][string]$PgBin,
 [Parameter(Mandatory=$true)][string]$DbHost,
 [Parameter(Mandatory=$true)][string]$TestUser,
 [Parameter(Mandatory=$true)][string]$CaCert,
 [ValidateRange(1,65535)][int]$Port=5432,
 [string]$OutputRoot=(Join-Path $env:LOCALAPPDATA 'PartnerOS-Private\Gate4B')
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$testRef='avxxzmoayxzrykwqzoqn'
$prodRef='qownzparzsaeoyccgwuj'
if ($DbHost -match $prodRef -or $TestUser -match $prodRef) { throw 'HARD STOP: PROD forbidden' }
$validPool=($TestUser -ceq "postgres.$testRef" -and $DbHost -match '^[a-z0-9-]+\.pooler\.supabase\.com$')
$validDirect=($TestUser -ceq 'postgres' -and $DbHost -ceq "db.$testRef.supabase.co")
if (-not ($validPool -or $validDirect)) { throw 'HARD STOP: TEST connection identity mismatch' }
if (-not (Test-Path -LiteralPath $CaCert -PathType Leaf)) { throw 'TLS CA file missing' }
if (-not (Test-Path -LiteralPath $PgBin -PathType Container)) { throw 'Postgres client bin missing' }
$repoRoot=(Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$preflight=Join-Path $repoRoot 'tests\sql\fin02\gate4_live_test_catalog_preflight.sql'
if (-not (Test-Path -LiteralPath $preflight -PathType Leaf)) { throw 'Missing PR34 read-only preflight' }
$psql=Join-Path $PgBin 'psql.exe'
$dump=Join-Path $PgBin 'pg_dump.exe'
$dumpall=Join-Path $PgBin 'pg_dumpall.exe'
$restore=Join-Path $PgBin 'pg_restore.exe'
foreach ($exe in @($psql,$dump,$dumpall,$restore)) {
 if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) { throw "Missing $exe" }
 $ver=& $exe --version
 if ($LASTEXITCODE -ne 0 -or $ver -notmatch '\b17\.\d+') { throw "PostgreSQL 17 required: $exe" }
}
$helpDumpall=(& $dumpall --help) -join [Environment]::NewLine
if ($helpDumpall -notmatch '--no-role-passwords') { throw 'Cannot omit role password hashes' }
if (-not (Test-Path -LiteralPath $OutputRoot)) { New-Item -ItemType Directory -Path $OutputRoot -Force | Out-Null }
$stamp=(Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$dir=Join-Path $OutputRoot "TEST-$stamp"
if (Test-Path -LiteralPath $dir) { throw 'Private output folder already exists' }
if ($dir.StartsWith($repoRoot,[StringComparison]::OrdinalIgnoreCase)) { throw 'Refusing archive inside Git working tree' }
New-Item -ItemType Directory -Path $dir | Out-Null
$mySid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$grantSelf=('*{0}:(OI)(CI)F' -f $mySid)
& icacls.exe $dir /inheritance:r /grant:r $grantSelf '*S-1-5-18:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Cannot restrict archive folder ACL' }
$prior=@{}
foreach ($name in @('PGSSLMODE','PGSSLROOTCERT','PGPASSWORD','PGPASSFILE','PGCONNECT_TIMEOUT','PGOPTIONS')) {
 $prior[$name]=[Environment]::GetEnvironmentVariable($name,'Process')
}
try {
 [Environment]::SetEnvironmentVariable('PGSSLMODE','verify-full','Process')
 [Environment]::SetEnvironmentVariable('PGSSLROOTCERT',(Resolve-Path -LiteralPath $CaCert).Path,'Process')
 [Environment]::SetEnvironmentVariable('PGPASSWORD',$null,'Process')
 [Environment]::SetEnvironmentVariable('PGPASSFILE',(Join-Path $dir 'not-a-password-file'),'Process')
 [Environment]::SetEnvironmentVariable('PGCONNECT_TIMEOUT','12','Process')
 [Environment]::SetEnvironmentVariable('PGOPTIONS','-c default_transaction_read_only=on','Process')
 $conn=@('-X','--no-psqlrc','-h',$DbHost,'-p',"$Port",'-U',$TestUser,'-d','postgres','-v','ON_ERROR_STOP=1')
 Write-Host '1/4 Checking live TEST metadata ONLY. Enter the TEST password at the PostgreSQL prompt, not into chat.'
 $lines=@(& $psql @conn '-A' '-t' '-F' '|' '-f' $preflight)
 if ($LASTEXITCODE -ne 0) { throw 'Live TEST catalog preflight failed' }
 $lines=@($lines | Where-Object { $_ -match '^(column:|rls:|function:|inventory:|migration:|fin02:|integration:)' })
 $bad=@($lines | Where-Object { $_ -notmatch '\|PASS$' })
 if ($lines.Count -ne 38 -or $bad.Count -gt 0) { throw "TEST catalog drift: $($lines.Count) checked, $($bad.Count) failed" }
 $lines | Set-Content -LiteralPath (Join-Path $dir 'preflight.txt') -Encoding UTF8
 Write-Host '2/4 Capturing schema-only (no row data).'
 $archive=Join-Path $dir 'TEST-schema-only.pgcustom'
 & $dump -h $DbHost -p "$Port" -U $TestUser -d postgres --format=custom --schema-only --no-subscriptions --file=$archive
 if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $archive -PathType Leaf)) { throw 'Schema-only archive export failed' }
 $toc=Join-Path $dir 'toc.txt'
 & $restore --list $archive | Set-Content -LiteralPath $toc -Encoding UTF8
 if ($LASTEXITCODE -ne 0) { throw 'Archive TOC inspection failed' }
 if (@(Get-Content -LiteralPath $toc | Where-Object { $_ -match ';\s+\d+\s+\d+\s+TABLE DATA\s' }).Count -gt 0) {
   throw 'HARD STOP: DATA in structure-only archive'
 }
 Write-Host '3/4 Capturing roles without passwords and migration technical names.'
 $roles=Join-Path $dir 'roles-no-passwords.sql'
 & $dumpall -h $DbHost -p "$Port" -U $TestUser --globals-only --no-role-passwords --file=$roles
 if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $roles -PathType Leaf)) { throw 'Role metadata export failed' }
 if ((Get-Content -LiteralPath $roles -Raw) -match '(?i)PASSWORD\s+[''"](?:md5|SCRAM-SHA-256)') {
  throw 'Potential password hash in role export. Keep PRIVATE and inspect.'
 }
 $ledger=Join-Path $dir 'migration-ledger.tsv'
 $versions=@(& $psql @conn '-A' '-t' '-F' '|' '-c' 'SELECT version,name FROM supabase_migrations.schema_migrations ORDER BY version;')
 if ($LASTEXITCODE -ne 0 -or $versions.Count -ne 176) { throw 'Migration ledger count unexpected' }
 $versions | Set-Content -LiteralPath $ledger -Encoding UTF8
 Write-Host '4/4 Creating local integrity receipt. No upload or remote writes.'
 $hashes=@{}
 foreach ($filename in @('TEST-schema-only.pgcustom','roles-no-passwords.sql','migration-ledger.tsv','preflight.txt','toc.txt')) {
  $file=Join-Path $dir $filename
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Missing $filename" }
  $hashes[$filename]=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
 }
 $receipt=[ordered]@{
  source='PartnerOS TEST'
  project_ref=$testRef
  captured_utc=$stamp
  source_checks='38/38 PASS'
  migration_entries=176
  customer_rows_in_archive=$false
  export_scope='ALL schema objects / metadata only; no customer rows'
  archive_hashes=$hashes
  restore_tested=$false
  permission_boundary='LOCAL PRIVATE FILES ONLY'
  warning='Function text and role configuration MAY contain embedded secrets; never upload.'
 }
 $receipt | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $dir 'receipt.json') -Encoding UTF8
 & icacls.exe $dir /inheritance:r /grant:r $grantSelf '*S-1-5-18:(OI)(CI)F' /T | Out-Null
 if ($LASTEXITCODE -ne 0) { throw 'Output ACL verification failed' }
 Write-Host 'PASS: TEST structure exported privately (not yet restored).'
 Write-Host 'Only report the gate result 38/38 and migration count 176; never send archive/passwords/roles.'
}
finally {
 foreach ($name in $prior.Keys) { [Environment]::SetEnvironmentVariable($name,$prior[$name],'Process') }
}

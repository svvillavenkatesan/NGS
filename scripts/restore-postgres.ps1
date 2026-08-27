param([Parameter(Mandatory=$true)][string]$BackupFile,[switch]$ConfirmRestore)
if (-not $ConfirmRestore) { throw 'PostgreSQL restore replaces current database data. Run again with -ConfirmRestore.' }
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker is not installed.' }
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$file = (Resolve-Path -LiteralPath $BackupFile).Path
Push-Location $projectRoot
try {
  Get-Content -LiteralPath $file -Raw | docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U number_game -d number_game
  if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL restore failed.' }
} finally { Pop-Location }
Write-Output 'PostgreSQL restore completed.'

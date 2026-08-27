param(
  [Parameter(Mandatory=$true)][string]$BackupFile,
  [switch]$ConfirmRestore
)

if (-not $ConfirmRestore) { throw 'Restore replaces current business data. Run again with -ConfirmRestore.' }
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$dataRoot = (Resolve-Path -LiteralPath (Join-Path $projectRoot 'backend-api\data')).Path
$archive = (Resolve-Path -LiteralPath $BackupFile).Path
if ([IO.Path]::GetExtension($archive) -ne '.zip') { throw 'Select a valid .zip backup.' }
$stage = Join-Path ([IO.Path]::GetTempPath()) "number-game-restore-$([guid]::NewGuid())"
New-Item -ItemType Directory -Path $stage | Out-Null
try {
  Expand-Archive -LiteralPath $archive -DestinationPath $stage
  $businessData = Join-Path $stage 'application-data.json'
  if (-not (Test-Path -LiteralPath $businessData)) { throw 'Backup does not contain application-data.json.' }
  Get-Content -LiteralPath $businessData -Raw | ConvertFrom-Json | Out-Null
  Copy-Item -LiteralPath $businessData -Destination (Join-Path $dataRoot 'application-data.json') -Force
  $license = Join-Path $stage 'license-state.json'
  if (Test-Path -LiteralPath $license) { Copy-Item -LiteralPath $license -Destination (Join-Path $dataRoot 'license-state.json') -Force }
  Write-Output 'Restore completed. Restart the Number Game server.'
} finally {
  if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
}

param([string]$Destination)

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$dataRoot = (Resolve-Path -LiteralPath (Join-Path $projectRoot 'backend-api\data')).Path
if (-not $Destination) { $Destination = Join-Path $projectRoot 'backups' }
New-Item -ItemType Directory -Path $Destination -Force | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$stage = Join-Path $Destination "number-game-$stamp"
New-Item -ItemType Directory -Path $stage -Force | Out-Null

foreach ($name in @('application-data.json', 'license-state.json')) {
  $source = Join-Path $dataRoot $name
  if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination (Join-Path $stage $name) }
}
Copy-Item -LiteralPath (Join-Path $projectRoot 'database\schema.sql') -Destination (Join-Path $stage 'schema.sql')
$archive = "$stage.zip"
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $archive -Force -ErrorAction Stop
if (-not (Test-Path -LiteralPath $archive)) { throw 'Backup archive was not created.' }
Remove-Item -LiteralPath $stage -Recurse -Force
Write-Output $archive

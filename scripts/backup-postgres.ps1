param([string]$OutputDirectory)
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker is not installed.' }
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $projectRoot 'backups' }
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$file = Join-Path $OutputDirectory "postgres-$((Get-Date).ToString('yyyyMMdd-HHmmss')).sql"
Push-Location $projectRoot
try {
  docker compose exec -T postgres pg_dump -U number_game -d number_game --clean --if-exists | Set-Content -LiteralPath $file -Encoding utf8
  if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL backup failed.' }
} finally { Pop-Location }
Write-Output $file

param([Parameter(Mandatory=$true)][string]$BackupFile)

$archive = (Resolve-Path -LiteralPath $BackupFile).Path
if ([IO.Path]::GetExtension($archive) -ne '.zip') { throw 'Select a valid .zip backup.' }
$stage = Join-Path ([IO.Path]::GetTempPath()) "ngs-backup-check-$([guid]::NewGuid())"
New-Item -ItemType Directory -Path $stage | Out-Null
try {
  Expand-Archive -LiteralPath $archive -DestinationPath $stage
  $businessData = Join-Path $stage 'application-data.json'
  $checksums = Join-Path $stage 'SHA256SUMS.txt'
  if (-not (Test-Path -LiteralPath $businessData)) { throw 'Backup does not contain application-data.json.' }
  if (-not (Test-Path -LiteralPath $checksums)) { throw 'Backup does not contain SHA256SUMS.txt.' }
  Get-Content -LiteralPath $businessData -Raw | ConvertFrom-Json | Out-Null
  foreach ($line in Get-Content -LiteralPath $checksums) {
    if ($line -notmatch '^([A-Fa-f0-9]{64})  (.+)$') { throw 'Backup checksum manifest is invalid.' }
    $file = Join-Path $stage $Matches[2]
    if (-not (Test-Path -LiteralPath $file)) { throw "Backup file missing: $($Matches[2])" }
    $actual = Get-FileHash -LiteralPath $file -Algorithm SHA256 | Select-Object -ExpandProperty Hash
    if ($actual -ne $Matches[1]) { throw "Checksum failed: $($Matches[2])" }
  }
  Write-Output 'Backup verification passed.'
} finally {
  if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
}

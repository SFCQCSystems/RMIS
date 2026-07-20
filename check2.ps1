param([string]$path)
$bytes = [System.IO.File]::ReadAllBytes($path)
Write-Host ("Size: " + $bytes.Length)
if ($bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE) { Write-Host "UTF-16 LE - CORRUPTED" }
elseif ($bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) { Write-Host "UTF-8 BOM" }
else { Write-Host "UTF-8 no BOM (OK)" }

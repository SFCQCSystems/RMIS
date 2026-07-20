param([string]$path)
# Read as UTF-8 (handles BOM automatically)
$content = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
# Write back as UTF-8 WITHOUT BOM
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($path, $content, $utf8NoBom)
# Verify
$bytes = [System.IO.File]::ReadAllBytes($path)
if ($bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
    Write-Host "ERROR: Still has BOM"
} else {
    Write-Host "SUCCESS: UTF-8 no BOM"
}

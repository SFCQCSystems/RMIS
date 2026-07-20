$htmlPath = "c:\Users\thirathada.ha\Documents\Laboratory Request Management System\ระบบแจ้งตรวจสอบคุณภาพวัตถุดิบ.html"
# Read with encoding detection
$bytes = [System.IO.File]::ReadAllBytes($htmlPath)
Write-Host ("File size: " + $bytes.Length + " bytes")
# Check BOM
if ($bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE) {
    Write-Host "Encoding: UTF-16 LE (BOM found) - CORRUPTED"
} elseif ($bytes[0] -eq 0xFE -and $bytes[1] -eq 0xFF) {
    Write-Host "Encoding: UTF-16 BE (BOM found) - CORRUPTED"  
} elseif ($bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
    Write-Host "Encoding: UTF-8 with BOM"
} else {
    Write-Host "Encoding: UTF-8 no BOM (OK)"
}

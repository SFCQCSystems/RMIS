Add-Type -AssemblyName System.Drawing
mkdir -Force icons | Out-Null

$b1 = New-Object System.Drawing.Bitmap(192, 192)
$g1 = [System.Drawing.Graphics]::FromImage($b1)
$g1.Clear([System.Drawing.Color]::Blue)
$b1.Save("icons\icon-192.png", [System.Drawing.Imaging.ImageFormat]::Png)

$b2 = New-Object System.Drawing.Bitmap(512, 512)
$g2 = [System.Drawing.Graphics]::FromImage($b2)
$g2.Clear([System.Drawing.Color]::Blue)
$b2.Save("icons\icon-512.png", [System.Drawing.Imaging.ImageFormat]::Png)

Write-Host "Icons generated"

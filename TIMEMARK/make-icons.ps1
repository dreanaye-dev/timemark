Add-Type -AssemblyName System.Drawing

function New-Icon {
    param([string]$Path, [int]$Size)
    $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.Clear([System.Drawing.Color]::FromArgb(255, 11, 15, 20))

    $fSize = [float]($Size * 0.34)
    $font = New-Object System.Drawing.Font('Segoe UI', $fSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $fmt = New-Object System.Drawing.StringFormat
    $fmt.Alignment = [System.Drawing.StringAlignment]::Center
    $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center

    $rx = [float]($Size * 0.02)
    $rect = New-Object System.Drawing.RectangleF($rx, 0.0, [float]$Size, [float]$Size)
    $g.DrawString('TM', $font, $brush, $rect, $fmt)

    $accent = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 90, 60))
    $ax = [float]($Size * 0.22)
    $aw = [float]($Size * 0.56)
    $ay = [float]($Size * 0.70)
    $ah = [Math]::Max(3.0, [float]($Size * 0.09))
    $g.FillRectangle($accent, $ax, $ay, $aw, $ah)

    $font.Dispose(); $brush.Dispose(); $accent.Dispose(); $fmt.Dispose(); $g.Dispose()
    $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
}

New-Icon 'icons\icon-192.png' 192
New-Icon 'icons\icon-512.png' 512
Write-Host 'Icons generated:'
Get-ChildItem icons | ForEach-Object { Write-Host ('  ' + $_.Name + ' - ' + $_.Length + ' bytes') }
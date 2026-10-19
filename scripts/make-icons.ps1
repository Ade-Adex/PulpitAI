# Generate PulpitAI app icons from the source logo in the project root.
# - Auto-detects the rounded-square icon region (bright pixels, top 65%)
# - Crops it square and exports every size needed by:
#     build/icon-*.png        -> electron-builder (win.ico / mac / linux)
#     electron/assets/icon.png -> runtime BrowserWindow icon (packed in app)
#     src/renderer/public/*    -> header logo + favicon
# Run: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/make-icons.ps1
Add-Type -AssemblyName System.Drawing

$root = 'C:\Users\Adeolu\Adex\PulpitAI'
$src = Join-Path $root 'watermarked_img_7439758442556488078.jpg'

$bmp = [System.Drawing.Bitmap]::FromFile($src)
$W = $bmp.Width
$H = $bmp.Height

# --- 1. Detect the icon bounding box (bright pixels above the wordmark) ---
$minX = $W; $maxX = 0; $minY = $H; $maxY = 0
$limitY = [int]($H * 0.65)   # wordmark text starts below this
for ($y = 0; $y -lt $limitY; $y += 2) {
  for ($x = 0; $x -lt $W; $x += 2) {
    $c = $bmp.GetPixel($x, $y)
    if (($c.R + $c.G + $c.B) -gt 150) {
      if ($x -lt $minX) { $minX = $x }
      if ($x -gt $maxX) { $maxX = $x }
      if ($y -lt $minY) { $minY = $y }
      if ($y -gt $maxY) { $maxY = $y }
    }
  }
}
if ($maxX -le $minX) {
  # Fallback: manual estimate of the icon square in a 1024x559 source.
  $minX = 376; $maxX = 647; $minY = 84; $maxY = 355
}

# --- 2. Square the bbox around its centre ---
$bw = $maxX - $minX
$bh = $maxY - $minY
$side = [Math]::Max($bw, $bh)
$cx = $minX + [int]($bw / 2)
$cy = $minY + [int]($bh / 2)
$cropX = [Math]::Max(0, $cx - [int]($side / 2))
$cropY = [Math]::Max(0, $cy - [int]($side / 2))
if (($cropX + $side) -gt $W) { $cropX = $W - $side }
if (($cropY + $side) -gt $H) { $cropY = $H - $side }

Write-Output "source ${W}x${H}; bbox x=$minX y=$minY w=$bw h=$bh; crop=$cropX,$cropY side=$side"

$cropRect = New-Object System.Drawing.Rectangle($cropX, $cropY, $side, $side)
$full = [System.Drawing.Bitmap]::new($side, $side)
$g = [System.Drawing.Graphics]::FromImage($full)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$destRect = New-Object System.Drawing.Rectangle(0, 0, $side, $side)
$g.DrawImage($bmp, $destRect, $cropRect, [System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose()

# --- 3. Export all required sizes ---
New-Item -ItemType Directory -Force -Path (Join-Path $root 'build') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $root 'electron\assets') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $root 'src\renderer\public') | Out-Null

function Save-Size([int]$size, [string]$path) {
  $b = [System.Drawing.Bitmap]::new($size, $size)
  $gg = [System.Drawing.Graphics]::FromImage($b)
  $gg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $gg.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $gg.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $gg.DrawImage($full, 0, 0, $size, $size)
  $gg.Dispose()
  $b.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $b.Dispose()
}

foreach ($s in 16, 24, 32, 48, 64, 128, 256, 512) {
  Save-Size $s (Join-Path $root "build\icon-$s.png")
}
# Plain build/icon.png (512) is what electron-builder's mac/linux config
# points at — its icon-tool accepts .png/.svg/.icns only (NOT .ico), so this
# file MUST exist or those builds fall back to icon.ico and fail.
Save-Size 512 (Join-Path $root 'build\icon.png')
Save-Size 256 (Join-Path $root 'electron\assets\icon.png')
Save-Size 256 (Join-Path $root 'src\renderer\public\logo.png')
Save-Size 48  (Join-Path $root 'src\renderer\public\favicon.png')

$full.Dispose()
$bmp.Dispose()
Write-Output 'ICONS_DONE'

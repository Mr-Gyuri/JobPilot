# Generates launcher/jobpilot.ico  -  the desktop/taskbar icon.
# Run once; the .ico is committed so this does not need running again unless the
# look changes. Written by hand because the repo has no image toolchain, and an
# .ico is just a small header wrapping PNG frames.
Add-Type -AssemblyName System.Drawing

$sizes = @(256, 128, 64, 48, 32, 16)
$pngs = @()

foreach ($size in $sizes) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)

  # Rounded square in the app's indigo (#4f46e5 -> #6366f1 gradient).
  $pad = [Math]::Max(1, [int]($size * 0.04))
  $rect = New-Object System.Drawing.Rectangle($pad, $pad, ($size - 2 * $pad), ($size - 2 * $pad))
  $radius = [int]($size * 0.22)
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $radius * 2
  $path.AddArc($rect.X, $rect.Y, $d, $d, 180, 90)
  $path.AddArc(($rect.Right - $d), $rect.Y, $d, $d, 270, 90)
  $path.AddArc(($rect.Right - $d), ($rect.Bottom - $d), $d, $d, 0, 90)
  $path.AddArc($rect.X, ($rect.Bottom - $d), $d, $d, 90, 90)
  $path.CloseFigure()

  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $rect,
    [System.Drawing.Color]::FromArgb(255, 99, 102, 241),
    [System.Drawing.Color]::FromArgb(255, 67, 56, 202),
    45.0)
  $g.FillPath($brush, $path)

  # White paper plane, drawn as two triangles so it reads at small sizes.
  $s = $size / 100.0
  $plane = New-Object System.Drawing.Drawing2D.GraphicsPath
  $plane.AddPolygon(@(
    (New-Object System.Drawing.PointF((22 * $s), (52 * $s))),
    (New-Object System.Drawing.PointF((80 * $s), (24 * $s))),
    (New-Object System.Drawing.PointF((48 * $s), (60 * $s)))
  ))
  $plane.AddPolygon(@(
    (New-Object System.Drawing.PointF((48 * $s), (60 * $s))),
    (New-Object System.Drawing.PointF((80 * $s), (24 * $s))),
    (New-Object System.Drawing.PointF((58 * $s), (78 * $s)))
  ))
  $white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 255, 255))
  $g.FillPath($white, $plane)

  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $pngs += , @{ Size = $size; Bytes = $ms.ToArray() }

  $g.Dispose(); $bmp.Dispose(); $ms.Dispose()
  $brush.Dispose(); $white.Dispose(); $path.Dispose(); $plane.Dispose()
}

# ICO container: 6-byte header, then one 16-byte directory entry per frame,
# then the PNG payloads.
$out = New-Object System.IO.MemoryStream
$w = New-Object System.IO.BinaryWriter($out)
$w.Write([UInt16]0)                 # reserved
$w.Write([UInt16]1)                 # type: icon
$w.Write([UInt16]$pngs.Count)

$offset = 6 + (16 * $pngs.Count)
foreach ($p in $pngs) {
  $dim = if ($p.Size -ge 256) { 0 } else { $p.Size }   # 0 means 256 in the spec
  $w.Write([Byte]$dim)              # width
  $w.Write([Byte]$dim)              # height
  $w.Write([Byte]0)                 # palette size
  $w.Write([Byte]0)                 # reserved
  $w.Write([UInt16]1)               # colour planes
  $w.Write([UInt16]32)              # bits per pixel
  $w.Write([UInt32]$p.Bytes.Length)
  $w.Write([UInt32]$offset)
  $offset += $p.Bytes.Length
}
foreach ($p in $pngs) { $w.Write($p.Bytes) }
$w.Flush()

$target = Join-Path $PSScriptRoot "jobpilot.ico"
[System.IO.File]::WriteAllBytes($target, $out.ToArray())
$w.Dispose(); $out.Dispose()

Write-Output "wrote $target ($((Get-Item $target).Length) bytes, $($pngs.Count) sizes)"

# Optional Windows-only regeneration of the committed raster fixtures.
# The test page does not need this script or any build step.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

function New-FixtureImage {
    param([int]$Width, [int]$Height, [string]$Label, [string]$Filename, [System.Drawing.Imaging.ImageFormat]$Format)
    $bitmap = [System.Drawing.Bitmap]::new($Width, $Height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.ScaleTransform($Width / 960.0, $Height / 480.0)
    $sky = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
        [System.Drawing.Rectangle]::new(0, 0, 960, 480),
        [System.Drawing.ColorTranslator]::FromHtml('#14192e'),
        [System.Drawing.ColorTranslator]::FromHtml('#371e48'), 90.0)
    $pink = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#ff3daf'))
    $stars = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#b6c9e5'))
    $stripe = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#251a39'), 7)
    $back = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#0b1428'))
    $front = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#101c31'))
    $edge = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#637291'), 2)
    $cyan = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#32f6ff'), 3)
    $grid = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(65, 50, 246, 255), 1)
    $textBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#d7e9ff'))
    $font = [System.Drawing.Font]::new('Consolas', 16, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
    try {
        $graphics.FillRectangle($sky, 0, 0, 960, 480)
        foreach ($star in @(@(105,76,4), @(284,54,4), @(816,94,6), @(750,40,4), @(412,103,4))) {
            $graphics.FillEllipse($stars, $star[0], $star[1], $star[2], $star[2])
        }
        $graphics.FillEllipse($pink, 551, 106, 198, 198)
        $clip = $graphics.Save()
        $sunPath = [System.Drawing.Drawing2D.GraphicsPath]::new()
        try {
            $sunPath.AddEllipse(551, 106, 198, 198)
            $graphics.SetClip($sunPath)
            foreach ($y in @(185,205,225,245,265,285)) { $graphics.DrawLine($stripe, 540, $y, 760, $y) }
        } finally {
            $graphics.Restore($clip)
            $sunPath.Dispose()
        }
        $backPoints = [System.Drawing.Point[]]@(
            [System.Drawing.Point]::new(0,355), [System.Drawing.Point]::new(166,171),
            [System.Drawing.Point]::new(354,374), [System.Drawing.Point]::new(507,251),
            [System.Drawing.Point]::new(678,384), [System.Drawing.Point]::new(808,273),
            [System.Drawing.Point]::new(960,363), [System.Drawing.Point]::new(960,480), [System.Drawing.Point]::new(0,480))
        $frontPoints = [System.Drawing.Point[]]@(
            [System.Drawing.Point]::new(0,408), [System.Drawing.Point]::new(262,268),
            [System.Drawing.Point]::new(472,426), [System.Drawing.Point]::new(664,322),
            [System.Drawing.Point]::new(960,426), [System.Drawing.Point]::new(960,480), [System.Drawing.Point]::new(0,480))
        $graphics.FillPolygon($back, $backPoints)
        $graphics.DrawLines($edge, $backPoints[0..6])
        $graphics.FillPolygon($front, $frontPoints)
        $graphics.DrawLines($cyan, $frontPoints[0..4])
        foreach ($y in @(438,458)) { $graphics.DrawLine($grid, 0, $y, 960, $y) }
        foreach ($x in @(0,120,360,600,840,960)) { $graphics.DrawLine($grid, 480, 426, $x, 480) }
        $graphics.DrawString($Label, $font, $textBrush, 38, 433)
        $bitmap.Save((Join-Path $PSScriptRoot $Filename), $Format)
    } finally {
        foreach ($resource in @($font,$textBrush,$grid,$cyan,$edge,$front,$back,$stripe,$stars,$pink,$sky,$graphics,$bitmap)) { $resource.Dispose() }
    }
}

New-FixtureImage 960 480 'PNG / 960 x 480' 'landscape.png' ([System.Drawing.Imaging.ImageFormat]::Png)
New-FixtureImage 480 240 'PNG / 480 x 240 - SMALL CANDIDATE' 'landscape-small.png' ([System.Drawing.Imaging.ImageFormat]::Png)
New-FixtureImage 960 480 'JPEG / ORIGINAL LOSSY FILE' 'landscape.jpg' ([System.Drawing.Imaging.ImageFormat]::Jpeg)
New-FixtureImage 960 480 'GIF / SINGLE FRAME' 'landscape.gif' ([System.Drawing.Imaging.ImageFormat]::Gif)

$transparent = [System.Drawing.Bitmap]::new(480, 240, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$painter = [System.Drawing.Graphics]::FromImage($transparent)
$painter.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$outline = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#32f6ff'), 5)
$sunBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(200, 255, 61, 175))
$mountainBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(170, 50, 246, 255))
try {
    $painter.Clear([System.Drawing.Color]::Transparent)
    $painter.FillEllipse($sunBrush, 265, 25, 115, 115)
    $points = [System.Drawing.Point[]]@([System.Drawing.Point]::new(70,205),[System.Drawing.Point]::new(190,55),[System.Drawing.Point]::new(290,180),[System.Drawing.Point]::new(350,115),[System.Drawing.Point]::new(420,205))
    $painter.FillPolygon($mountainBrush, $points)
    $painter.DrawPolygon($outline, $points)
    $transparent.Save((Join-Path $PSScriptRoot 'transparent.png'), [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
    foreach ($resource in @($outline,$sunBrush,$mountainBrush,$painter,$transparent)) { $resource.Dispose() }
}

Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'landscape.png') -Destination (Join-Path $PSScriptRoot 'format-image') -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'landscape.png') -Destination (Join-Path $PSScriptRoot 'unknown-image') -Force
$unicodeName = 'Gr' + [char]0x00fc + [char]0x00df + 'e ' + [char]0x6771 + [char]0x4eac + '.png'
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'landscape.png') -Destination (Join-Path $PSScriptRoot $unicodeName) -Force
Write-Output 'Created 8 local raster fixtures.'

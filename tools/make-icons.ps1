# Gera os ícones PNG do app. O desenho fica na zona segura central para funcionar como ícone "maskable".
Add-Type -AssemblyName System.Drawing

$out = Join-Path (Split-Path -Parent $PSScriptRoot) 'icons'
[void][System.IO.Directory]::CreateDirectory($out)

foreach ($size in 192, 512) {
  $bitmap = [System.Drawing.Bitmap]::new($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bitmap)
  $g.SmoothingMode = 'AntiAlias'
  $g.Clear([System.Drawing.ColorTranslator]::FromHtml('#256abf'))
  $white = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)

  $barWidth = 0.11 * $size
  $gap = 0.06 * $size
  $base = 0.70 * $size
  $left = ($size - 3 * $barWidth - 2 * $gap) / 2
  $heights = 0.18, 0.30, 0.42
  for ($i = 0; $i -lt 3; $i++) {
    $h = $heights[$i] * $size
    $g.FillRectangle($white, [single]($left + $i * ($barWidth + $gap)), [single]($base - $h), [single]$barWidth, [single]$h)
  }

  $bitmap.Save((Join-Path $out "icon-$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $white.Dispose(); $g.Dispose(); $bitmap.Dispose()
}

# Servidor local para desenvolvimento. Service worker e instalação exigem http://localhost ou https.
param(
  [int]$Port = 8420,
  [string]$Root = (Split-Path -Parent $PSScriptRoot)
)

$rootFull = [System.IO.Path]::GetFullPath($Root).TrimEnd('\') + '\'
$types = @{
  '.html' = 'text/html; charset=utf-8'
  '.css' = 'text/css; charset=utf-8'
  '.js' = 'text/javascript; charset=utf-8'
  '.json' = 'application/json'
  '.webmanifest' = 'application/manifest+json'
  '.png' = 'image/png'
}

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "App em http://localhost:$Port (Ctrl+C para encerrar)"

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $response = $context.Response
    try {
      $path = [Uri]::UnescapeDataString($context.Request.Url.AbsolutePath).TrimStart('/')
      if (-not $path -or $path.EndsWith('/')) { $path += 'index.html' }
      $file = [System.IO.Path]::GetFullPath((Join-Path $rootFull $path))
      $extension = [System.IO.Path]::GetExtension($file).ToLowerInvariant()

      # Só serve arquivos dentro da pasta do projeto e de tipos conhecidos.
      if ($file.StartsWith($rootFull, [StringComparison]::OrdinalIgnoreCase) -and
          $types.ContainsKey($extension) -and [System.IO.File]::Exists($file)) {
        $bytes = [System.IO.File]::ReadAllBytes($file)
        $response.ContentType = $types[$extension]
        $response.Headers.Add('Cache-Control', 'no-cache')
        $response.ContentLength64 = $bytes.Length
        $response.OutputStream.Write($bytes, 0, $bytes.Length)
      } else {
        $response.StatusCode = 404
      }
    } catch {
      $response.StatusCode = 500
    } finally {
      $response.Close()
    }
  }
} finally {
  $listener.Stop()
}

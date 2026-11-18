param(
  [int]$Port = 4173,
  [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$root = Join-Path $PSScriptRoot 'site'
$rootFull = [System.IO.Path]::GetFullPath($root).TrimEnd('\') + '\'
$listener = $null
$selectedPort = $Port

if (-not (Test-Path -LiteralPath (Join-Path $root 'index.html'))) {
  Write-Host ''
  Write-Host '  Could not find site\index.html next to this script.' -ForegroundColor Red
  Write-Host '  Please keep the whole folder together after unzipping.' -ForegroundColor Yellow
  Write-Host ''
  Read-Host 'Press Enter to close'
  exit 1
}

for ($candidate = $Port; $candidate -le ($Port + 12); $candidate++) {
  try {
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add("http://127.0.0.1:$candidate/")
    $listener.Start()
    $selectedPort = $candidate
    break
  } catch {
    if ($listener) {
      try { $listener.Close() } catch { }
      $listener = $null
    }
  }
}

if (-not $listener) {
  Write-Host ''
  Write-Host '  Could not open a local port. Please close other local web servers and try again.' -ForegroundColor Red
  Write-Host ''
  Read-Host 'Press Enter to close'
  exit 1
}

$url = "http://127.0.0.1:$selectedPort/"
$Host.UI.RawUI.WindowTitle = 'Aurora Noel - local server'

Write-Host ''
Write-Host '  AURORA NOEL - local preview' -ForegroundColor Yellow
Write-Host '  ------------------------------' -ForegroundColor DarkYellow
Write-Host ''
Write-Host "  Open in your browser: $url" -ForegroundColor Cyan
Write-Host ''
Write-Host '  Click "Enable Gesture" in the top-right panel and allow camera access.' -ForegroundColor Gray
Write-Host '  Keep this window open while using the page. Close it to stop the server.' -ForegroundColor DarkGray
Write-Host ''

if (-not $NoBrowser) {
  try { Start-Process $url } catch { }
}

function Write-Response {
  param(
    [System.Net.HttpListenerResponse]$Response,
    [int]$StatusCode,
    [string]$ContentType,
    [string]$Body
  )
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($Body)
  $Response.StatusCode = $StatusCode
  $Response.ContentType = $ContentType
  $Response.ContentLength64 = $bytes.Length
  $Response.OutputStream.Write($bytes, 0, $bytes.Length)
}

function Get-ContentType {
  param([string]$Path)
  switch ([System.IO.Path]::GetExtension($Path).ToLowerInvariant()) {
    '.html' { return 'text/html; charset=utf-8' }
    '.css'  { return 'text/css; charset=utf-8' }
    '.js'   { return 'text/javascript; charset=utf-8' }
    '.mjs'  { return 'text/javascript; charset=utf-8' }
    '.wasm' { return 'application/wasm' }
    '.task' { return 'application/octet-stream' }
    '.json' { return 'application/json; charset=utf-8' }
    '.svg'  { return 'image/svg+xml' }
    '.png'  { return 'image/png' }
    '.jpg'  { return 'image/jpeg' }
    '.jpeg' { return 'image/jpeg' }
    '.webp' { return 'image/webp' }
    '.ico'  { return 'image/x-icon' }
    '.map'  { return 'application/json; charset=utf-8' }
    '.woff' { return 'font/woff' }
    '.woff2' { return 'font/woff2' }
    default { return 'application/octet-stream' }
  }
}

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response

    try {
      $path = $request.Url.AbsolutePath
      if ([string]::IsNullOrWhiteSpace($path) -or $path -eq '/') {
        $path = '/index.html'
      }

      $decoded = [System.Uri]::UnescapeDataString($path).TrimStart('/')
      if ($decoded -eq 'favicon.ico') {
        $response.StatusCode = 204
        $response.ContentLength64 = 0
        $response.Close()
        continue
      }

      $relative = $decoded.Replace('/', '\')
      $full = [System.IO.Path]::GetFullPath((Join-Path $root $relative))

      if (-not $full.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
        Write-Response $response 403 'text/plain; charset=utf-8' 'Forbidden'
        $response.Close()
        continue
      }

      if (-not (Test-Path -LiteralPath $full -PathType Leaf)) {
        Write-Response $response 404 'text/plain; charset=utf-8' 'Not found'
        $response.Close()
        continue
      }

      $file = Get-Item -LiteralPath $full
      $response.StatusCode = 200
      $response.ContentType = Get-ContentType $full
      $response.Headers.Add('Cache-Control', 'no-cache')
      $response.ContentLength64 = $file.Length

      if ($request.HttpMethod -ne 'HEAD') {
        $stream = [System.IO.File]::OpenRead($full)
        try {
          $stream.CopyTo($response.OutputStream)
        } finally {
          $stream.Dispose()
        }
      }
    } catch {
      Write-Host ('  Request error: ' + $_.Exception.Message) -ForegroundColor DarkYellow
      try {
        if (-not $response.HeadersSent) {
          $response.StatusCode = 500
          $response.ContentLength64 = 0
        }
      } catch { }
    } finally {
      try { $response.Close() } catch { }
    }
  }
} finally {
  try { $listener.Stop() } catch { }
  try { $listener.Close() } catch { }
}

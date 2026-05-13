param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"
$script:LogDir = Join-Path $env:TEMP "belote-remote-test-logs"

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "=== $Message ===" -ForegroundColor Cyan
}

function Quote-PowerShellString {
  param([string]$Value)
  return "'" + $Value.Replace("'", "''") + "'"
}

function Find-Cloudflared {
  $cmd = Get-Command cloudflared -ErrorAction SilentlyContinue
  if ($cmd) {
    return $cmd.Source
  }

  $exe = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter "cloudflared*.exe" -ErrorAction SilentlyContinue |
    Select-Object -First 1 -ExpandProperty FullName

  if (!$exe) {
    throw "cloudflared introuvable. Installe-le avec: winget install --id Cloudflare.cloudflared --source winget"
  }

  return $exe
}

function Assert-Ports-Free {
  $used = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $_.LocalPort -in 4000, 4001, 5173 }

  if ($used) {
    Write-Host ""
    Write-Host "Ports deja utilises. Ferme backend/frontend/tunnels puis relance le script." -ForegroundColor Yellow
    $used | Select-Object LocalAddress, LocalPort, OwningProcess
    throw "Ports occupes."
  }
}

function Start-BeloteWindow {
  param(
    [string]$Title,
    [string]$WorkingDir,
    [string[]]$CommandLines
  )

  $safeFileName = ($Title -replace "[^a-zA-Z0-9_-]", "_")
  $scriptPath = Join-Path $script:LogDir "$safeFileName.ps1"

  $childLines = New-Object "System.Collections.Generic.List[string]"
  [void]$childLines.Add('$Host.UI.RawUI.WindowTitle = ' + (Quote-PowerShellString $Title))
  [void]$childLines.Add('Set-Location -LiteralPath ' + (Quote-PowerShellString $WorkingDir))

  foreach ($line in $CommandLines) {
    [void]$childLines.Add($line)
  }

  Set-Content -Path $scriptPath -Value $childLines -Encoding UTF8

  Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    $scriptPath
  ) -WindowStyle Normal | Out-Null
}

function Wait-For-Port {
  param(
    [int]$Port,
    [string]$Label
  )

  for ($i = 0; $i -lt 40; $i++) {
    $conn = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
      Where-Object { $_.LocalPort -eq $Port }

    if ($conn) {
      Write-Host "$Label OK sur le port $Port"
      return
    }

    Start-Sleep -Seconds 1
  }

  throw "$Label ne semble pas ecouter sur le port $Port."
}

function Wait-For-TunnelUrl {
  param(
    [string]$LogPath,
    [string]$Label
  )

  $pattern = "https://[a-z0-9-]+\.trycloudflare\.com"

  for ($i = 0; $i -lt 90; $i++) {
    if (Test-Path $LogPath) {
      $content = Get-Content $LogPath -Raw -ErrorAction SilentlyContinue

      if (![string]::IsNullOrWhiteSpace($content)) {
        $match = [regex]::Match($content, $pattern)

        if ($match.Success) {
          Write-Host "$Label tunnel OK: $($match.Value)"
          return $match.Value
        }
      }
    }

    Start-Sleep -Seconds 1
  }

  throw "URL Cloudflare introuvable pour $Label. Regarde la fenetre du tunnel."
}

Write-Step "Controle des ports"
Assert-Ports-Free

$cloudflaredExe = Find-Cloudflared
Write-Host "cloudflared: $cloudflaredExe"

New-Item -ItemType Directory -Force -Path $script:LogDir | Out-Null
Remove-Item (Join-Path $script:LogDir "*.log") -ErrorAction SilentlyContinue

Write-Step "Lancement backend"
$backendDir = Join-Path $ProjectRoot "backend"
Start-BeloteWindow "Belote - Backend" $backendDir @("node server.js")
Wait-For-Port 4001 "Backend HTTP"
Wait-For-Port 4000 "Backend WebSocket"

Write-Step "Tunnel API"
$apiLog = Join-Path $script:LogDir "api.log"
$apiCommand = "& " + (Quote-PowerShellString $cloudflaredExe) + " tunnel --url http://127.0.0.1:4001 *>&1 | Tee-Object -FilePath " + (Quote-PowerShellString $apiLog)
Start-BeloteWindow "Belote - Tunnel API" $ProjectRoot @($apiCommand)
$apiUrl = Wait-For-TunnelUrl $apiLog "API"

Write-Step "Tunnel WebSocket"
$wsLog = Join-Path $script:LogDir "websocket.log"
$wsCommand = "& " + (Quote-PowerShellString $cloudflaredExe) + " tunnel --url http://127.0.0.1:4000 *>&1 | Tee-Object -FilePath " + (Quote-PowerShellString $wsLog)
Start-BeloteWindow "Belote - Tunnel WebSocket" $ProjectRoot @($wsCommand)
$wsHttpUrl = Wait-For-TunnelUrl $wsLog "WebSocket"
$wsUrl = $wsHttpUrl -replace "^https://", "wss://"

Write-Step "Tunnel frontend"
$frontendTunnelLog = Join-Path $script:LogDir "frontend-tunnel.log"
$frontendTunnelCommand = "& " + (Quote-PowerShellString $cloudflaredExe) + " tunnel --url http://127.0.0.1:5173 *>&1 | Tee-Object -FilePath " + (Quote-PowerShellString $frontendTunnelLog)
Start-BeloteWindow "Belote - Tunnel Frontend" $ProjectRoot @($frontendTunnelCommand)
$frontendUrl = Wait-For-TunnelUrl $frontendTunnelLog "Frontend"
$frontendHost = ([uri]$frontendUrl).Host

Write-Step "Lancement frontend Vite"
$frontendDir = Join-Path $ProjectRoot "frontend"

$frontendLines = New-Object "System.Collections.Generic.List[string]"
[void]$frontendLines.Add('$env:NODE_OPTIONS = ' + (Quote-PowerShellString "--max-old-space-size=4096"))
[void]$frontendLines.Add('$env:VITE_API_URL = ' + (Quote-PowerShellString $apiUrl))
[void]$frontendLines.Add('$env:VITE_WS_URL = ' + (Quote-PowerShellString $wsUrl))
[void]$frontendLines.Add('$env:__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS = ' + (Quote-PowerShellString $frontendHost))
[void]$frontendLines.Add("npm run dev -- --host 0.0.0.0")

Start-BeloteWindow "Belote - Frontend Vite" $frontendDir $frontendLines
Wait-For-Port 5173 "Frontend Vite"

Write-Step "Pret pour le test a distance"
Write-Host "Lien a envoyer a Vero et aux amis:" -ForegroundColor Green
Write-Host $frontendUrl -ForegroundColor Green
Write-Host ""
Write-Host "Ne donne pas les liens API/WebSocket."
Write-Host "Garde ouvertes les fenetres lancees."
Write-Host "Pour tout arreter apres le test: Ctrl+C dans chaque fenetre."
Write-Host ""
Write-Host "API_URL: $apiUrl"
Write-Host "WS_URL : $wsUrl"

$ErrorActionPreference = "Stop"

$projectRoot = "C:\Users\Gurvir\Documents\2026-04-23-i-have-chrome-open-with-my-2"
$siteUrl = "http://127.0.0.1:8000/site/"
$chromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"

$serverReady = Test-NetConnection -ComputerName "127.0.0.1" -Port 8000 -InformationLevel Quiet -WarningAction SilentlyContinue

if (-not $serverReady) {
  Start-Process python -ArgumentList "serve_uplearn_site.py" -WorkingDirectory $projectRoot -WindowStyle Minimized
  Start-Sleep -Seconds 2
}

if (Test-Path $chromePath) {
  Start-Process $chromePath -ArgumentList $siteUrl
} else {
  Start-Process $siteUrl
}

<#
  JobPilot desktop launcher.

  Makes a local web app behave like an installed program:

    1. starts the Next server with no console window,
    2. waits until the port actually answers,
    3. opens it in a borderless browser window (no tabs, no address bar),
    4. shuts the server down when that window is closed.

  Step 4 is the reason this is a script and not a shortcut to a URL. A hidden
  server with nothing tied to its lifetime would keep running forever, holding
  the port and a SQLite handle. Tying it to the window means closing the app
  closes the app.

  Not invoked directly  -  JobPilot.vbs runs it so no PowerShell window appears.
#>

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$port = 3000
$url = "http://127.0.0.1:$port"
$logDir = Join-Path $root "data"
$log = Join-Path $logDir "launcher.log"

function Write-Log($message) {
  try {
    if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
    Add-Content -Path $log -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $message" -Encoding utf8
  } catch { }
}

function Test-Port {
  $client = New-Object Net.Sockets.TcpClient
  try { $client.Connect("127.0.0.1", $port); return $true }
  catch { return $false }
  finally { $client.Dispose() }
}

function Show-Error($message) {
  Write-Log "ERROR: $message"
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show(
    $message, "JobPilot",
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Error) | Out-Null
}

Write-Log "launcher starting (root=$root)"
Set-Location $root

# --- Node present? Without it nothing else can work, and the failure is
# otherwise a window that flashes and vanishes. ---
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Show-Error "Node.js is not installed, or not on the PATH.`n`nJobPilot needs it to run. Install the LTS version from nodejs.org, then try again."
  exit 1
}

# --- Dependencies present? ---
if (-not (Test-Path (Join-Path $root "node_modules"))) {
  Show-Error "JobPilot's dependencies are not installed yet.`n`nRun this once in the JobPilot folder:`n`n    npm install"
  exit 1
}

# --- Start the server, unless something is already serving that port. ---
$serverProcess = $null
$alreadyRunning = Test-Port
if ($alreadyRunning) {
  Write-Log "port $port already answering - reusing it"
} else {
  # Production build if one exists: it starts faster and uses less memory than
  # dev mode. Falls back to dev so a fresh clone still works.
  $script = if (Test-Path (Join-Path $root ".next\BUILD_ID")) { "start" } else { "dev" }
  Write-Log "starting server with: npm run $script"
  $serverProcess = Start-Process -FilePath "cmd.exe" `
    -ArgumentList "/c", "npm run $script" `
    -WorkingDirectory $root -WindowStyle Hidden -PassThru

  $ready = $false
  foreach ($i in 1..90) {
    Start-Sleep -Milliseconds 500
    if ($serverProcess.HasExited) { break }
    if (Test-Port) { $ready = $true; Write-Log "server ready after $($i * 0.5)s"; break }
  }
  if (-not $ready) {
    Write-Log "server failed to start"
    try { if (-not $serverProcess.HasExited) { taskkill /T /F /PID $serverProcess.Id 2>&1 | Out-Null } } catch { }
    Show-Error "JobPilot could not start.`n`nSomething may already be using port $port, or the app needs rebuilding. Details are in:`n`n$log"
    exit 1
  }
}

# --- Open it in a real app window. Chrome and Edge both support --app, which
# drops the tab strip and address bar; the result is indistinguishable from a
# native window. Falling back to the default browser is better than failing. ---
$browsers = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
)
$browser = $browsers | Where-Object { Test-Path $_ } | Select-Object -First 1

$window = $null
if ($browser) {
  # A dedicated profile directory keeps this window out of her normal browsing
  # session, and makes the process tree ours alone to wait on and close.
  $profileDir = Join-Path $root "data\browser-profile"
  Write-Log "opening app window with $browser"
  $window = Start-Process -FilePath $browser -PassThru -ArgumentList @(
    "--app=$url",
    "--user-data-dir=`"$profileDir`"",
    "--no-first-run",
    "--no-default-browser-check",
    "--window-size=1400,900"
  )
} else {
  Write-Log "no Chrome/Edge found - using the default browser"
  Start-Process $url
}

# --- Wait for the window, then clean up. ---
if ($window) {
  Write-Log "waiting for the app window to close"
  $window.WaitForExit()
  Write-Log "app window closed"
} elseif (-not $alreadyRunning) {
  # No window handle to wait on, so keep serving until the port stops answering
  # rather than killing a server the user is still using.
  Write-Log "no window handle - polling the port instead"
  while (Test-Port) { Start-Sleep -Seconds 5 }
}

# Only stop what this run started. Reusing an already-running server means
# someone else owns it  -  most likely `npm run dev` in a terminal.
if ($serverProcess -and -not $alreadyRunning) {
  try {
    if (-not $serverProcess.HasExited) {
      Write-Log "stopping server (PID $($serverProcess.Id) and children)"
      # /T because npm.cmd spawns node as a child; killing only the shell
      # would orphan the actual server.
      taskkill /T /F /PID $serverProcess.Id 2>&1 | Out-Null
    }
  } catch { Write-Log "could not stop server: $_" }
}
Write-Log "launcher done"

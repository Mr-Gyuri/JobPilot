<#
  Creates JobPilot shortcuts on the Desktop and in the Start Menu, so it can be
  launched like any installed program  -  including by typing "JobPilot" into the
  Start menu search.

  Run once:  right-click -> Run with PowerShell
  (or from a terminal: powershell -ExecutionPolicy Bypass -File launcher\install-shortcuts.ps1)

  Removes nothing else and installs nothing system-wide: these are two .lnk
  files pointing at JobPilot.vbs in this folder. Delete them to uninstall.
#>

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$target = Join-Path $root "JobPilot.vbs"
$icon = Join-Path $PSScriptRoot "jobpilot.ico"

if (-not (Test-Path $target)) { throw "Cannot find $target" }
if (-not (Test-Path $icon)) { throw "Cannot find $icon  -  run launcher\make-icon.ps1 first" }

$shell = New-Object -ComObject WScript.Shell
$created = @()

function New-JobPilotShortcut($path) {
  $link = $shell.CreateShortcut($path)
  # wscript.exe runs the .vbs with no console window at all.
  $link.TargetPath = "wscript.exe"
  $link.Arguments = """$target"""
  $link.WorkingDirectory = $root
  $link.IconLocation = "$icon,0"
  $link.Description = "JobPilot  -  private job-hunting assistant"
  $link.WindowStyle = 1
  $link.Save()
  return $path
}

$desktop = [Environment]::GetFolderPath("Desktop")
$created += New-JobPilotShortcut (Join-Path $desktop "JobPilot.lnk")

# Per-user Start Menu  -  no admin rights needed, and it makes JobPilot findable
# from the Start menu search box.
$startMenu = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"
if (-not (Test-Path $startMenu)) { New-Item -ItemType Directory -Path $startMenu -Force | Out-Null }
$created += New-JobPilotShortcut (Join-Path $startMenu "JobPilot.lnk")

[System.Runtime.InteropServices.Marshal]::ReleaseComObject($shell) | Out-Null

Write-Output ""
Write-Output "JobPilot installed. Created:"
foreach ($c in $created) { Write-Output "  $c" }
Write-Output ""
Write-Output "Launch it from the desktop icon, or type JobPilot into the Start menu."
Write-Output "To uninstall, just delete those two shortcuts."
Write-Output ""

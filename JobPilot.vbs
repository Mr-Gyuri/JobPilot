' JobPilot  -  double-click to run.
'
' This exists only to start launcher\jobpilot.ps1 with no window at all.
' Running a .ps1 from a shortcut flashes a blue console; wscript.exe shows
' nothing, which is what an installed program looks like.
'
' The launcher itself starts the server, opens the app window, and shuts the
' server down when that window closes.

Option Explicit

Dim shell, fso, here, ps1, cmd
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

here = fso.GetParentFolderName(WScript.ScriptFullName)
ps1 = here & "\launcher\jobpilot.ps1"

If Not fso.FileExists(ps1) Then
    MsgBox "JobPilot is missing launcher\jobpilot.ps1." & vbCrLf & vbCrLf & _
           "Expected it at:" & vbCrLf & ps1, 16, "JobPilot"
    WScript.Quit 1
End If

cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1 & """"

' 0 = hide the window, False = don't block this script on it.
shell.Run cmd, 0, False

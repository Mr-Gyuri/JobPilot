# launcher/

Turns JobPilot from "a dev server you start in a terminal" into something that
launches from a desktop icon like an installed program.

## Install

```
powershell -ExecutionPolicy Bypass -File launcher\install-shortcuts.ps1
```

Creates two shortcuts — Desktop and the per-user Start Menu — both pointing at
`JobPilot.vbs`. Nothing is installed system-wide, no admin rights are needed, and
uninstalling means deleting those two `.lnk` files.

## What happens on launch

| Step | Why |
|---|---|
| `JobPilot.vbs` runs `jobpilot.ps1` via `wscript.exe` | Shows no window at all. A `.ps1` from a shortcut flashes a blue console |
| Server starts hidden, using `npm run start` if `.next/BUILD_ID` exists, else `npm run dev` | Production mode starts faster and uses less memory; dev is the fallback so a fresh clone still works |
| Waits for port 3000 to actually accept a connection (up to 45s) | Opening the browser immediately lands on a connection error |
| Opens Chrome or Edge with `--app=` and a dedicated `--user-data-dir` | `--app` drops the tab strip and address bar. The separate profile keeps it out of the user's browsing session and makes the process tree ours to wait on |
| Waits for that window to exit, then `taskkill /T` on the server | **The point of the script.** A hidden server with nothing tied to its lifetime runs forever, holding the port and a SQLite handle |

A server that was already running is reused and **not** killed on exit — that's
someone else's `npm run dev`, and killing it would be rude.

Failures show a message box rather than vanishing: Node missing, `node_modules`
missing, or the server not coming up. Everything is logged to `data/launcher.log`.

## Files

| File | Purpose |
|---|---|
| `../JobPilot.vbs` | Entry point. Runs the launcher with no visible window |
| `jobpilot.ps1` | Start server, open window, wait, clean up |
| `install-shortcuts.ps1` | Creates the Desktop and Start Menu shortcuts |
| `make-icon.ps1` | Regenerates `jobpilot.ico`. Only needed if the icon changes |
| `jobpilot.ico` | Multi-size icon (16–256px), committed so install needs no image tools |
| `../Start JobPilot.bat` | Visible-console fallback. Use this when diagnosing a launch failure |

## Gotchas

**Keep these scripts ASCII-only.** Windows PowerShell 5.1 reads a BOM-less
`.ps1` as ANSI, so a UTF-8 em dash becomes mojibake and can break parsing — an
em dash in a `throw` string is what broke `install-shortcuts.ps1` the first time.

**The launcher serves the production build.** After changing source, run
`npm run build`, or the icon will keep serving the previous version. Delete
`.next` to force the launcher back to dev mode.

**A rebuild doesn't reach a server that's still running.** `npm run build`
rewrites `.next` with new chunk filenames, but a `next start` process already
holding port 3000 keeps serving from what it loaded at startup — closing and
reopening the app window just reconnects to that same stale process, since the
launcher reuses whatever already answers on the port. The browser then throws
`ChunkLoadError` / 500s on its own JS chunks, which reads like a crash but
isn't one. Fix: kill the node process holding port 3000 before relaunching —
`Get-NetTCPConnection -LocalPort 3000` to find its PID, `Stop-Process` on it —
then start the app fresh so it rebuilds from the current `.next`.

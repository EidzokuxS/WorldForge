# Phase 33 Browser Transport Probe

- transport: PinchTab
- status: blocked
- measured_at: 2026-04-02T01:07:34+03:00

## Readiness

- frontend:
  - timestamp: 2026-04-02T01:02:00+03:00
  - command: `Invoke-WebRequest 'http://localhost:3000' -UseBasicParsing`
  - result: `200 OK`
- backend:
  - timestamp: 2026-04-02T01:02:00+03:00
  - command: `Invoke-RestMethod 'http://localhost:3001/api/health'`
  - result: `{"status":"ok"}`

## Active PinchTab Bridge

- command: `pinchtab health`
- observed_at: 2026-04-02T01:03:10+03:00
- result:
  - `status: ok`
  - `mode: dashboard`
  - `version: 0.8.1`
  - `defaultInstance.id: inst_b1d6b40d`
  - `restartRequired: true`
  - `restartReasons: Server address, Profiles directory, Routing strategy, Restart policy`
- listener:
  - `127.0.0.1:9867`
  - owner: `wslrelay.exe` PID `62192`

## Localhost Smoke Attempt

1. `pinchtab nav http://localhost:3000/`
2. `pinchtab snap -i -c`
3. `pinchtab eval "var btn = document.querySelector('a[href=\"/campaign/new\"]'); ..."`
4. `pinchtab eval "window.location.pathname"`

### Outputs

- root snapshot:

```text
# localhost | chrome-error://chromewebdata/ | 3 nodes
e0:button "Details"
e1:button "Reload"
e2:link "Checking the proxy and the firewall"
```

- click attempt result:
  - `window.location.pathname` stayed `/`
  - launcher link was not available because PinchTab never rendered the app shell
- follow-up snapshot remained the same proxy/firewall error page

## Clean Local Restart Attempt

- command: `cmd /c set BRIDGE_HEADLESS=true&& pinchtab serve --port 9868`
- observed_at: 2026-04-02T01:07:34+03:00
- result:

```text
INFO launching Chrome profile=C:\Users\robra\.pinchtab\chrome-profile headless=true
WARN Chrome startup failed, clearing sessions and retrying once
ERROR Chrome failed to start after retry
hint="try BRIDGE_NO_RESTORE=true or delete your profile directory"
profile=C:\Users\robra\.pinchtab\chrome-profile
```

- consequence:
  - the clean local server did not become usable on `http://127.0.0.1:9868`
  - the shared `C:\Users\robra\.pinchtab\chrome-profile` is already locked by existing Chrome/PinchTab processes

## Additional Evidence

- current PinchTab-managed Chrome processes run with `--user-data-dir=C:\Users\robra\.pinchtab\chrome-profile`
- the active bridge can see the public internet; a later `pinchtab snap -i -c` exposed `https://www.tumblr.com/new/text`, proving the bridge is attached to an existing external browsing profile instead of a clean localhost-only test session
- repo search across [package.json](R:\Projects\WorldForge\package.json), [frontend/package.json](R:\Projects\WorldForge\frontend\package.json), and [backend/package.json](R:\Projects\WorldForge\backend\package.json) found no project-local PinchTab launch/config seam to patch; PinchTab references live only in planning docs

## Diagnosis

- product reachability is healthy on this machine: frontend `http://localhost:3000` and backend `http://localhost:3001/api/health` both respond
- the blocker is external to WorldForge: the current PinchTab/browser environment is isolated from this machine's localhost and is also sharing a locked Chrome profile
- no repo-local package/script/config change can make the current bridge satisfy the required localhost smoke path

## Required Next Step

- provide a clean PinchTab bridge running on the same host as the dev servers, with a fresh Chrome profile and no proxy interception for `localhost`
- once that exists, rerun:
  1. `pinchtab nav http://localhost:3000/`
  2. `pinchtab snap -i -c` and confirm `New Campaign`
  3. click `a[href="/campaign/new"]`
  4. confirm `window.location.pathname === "/campaign/new"`
  5. `pinchtab snap -i -c` and confirm the creation UI

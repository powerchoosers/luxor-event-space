---
name: preview
description: Start the dev server if needed and open the agent-proxied browser preview so the "Send element" picker works
triggers:
  - user
allowed-tools:
  - exec
  - browser_preview
---

Open the Luxor site in the Devin browser preview so Lewis can use the "Send element" picker.

Steps:

1. Check whether the dev server is already running:
   `try { (Invoke-WebRequest -Uri http://localhost:3000 -UseBasicParsing -TimeoutSec 5).StatusCode } catch { $_.Exception.Message }`
   (PowerShell aliases `curl` to `Invoke-WebRequest`; use `Invoke-WebRequest` or `curl.exe`.)
2. If it is not running, start it in the background: `npm run dev` (timeout 0 / background shell), then poll `http://localhost:3000` until it returns 200.
3. Call `browser_preview` with `url: "http://localhost:3000"` and a short name like `Luxor Event Space`. Calling it again for the same URL returns the existing preview — that is fine.
4. Tell Lewis to use the preview URL the tool returns (a `http://127.0.0.1:<port>` address) in the IDE's in-app browser panel — not `localhost:3000` directly. The "Send element" button is only injected on the proxied preview; it never appears on a directly opened localhost URL.

Notes:

- If Lewis says the Send element button is missing, first confirm he is on the agent-created preview URL from step 3, opened through this session's preview — not a manually opened tab.
- Do not open `browser_preview` against any other port unless Lewis asks for a different target.

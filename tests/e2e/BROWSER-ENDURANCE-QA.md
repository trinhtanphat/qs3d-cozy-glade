# Cozy Glade browser endurance QA (isolated test context)

This is a **bounded browser-session endurance check**, not a physical GPU stress test. It measures renderer/scene continuity in an isolated Chrome profile on WIN11-181, with **no writes to the production backend**. It places a test cottage and uses browser-local storage that is discarded with the QA browser context.

## Run (PowerShell)

From the Glade repository with Playwright dependencies installed:

    $env:GAME_URL = "https://glade.qs3d.site/"
    $env:CHROME_CDP_URL = "http://127.0.0.1:9222"
    $env:QA_DURATION_MS = "180000"
    $env:QA_SAMPLE_MS = "15000"
    $env:QA_RESULTS_DIR = "C:\ProgramData\QS3D\GladeDemo\browser-endurance"
    npm run test:e2e:endurance

Chrome CDP mode **creates and closes only a new browser context**. It does not navigate or close pre-existing tabs. It terminates only the test Node process when done because shared Chrome CDP connections can otherwise keep the Node event loop open. Without CHROME_CDP_URL, it starts a separate headless Chrome instance (with software-backed WebGL flags) and closes only that process.

## Acceptance

The test waits for actual WebGL2 scene readiness, switches to Empty Meadow and places a cottage using mouse input. It sets time to 11:15, waits for persisted autosave, then samples every 15 seconds (configurable): game readiness, context-loss state, house count, map identity, FPS/draw calls/triangle stats, document visibility, autosave indicator and optional JS heap size.

A sample fails if scene content changes unexpectedly, context is lost, page crashes or renderer readiness disappears. The test also fails on unhandled page errors and failed non-analytics network requests. After the bounded interval, it checks the browser-local save, reloads once and verifies the same map, cottage and time are restored. The JSON report records every sample, failure and measured value; process exit code is 0 on PASS, nonzero on FAIL.

The duration defaults to 180,000 ms (3 minutes), capped to 30 minutes to avoid unbounded stress. Extending the test should be deliberate and monitored.

**Coverage limits:** This is not physical GPU endurance on Intel UHD 620, every GPU, physical Android/iOS devices or multi-hour server uptime. QA host DESKTOP-PHA1S90 has recurrent Kernel-Power 41/6008 and PCIe Root Port WHEA 17; do not run long GPU stress there until host reliability is established. See issue #17 and the separate Intel hardware smoke script.

No GitHub Actions are used; preserve production deployment, WIN11-181 Session 2, Private Commander tunnel and other QS3D services.

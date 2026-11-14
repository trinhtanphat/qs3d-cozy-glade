# Hardware WebGL2 Smoke QA (local GPU only)

This is a **hardware acceptance script**, not a CI job. It does not deploy anything, mutate server data, or use GitHub Actions. Do not run it on a shared kiosk if Chrome launch could interfere with other workloads. Use a dedicated test Windows user/session and an isolated Chrome process.

## Requirements

- Windows with a functioning hardware graphics driver (Intel UHD 620 / D3D11 reference platform).
- Google Chrome installed and Node 20+ with repository devDependencies installed via npm ci.
- Device connected to the production test URL.
- No reboot or Wi-Fi reset is necessary. Do not close shared Chrome windows or Session 2.

## Run (PowerShell)

~~~powershell
npm ci
$env:GAME_URL = "https://glade.qs3d.site/"
$env:GPU_RENDERER = "Intel.*D3D11"
$env:GPU_RUNS = "2"
$env:GPU_MIN_FPS = "15"
$env:GPU_READY_TIMEOUT_MS = "85000"
$env:QA_RESULTS_DIR = "C:\ProgramData\QS3D\GladeGPUQA"
npm run test:e2e:gpu
~~~

You can set CHROME_BIN to a known Chrome executable if automatic detection is unsuitable. Each run creates **its own** headless Chrome, opens a new isolated context (390x844 mobile emulation), checks WebGL2 readiness, confirms ANGLE reports a hardware renderer rather than SwiftShader, explicitly selects Eco graphics quality and samples FPS, geometry and draw calls. It writes gpu-hardware-smoke.json in QA_RESULTS_DIR and reports PASS only when every required check passes.

The exit code is **0** for PASS and nonzero for FAIL. If a timeout occurs, the report records the overlay CSS class, visible loading status and whether the game handle exists. Never convert a timeout into PASS merely because HTTP returned 200.

## Evidence baseline — 14 November 2026

Real hardware machine DESKTOP-PHA1S90, Intel UHD Graphics 620 (driver 31.0.101.2141), Chrome / ANGLE Direct3D11, production URL https://glade.qs3d.site/:

- **Run 1**: isolated diagnostic WebGL2 context true, renderer Intel UHD 620 / D3D11, scene ready, viewport 390x844, DPR 0.85, Eco preset, 36 FPS, 125 draw calls, ~531803 triangles; exit code 0. Evidence SHA-256: 87BDB777B89A46AC26BB3890ABD2122DD100F2203ECEEFF6ECD0B07A50135943.
- **Run 2**: unmodified historical mini-gpu.cjs hardware smoke, same Intel UHD 620 D3D11 renderer, 390x844, 34 FPS before, 37 FPS after, 125 draw calls, ~531547 triangles, Eco preset; exit code 0. Evidence SHA-256: 0D3A7CB879F422ECB3E522053E92B4300837DE1BFA2307604EFCA61609E19EC1.

Artifacts preserved on PHA in C:\ProgramData\QS3D\GladeGPUQA under intel-uhd620-proof-20261114-run1.json and intel-uhd620-proof-20261114-run2.json. Closed issue #14 documents the earlier intermittent 65-second readiness timeout; two later real GPU hardware passes recovered the previously missing evidence. This does **not** imply testing on a physical iOS/Android phone, every GPU, or sustained hours-long benchmark.

Do not add this test to GitHub Actions while the user's Actions quota remains exhausted; all QA is run locally.

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

## Browser-flag A/B finding on Intel UHD 620 (14 November 2026)

The earliest two Intel D3D11 runs passed, but the first checked-in multi-run harness used aggressive flags, including --ignore-gpu-blocklist and --disable-software-rasterizer. That harness then reproduced an intermittent failure: **run 1 WebGL2 context creation was denied, run 2 hardware PASS**. Chromium console reported "Web page caused context loss and was blocked". This is a browser-side WebGL context blocking mechanism (not a failed HTTP request). The game showed its existing WebGL2 error message instead of rendering.

A bounded A/B test removed the two aggressive flags but **continued to require a real Intel D3D11 hardware renderer**, rejecting SwiftShader/software. With the conservative flags, both runs rendered successfully at 17 and 23 FPS, 125 draw calls per frame. The checked-in script therefore uses the conservative flags by default and detects the loading-overlay has-error state promptly, without wasting the full readiness timeout. Evidence: C:\ProgramData\QS3D\GladeGPUQA\pr15-intel-repeat\gpu-hardware-smoke.json (aggressive flags, 1/2) and C:\ProgramData\QS3D\GladeGPUQA\pr15-safe-flags\gpu-hardware-smoke.json (conservative flags, 2/2).

**Interpretation:** This A/B evidence supports using less invasive browser flags for acceptance. It does not prove the cause of every possible driver crash, long-term hardware reliability or the absence of WebGL context losses. A browser may refuse WebGL contexts after GPU process resets; never misreport such a condition as a passing hardware test.

### Final checked-in harness acceptance — 14 November 2026

The canonical conservative-flags script at Git commit cb810cf94835c0dd6d76d81568a25b97fdd5abed was downloaded verbatim to DESKTOP-PHA1S90, and the SHA-256 matched its checked-in counterpart: E079C0ED139A0E91E7D52DED113F480E36E6D6372A7DCFC2B5752A648CCDC6FE.

Three consecutive hardware checks against https://glade.qs3d.site/ then exited 0 with **GPU_HARDWARE_ACCEPTANCE=PASS RUNS=3**. All three used real Intel UHD Graphics 620 (ANGLE Direct3D11) WebGL2 rather than SwiftShader, loading overlay hidden and actual Eco scene rendering:
- Run 1: 31 FPS, 125 draw calls, 530675 triangles; no page or network errors.
- Run 2: 31 FPS, 125 draw calls, 529307 triangles; no page or network errors.
- Run 3: 34 FPS, 125 draw calls, 529867 triangles; no page or network errors.

Local artifact: C:\ProgramData\QS3D\GladeGPUQA\pr15-final-3run\gpu-hardware-smoke.json, SHA-256 **F486788188093C30A9A458BB263F3B72B04BAAE85904A65CB8527FCFEFAADEBA**. The Intel machine was not rebooted; its boot time remained 14 Nov 2026 14:20:27, with about 3.1 GiB RAM available after completion. The earlier conservative-flags A/B run also passed 2/2, for **5/5 consecutive conservative-flags hardware successes** across those two batches.

Acceptance is limited to Intel UHD 620, Chrome 157 / ANGLE D3D11, Eco preset and 390x844 emulated mobile viewport. Stress runs using aggressive GPU overrides can still trigger Chromium's context-blocking guard; don't use those overrides as the default acceptance profile. This does not prove every real mobile GPU or many-hour operational endurance.

# QS3D Island QA and release record — 2026-11-13

## Reproducible local unit tests
Command: npm test
Original island release: 4 passed. Latest 2026-11-13 localization/mobile QA: **6 passed, 0 failed**.
- All five scene presets selectable, preserving four original scenes.
- Island meadow above sea level, ring ocean below sea level, and inset pond below sea level.
- Teal-roof cottage, two editable paths, fences, planted foliage.
- Finite, bounded terrain height values.

## Reproducible build
Command: npm run build
Result: PASS. Creates dist/glade.js, dist/glade.css, and fully inlined tiny-glade-aaa.html. Standalone check confirmed no external qs3d-guide.css or qs3d-guide.js reference.

## Browser smoke QA (WIN11-181, isolated preview port 5487)
Chrome headless, 1365x768, WebGL2 SwiftShader fallback:
- HTTP 200
- Scene loading overlay hidden, canvas 1365x768, WebGL2 context confirmed.
- Default preset: qs3d-island.
- All 5 presets present.
- Main toolbar and top menu translated into Vietnamese.
- Guide toggles open/closed successfully.
- Console/page/network errors: **0**.
- Screenshot: screenshots/qs3d-island-demo.jpg.

**Performance caveat:** software fallback reached very low FPS in headless QA, so no real GPU FPS target is considered accepted here. Physical-GPU QA and broad mobile cross-browser E2E are not covered by this record.

## Release boundaries
Source is based on MIT FireTable/tiny-glade. A genuine GitHub fork exists separately from QS3D customization (UPSTREAM-AUDIT.md).
Deployment is published by a new Cloudflare Tunnel dedicated to glade.qs3d.site.
Do not stop or edit other tunnels, production Nông Trại/BeeHoc/Saltline, or Session 2.
The watchdog operates on two namespaced tasks: QS3D/CozyGlade-Watchdog and QS3D/CozyGlade-Boot.

## Follow-up QA: mobile, language, deterministic build (13 Nov 2026)

- New dedicated branch: `feat/qs3d-vi-qa-20261113` derived from `qs3d/main`. Production was unchanged during implementation and staging tests.
- HTML document language is Vietnamese; preset labels, accessible tool names, engine errors and gameplay toast messages are localized.
- Mobile HUD has independently swipeable top and bottom bars, without horizontal page scrolling. Help remains visible and accessible.
- Coarse-pointer screens at <=760px start at `balanced`; desktop keeps `high`, both remain user-selectable.
- `npm run build` PASS; `npm test` **6/6 PASS**; `git diff --check` PASS.
- Single-file HTML bundles are byte-identical in root and dist, self-contained and LF-only; regression test added to prevent Windows CRLF variation.
- Playwright Chromium + SwiftShader, simulated mobile 390x844 on QA port 5487: WebGL2, scene initialization, Vietnamese scene options, guide open/close, all three scrollable bars and accessible last items PASS; no runtime errors. Mobile balanced had 105 draws / about 853k triangles; preceding high-quality emulator showed 125 draws / about 1.23M triangles. These are scene counters, **not real-device GPU FPS measurements**.
- Playwright Chromium + SwiftShader, desktop 1280x800 on QA port 5487: WebGL2, default high quality, choose House tool, set time to 08:30, select empty meadow and return to QS3D island all PASS; zero page/console/network errors.
- Prior public asset SHA-256 matched the then-current production checkout byte-for-byte for glade.js, glade.css, guide.js. Production URL healthz HTTP 200. Security probes returned 403 for /.git/config, /node_modules/three/package.json and /package.json.
- Browser/device limits: iOS Safari, Android physical hardware, device-specific frame rate and long-session memory profiling have **not** been verified. No 100% cross-device performance claim is made.

## Extended QA and hardening — 13 November 2026 (audit/complete-qa-20261113)

### Validated scope
- `npm run build`: PASS, standalone HTML self-contained and deterministic.
- `npm test`: **69 tests PASS**, zero FAIL. Includes geometry presets; export/import typed arrays and scene round trips; undo/redo; rejection of invalid or oversized JSON, prototype-pollution keys, non-finite numbers and extreme nesting; 12 adaptive-quality cases; 20 HTTP route/security/ETag/cache checks.
- `git diff --check`: PASS.
- Isolated Chrome/SwiftShader staging: 390x844 WebGL2 scene load, full visible island and teal roof without clipped scene, manual Eco tier, ~316 KB original scene JSON round trip, rejected malformed import, no page/console/network errors. This is a functional and visual test, NOT a physical FPS test.
- Isolated Chrome/SwiftShader staging: desktop 1280x800 WebGL2, select House, set 08:30, switch preset and restore island, no errors.
- `/healthz`, `/play/`, JS/CSS URLs and security restrictions covered by separate local-server tests.

### Physical GPU reference and evidence gap
- On another connected Windows PC, Chrome ANGLE Direct3D11 explicitly reported Intel UHD Graphics 620 (hardware renderer). **Baseline production** before this hardening: approximately 6 FPS desktop 1280x800 High and 14 FPS 390x844 Balanced. This is insufficient for smooth play.
- New tier `eco`: reduced grass (3000), optional shadows, shadow atlas, screen pixel density and post effects; automatically downgrades after sustained low FPS, but never overrides a user's manual setting.
- This Intel UHD620 machine subsequently disconnected from Private Commander; **new Eco FPS on that actual GPU remains unverified** and should not be described as achieved.
- Other physical GPU/Android/Safari tests and long-play stability remain outside current evidence.

### Release policy
- Worktree: `C:\QS3D-Glade-Island-QA`, isolated port 5487 until merge and production update.
- Production worktree: `C:\QS3D-Glade-QA`. Keep dedicated Cloudflare tunnel and all unrelated production services/session 2 unchanged. Keep rollback commit and verified backup before release.
- Origin now sends no-cache with ETag for HTML, JS and CSS to prevent users receiving mismatched old bundle files, plus additional security headers.

## Compact-desktop download hotfix — 13 Nov 2026

A real production browser E2E discovered that at 1280px the clock bar overlapped the Export button, causing Playwright's pointer click to be intercepted. This was a user-facing UI issue, despite the JSON exporter itself being valid. The staging fix uses a dedicated two-row, scrollable layout for widths 761–1349px and repositions the help button. Invalid user-provided JSON is rejected with a handled console warning rather than an uncaught page error.

**Reproduction and full functional fix verified on isolated staging port 5487:**
1. Chrome 1280×800: click the real `data-action=export` button using pointer interactions, observe a browser Download event.
2. Save `tiny-glade-scene.json` (~318 KB) and confirm `scene.world.terrain` and `scene.arch.buildings` exist.
3. Change clock 13:15 → 18:00, upload saved JSON via the real file input, verify clock restores to 13:15 and a success toast.
4. Upload malformed JSON (`{"world":{}}`), verify rejection and no changes to current scene, zero page/console/network errors.
Result: **PASS, exit code 0**, `errors:[]`.
`npm run build` PASS, `npm test` **70/70 PASS**, `git diff --check` PASS.

## 13 Nov 2026 — Low-end GPU hardware check and scene-import amplification audit

**Physical GPU evidence:** Chrome headless ANGLE/Direct3D11 exposed Intel(R) UHD Graphics 620 on DESKTOP-PHA1S90 (not SwiftShader). At an emulated 390×844 viewport (DPR 1) on the production build: Balanced rendered roughly 14 FPS in the earlier baseline, Eco later reported 22 FPS and 45 ms/frame, 3000 grass instances, 125 draws and ~629,933 triangles. This is a 57% increase in observed FPS, but the viewport is emulated and other system load was present; it is not a claim about physical Android/iOS devices or a 30/60 FPS guarantee. A longer sequential hardware benchmark exceeded its timeout and did not produce complete results. Another Chrome QA profile was active on the GPU workstation; it was left untouched.

**New QA fixes:**
- Startup selects Eco for proven low-end Intel UHD Graphics 600/610/620/630 and legacy Intel HD 4xx/5xx/6xx strings when WEBGL_debug_renderer_info is available. Unidentified/discrete GPUs retain the default adaptive setting. No device information is transmitted. User's saved manual tier (localStorage) always wins and disables automatic overrides.
- Import rejects excessive GPU scene geometry: max 200 buildings, 400 walls, 256 paths, 1200 clutter elements, 600 trees/bushes/boulders, 4000 flowers, 512 path/wall vertices. JSON size/depth/prototype-pollution protections remain.
- A realistic exported production scene (including signed/unsigned 32-bit procedural seeds near 2.3 billion) is accepted. A first QA draft rejected legitimate large seeds; fixed by allowing unsigned 32-bit values for named seed fields while retaining numeric limits for other geometry parameters.
- Staging end-to-end Chrome WebGL2: clicked real Save button, downloaded ~315 KB JSON, changed clock 13:15→18:00, imported JSON via real file picker, verified 13:15 restored; invalid JSON safely rejected without state mutation. errors=[] and exit code 0.
- Node tests: 84/84 PASS, production HTTP contract tests preserved, build PASS, diff checks PASS.

**Release policy:** only merge if production commit exactly matches expected and clean. Keep WIN11-181 Session 2, unrelated tunnel services, and GitHub Actions untouched. Backup changed production files with SHA-256 verification and retain rollback commit.

**Unverified, explicitly not certified:** sustained FPS on physical Android/iOS/Safari, actual low-power Intel hardware FPS *after* the new startup-detection change, full visual identity to any original video game, arbitrary gameplay endurance and all possible devices.

## 13 Nov 2026 — Eco terrain topology LOD (isolated staging)

- Renderer object audit showed the 256x256 terrain rasterized 130,050 triangles, water 51,200 and grass 45,000 in Eco; terrain was the highest-cost individual mesh.
- Added a reversible 2-grid-step terrain index buffer for Eco: 32,768 triangles vs 130,050 in High/Ultra (74.8% fewer terrain faces). Retains all 65,536 editable heightfield vertices, normals, 256x256 terrain texture and original full-resolution index for instant reverse tier switching.
- Unit test verifies index geometry, all indices in bounds, unchanged heights, repeated Eco/High/Ultra transitions and exact full topology restoration.
- `npm test`: **85/85 PASS**; `npm run build`: PASS; `git diff --check`: PASS; `npm audit --omit=dev --audit-level=moderate`: found 0 vulnerabilities.
- Isolated Chrome 390x844/WebGL2 staging rendered the island, bridge, roof, ocean and trees at Eco with ~531.8K scene triangles (previous Eco ~624.6K; draw calls still 125). No JS, page, console or network errors. Software-renderer FPS is not used for hardware performance claims.
- Separate browser E2E: real export (~316 KB), modify clock 13:15->18:00, import and recover 13:15, reject malformed import safely; zero errors, PASS.
- Remaining gate: hardware FPS of this *new* terrain LOD on actual Intel UHD 620, with exact branch code, is not yet verified.

### Hardware follow-up: exact Eco terrain LOD QA build

- Checked out exact QA commit `a59ae4e1f3465979d6ecd76884f667ceeafdff5b` into a separate clone on DESKTOP-PHA1S90; served on dedicated localhost port 5589 (without modifying production or unrelated browser profiles).
- Real Chrome headless ANGLE renderer: `Intel(R) UHD Graphics 620 (0x00005917) Direct3D11`, explicitly **not** SwiftShader.
- Viewport **390×844 (emulated mobile in desktop Chrome)**, device pixel ratio 1.0, Eco renderer pixel ratio 0.85. After the scene loaded: telemetry **31 FPS / 32.08 ms**; after steady observation **27 FPS / 37.13 ms**, 125 draw calls, 531,219 triangles, 3000 grass instances, no test errors, exit code 0.
- This is a measured hardware run of the **new QA terrain-LOD branch**, not a guarantee of 30 FPS on all GPUs, physical mobile devices or sustained multi-hour play. FPS varies with GPU/CPU load. Previous public Eco measurements on this hardware ranged from roughly 15 to 22 FPS under different loads, so direct speedup percentages are not claimed.

## 13/11/2026 — Persistent local autosave and full real-click E2E

Previous release only supported manual JSON download/import: unsaved edits could disappear on closing a tab. This update adds a **browser-local** checkpoint (key `qs3d-cozy-glade:scene-autosave-v1`) on building edits, map change, time/weather adjustments, undo/redo and JSON import. Writes are debounced (1.8s), flushed on tab/page hide, and restored on next page load. Stored scenes are parsed with the existing safe JSON importer; malformed data never blocks game startup and is left intact for recovery. When storage is blocked or full, game interaction and manual file export continue normally. A manual quality selection is still preserved separately.

The serialization path was refactored to expose `HistoryManager.serializeJSON(snapshot)` without triggering a browser download; manual Save JSON still downloads identically. On restore, the chosen map name and camera framing are reapplied, with undo history reset to the recovered baseline. Autosave is **per browser/device** and does not synchronize between accounts/devices; use Save JSON as a portable backup.

- `npm test`: 94/94 PASS (including 9 autosave unit tests, storage denial/quota/corruption, lazy debounce, pure JSON round-trip).
- `npm run build` PASS; `git diff --check` PASS.
- Full Playwright Chrome 1280×800 **real pointer interactions** on isolated `http://127.0.0.1:5487/`:
  1. Set time 18:45; assert checkpoint exists (316,555 chars); reload → **18:45 restored**.
  2. Select Empty Meadow and click real **House** tool + canvas; 0 → 1 building; assert checkpoint stores `empty-meadow` and 1 building; reload → same map and building.
  3. Place another house and click real Undo then Redo: building counts **2 → 1 → 2**.
  4. Replace autosave with invalid JSON and reload; game remains playable, detects damaged save, zero page/console/network errors.
- Full E2E exit code **0**, `success: true`, `errorCount: 0`. Evidence file local: `C:\ProgramData\QS3D\GladeDemo\qa-autosave-gameplay.json`.
- Initial browser QA caught `Illegal invocation` from passing unbound `setTimeout` methods into the module; fixed using bound-safe wrapper functions before any public release. Float32 field comparisons use correct precision tolerance.
- Reproducible test: `npm ci`, `npm run build`, then `GAME_URL=http://127.0.0.1:5487/ npm run test:e2e` after starting the isolated QA origin. Windows Chrome default path is used; override `CHROME_BIN` if needed. Set `QA_RESULTS_DIR` to put logs outside Git checkout. No GitHub Actions used.

Limitations explicitly not claimed: physical iOS/Android, Safari, all GPUs at 60 FPS, multi-hour uninterrupted rendering, and cloud/account synchronization.

### 13/11/2026 — Reproducible E2E rerun and GPU caveat

- `npm run test:e2e` from the actual Git working tree (Playwright Core v1.58.2, Chrome, isolated Win11-181 localhost :5487) **PASS exit 0** with `success:true`, `errorCount:0`:
  - 13:15 → 18:45 auto-saved; browser reload restores 18:45.
  - Empty Meadow + real House click adds 1 building; autosave stores the map and new building; browser reload restores exactly 1.
  - Another house + real Undo/Redo: 2 → 1 → 2 buildings.
  - Deliberately corrupt autosave in **fresh separate browser context**: app still boots with WebGL2 and detects invalid data.
- An earlier rerun repeatedly reloaded WebGL in the same context and had a Chrome headless process close at the fourth reload on WIN11-181 (62 Chrome processes, ~2.4 GiB free RAM). The final reproducible QA script runs the corrupted-save case in a fresh context to avoid compounding software-renderer memory pressure.
- A separate Chrome/ANGLE D3D11 attempt on Intel UHD 620 did **not** qualify as passing: WebGL context creation was blocked/lost by that browser at startup. No GPU FPS claim is made for this autosave feature. Existing previous hardware performance benchmarks are separately recorded in this file.
- Automated repo checks: `npm run build` PASS; `npm test` **94/94 PASS**; `npm audit --audit-level=moderate` **0 vulnerabilities**; syntax check and `git diff --check` PASS.
- CI uses no GitHub Actions; the browser test is reproducible locally via `npm run test:e2e` with `GAME_URL`, `QA_RESULTS_DIR` and optional `CHROME_BIN`.

### 14/11/2026 — final production E2E stability correction
- Production currently at Git commit `d456e2add6501ec21b7cdf2c7b91695d45592946`; public URL `https://glade.qs3d.site/`.
- Previous long E2E reused a software-rendered Chrome instance too many times; at the last reload it closed. This was a QA runner reliability problem, not evidence that user data had been lost.
- The E2E script now **closes the first Chrome process and starts a fresh Chrome process** to validate corrupt-storage recovery. This avoids cross-context GPU resource exhaustion.
- On public HTTPS, `npm run test:e2e` with the corrected script produced **`success:true`, `errorCount:0`** with actual pointer builds and reloads: clock autosave at 18:45, clock restoration, 0→1 cottage, saved map `empty-meadow`, cottage restoration, Undo/Redo 2→1→2, corrupted-save detection and safe fallback.
- Two `/cdn-cgi/rum` requests returned `net::ERR_ABORTED` during navigation; recorded as `analyticsAborts:2` and excluded from *game network* failures by precise URL+error matching only. Other failed requests remain test failures.
- Public E2E record: `C:\ProgramData\QS3D\GladeDemo\pr9-public-e2e\qa-autosave-gameplay.json`.
- Same game code; this release contains ONLY reproducible QA improvements. The original implementation's 94/94 unit tests and real browser save/restore are separately validated.

## 14/11/2026 — Independent saved scenes for each map (data-loss prevention)

Previous v1 autosave tracked only the last selected scene. Selecting a different preset and returning would lose structures made on the first map. Fixed by writing both the backward-compatible latest-scene storage key and a separate namespaced saved-scene key for every preset, preserving user creations across map switches. The first read on startup still honors existing version-1 autosaves, which are migrated when saved again.

- Save current map synchronously before switching to another map; restore the selected map's saved architecture, heightfield, weather and time if present, then establish a fresh per-map undo baseline.
- Avoid applying stale asynchronous scene data when a user switches quickly between presets.
- New **Đặt lại** control next to map selector asks for confirmation. Cancel leaves all data; confirm resets *only the active map*. Other map slots are not touched.
- If a map's checkpoint is damaged, don't silently replace the raw damaged record with a default scene. User can still import their portable JSON export.
- Per-slot storage keys validate IDs (no traversal or prototype names); invalid or unsupported records fail safely. Existing Export/Import JSON and manual graphics tier preferences remain unchanged.
- Guide updated in Vietnamese with saving and reset behavior.

**WIN11-181 QA and testing:**
- `npm test` **99/99 PASS**, `npm run build` PASS, `git diff --check` PASS.
- `npm run test:e2e:slots` on isolated localhost port 5487 using Chromium/SwiftShader and real UI pointer events: exit code **0**, `success: true`, `errorCount: 0`.
- Live UI E2E actions:
  1. Save island time 09:15, island buildings=1.
  2. Switch to Empty Meadow, build a house by real canvas click: count 0→1 and own slot written.
  3. Switch back to island: time 09:15 and island buildings=1 restored.
  4. Switch back to meadow: new house still present (count=1).
  5. Click Reset and dismiss confirm: house remains.
  6. Click Reset and accept: only meadow cleared (count=0); island 09:15 backup untouched.
  7. Reload browser: meadow stays reset and selected; switch back to island: 09:15 and one original house still present.
- Local QA evidence `C:\ProgramData\QS3D\GladeDemo\pr10-perpreset\qa-multislot.json`.
- Existing autosave E2E, JSON transfer, HTTP security checks and other production services remain intact. This does not imply cross-device cloud synchronization or universal physical mobile compatibility.

## 14/11/2026 — Quota-safe map switching and crash-consistent recovery

Observed risk in the existing code: when localStorage quota/permissions failed, `SceneAutosave.flush()` silently cleared its pending snapshot, and map switching proceeded unconditionally; user's newly built structures could vanish. A second risk: updating the latest-scene pointer before the per-map slot could leave the latest pointer referencing a scene that did not actually persist.

**Fixes**:
- Per-map record is written **before** updating the legacy latest-scene record. If either write fails, the in-memory pending checkpoint is retained for retry and the error is surfaced rather than being hidden.
- Scene selection is prevented on a failed flush until the user explicitly acknowledges the data-loss risk; cancelling restores the map selector and leaves the buildings/editable scene untouched. Users are instructed to Export JSON as a portable backup.
- Even when the browser denies storage entirely, a pending in-memory change is kept long enough to warn before switching.
- Startup chooses the **newest valid timestamped checkpoint** among the legacy latest-scene key and known per-map slots. This recovers a saved newer slot if storage quota interrupted the legacy latest-pointer update. Old v1 saves remain supported.
- Stale asynchronous preset-restore failures are prevented from cancelling the current map's save by checking a scene load generation counter.
- A healthy map slot absent in storage clears stale errors from an unrelated quota failure, preventing false corruption warnings.
- A separate pure preset switch guard exposes the precise accept/cancel behavior for deterministic testing.

**Local WIN11-181 QA**: `npm test` **111/111 PASS** (new quota-denial, atomic-pointer-order, retry, corrupt-slot, newer-slot recovery, guard confirmation tests); `npm run build` PASS, `git diff --check` PASS.
- Reproducible browser scenario included as `npm run test:e2e:quota` under `tests/e2e/storage-quota-gameplay.mjs`, with actual mouse-house placement, artificial quota denial, confirmation cancellation and restoration test.
- **Browser E2E not certified in this turn.** Existing headless Chrome launch on WIN11-181 exited unexpectedly (resource/session limits), and attaching Playwright via CDP closed the test context during navigation. Direct Private Commander browser navigation to staging worked but page text evaluation timed out; this automation's tab was restored to `https://example.com/`. DESKTOP-PHA1S90 remained disconnected. This is an explicit QA coverage gap, not a gameplay PASS.
- No GitHub Actions used; no changes to Session 2, unrelated QS3D services or production tunnel during development.

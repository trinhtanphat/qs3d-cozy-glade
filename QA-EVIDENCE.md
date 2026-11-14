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

## 14/11/2026 — QS3D Studio Scene Library (all-map backup/restore)

This release adds the Vietnamese **Thư viện** button to the editor toolbar, opening an accessible, scrollable backup dialog listing all five game maps, saved status, building/path counts and timestamps.

Portable qs3d-cozy-glade-library v1 archive contains one validated JSON scene per saved map plus the **current live scene**, including edits not yet captured by autosave debounce. Downloads remain local and are not uploaded to any server. Import validates every included scene using the existing HistoryManager (type limits, entity counts, typed-array bounds and dangerous-key rejection) before any browser storage mutation.

Import writes all included per-map records and then the active-map pointer. If any write fails due quota/storage permission, applied writes are rolled back wherever browser storage permits; if rollback fails, the interface warns explicitly. Unlisted maps remain unchanged. Import requires user confirmation and a successful import reloads the game. Old version-1 local scene saves remain readable.

- npm test: **121/121 PASS**, including 10 new SceneLibraryArchive tests for multi-scene round trips, unsaved live snapshot, malformed and polluted archives, size caps, rollback on slot/pointer failures, and corrupt slot handling.
- npm run build PASS, git diff --check PASS.
- npm audit --omit=dev --audit-level=moderate: **0 vulnerabilities**.
- Real Playwright E2E on isolated local QA origin (port 5487): build a house in Empty Meadow; open 5-map library; download a real archive (~670 KB) containing two maps; change time to 22:15; import previous backup and verify restoration of Island 08:15 and Meadow house; reject a malformed archive without changing stored data; resize browser to 390px and ensure dialog fits with no horizontal page overflow. Result **success:true, errorCount:0**.
- Reproducible E2E: npm run test:e2e:library. Evidence: C:\ProgramData\QS3D\GladeDemo\pr12-library\qa-scene-library.json. Final E2E revision also validates reopening Thư viện at 390px by scrolling the toolbar button, and saves scene-library-mobile.jpg; that last subtest should be separately checked before claiming PASS.
- This is browser-local backup, **not cloud synchronization**. Transfer the downloaded JSON manually to other devices. No modification to Win11 Session 2, unrelated QS3D sites/tunnels or GitHub Actions.

### 14/11/2026 — Final end-to-end acceptance on shared Session 0 Chrome

Chrome 157 via Playwright connectOverCDP used a separate browser context, leaving pre-existing tabs intact. On the isolated staging game at http://127.0.0.1:5487/ the full reproducible npm run test:e2e:library flow finished with **success:true, errorCount:0**, including:
- 5 library map cards (2 with current/saved data).
- Building one house using actual mouse clicks in Empty Meadow.
- Real JSON download (670,488 bytes) containing 2 scenes and the currently edited Island at 08:15.
- Changing Island to 22:15; restoring downloaded JSON by file input + confirmation; verifying Island restored to 08:15 and the Meadow house remained.
- Submitting an invalid archive and verifying rejection with **no saved-localStorage mutation** after pending autosave completed.
- Resizing to 390x844; dialog bounds [12px,378px], page width=390px (no overflow).
- Closing library, scrolling horizontally to toolbar Thư viện button, clicking it and confirming the dialog reopens; JPEG snapshot captured.
- Evidence JSON: C:\ProgramData\QS3D\GladeDemo\pr12-library-cdp\qa-scene-library.json
- Mobile screenshot: C:\ProgramData\QS3D\GladeDemo\pr12-library-cdp\scene-library-mobile.jpg

The isolated QA Node process was stopped after its final success report. Shared Chrome/Session 0 remained alive and Session 2 was not touched.

## 14/11/2026 — Autosave visibility, failure warning and one-click retry

Previous releases protected per-map saves and quota failures, but the editor did not disclose whether a change was pending, written or failed. This PR adds a compact, accessible, always-visible status next to the map selector:
- Chưa lưu: no successful checkpoint for the current editor session.
- Đang lưu: unsaved changes scheduled for browser-local save.
- Đã lưu lúc HH:MM: the localStorage slot and latest-scene pointer were written successfully.
- Lỗi lưu: the real storage or serialization step failed. A visible Thử lại button retries the pending scene; when blocked storage remains blocked it continues to show Lỗi lưu. User can export portable JSON instead.

Autosave status notifications use an optional observer invoked inside a fault boundary so HUD errors cannot make storage persistence fail. Explicit retry attempts the pending in-memory snapshot rather than inventing success. Clearing an old timer when storage becomes unavailable prevents stale callbacks. The view uses aria-live polite and skips repeated writes of identical text to reduce screen-reader noise. On a blocked localStorage or corrupt boot checkpoint the indicator shows an error instead of suggesting a healthy save.

Evidence:
- WIN11-181 isolated QA: npm test **126/126 PASS** (5 new status/failure/retry and faulty-observer tests), npm run build PASS, git diff --check PASS, npm audit --audit-level=moderate **0 vulnerabilities**.
- Playwright E2E on localhost QA :5487 (Chrome 157, separate Session 0 CDP context): **success:true, errorCount:0**. Verified actual save at time=18.75, artificial QuotaExceededError left the old time=18.75 and revealed Thử lại, retry while denied stayed Lỗi lưu, restoring storage then retry wrote new time=21.75 and hid the error action. At viewport 390x844 the status chip remained reachable (left=219, right=325.58; docWidth=viewport=390).
- QA JSON evidence: C:\ProgramData\QS3D\GladeDemo\pr13-autosave-qa\autosave-status-e2e.json.
- Isolated QA Node process exited, shared CDP Chrome survived; Session 2, other projects, tunnels were not touched.
- Secondary hardware check: DESKTOP-PHA1S90 Intel UHD Graphics 620 (driver 31.0.101.2141) Chrome 390x844 loaded production HTTP 200 but failed to reach the game-ready sentinel within 65 seconds (existing mini-gpu script exit code 1). This hardware result is **NOT PASS**; no reboot/network reset or changes to the Intel machine were made. Physical iOS/Android and longer endurance are not certified.

## 14/11/2026 — GPU hardware acceptance recovered; issue #14 closed

Issue https://github.com/trinhtanphat/qs3d-cozy-glade/issues/14 had logged one public Intel UHD 620 / D3D11 game-ready timeout (HTTP 200 but loading overlay did not clear in the earlier 65-second attempt). Follow-up remote access to PHA was recovered safely without reboot, Wi-Fi reset, tunnel modifications or closing browser tabs.

Two subsequent **independent real hardware QA** runs on DESKTOP-PHA1S90 against https://glade.qs3d.site/ passed, both exited 0:
1. Bounded diagnostic derived from the existing hardware script: actual WebGL2 context, game initialized, loading overlay class is-hidden, Intel UHD Graphics 620 ANGLE Direct3D11 driver path, 390x844 viewport (internal canvas 331x717 with DPR 0.85), 36 FPS, Eco preset, 125 draw calls, 531803 triangles and 3000 grass instances.
2. Completely unmodified prior mini-gpu.cjs: actual Intel UHD 620 ANGLE Direct3D11 renderer, WebGL2 ready, 34 FPS before / 37 FPS after Eco activation, 125 draw calls, about 531547 triangles, exit 0.

Archived JSON proof copies on PHA:
- C:\ProgramData\QS3D\GladeGPUQA\intel-uhd620-proof-20261114-run1.json — SHA256 87BDB777B89A46AC26BB3890ABD2122DD100F2203ECEEFF6ECD0B07A50135943
- C:\ProgramData\QS3D\GladeGPUQA\intel-uhd620-proof-20261114-run2.json — SHA256 0D3A7CB879F422ECB3E522053E92B4300837DE1BFA2307604EFCA61609E19EC1

A new portable **local-only** hardware smoke script tests/e2e/hardware-gpu-smoke.cjs and HOWTO tests/e2e/HARDWARE-GPU-QA.md were added for future reproducibility (no GitHub Actions). The script verifies WebGL2, non-software hardware renderer, actual scene draw calls and triangle geometry, Eco graphics preset and minimum FPS across 1–3 bounded hardware runs, recording diagnostic JSON for future failures.

Acceptance: Intel UHD 620 / ANGLE D3D11 Eco **hardware smoke recovered PASS, 2/2**. Still not certified: physical iPhone/Android hardware, every possible GPU and multi-hour load endurance.

### 14/11/2026 — Correction: reproducibility exposed aggressive Chrome-flag instability

After the two passing historical hardware smoke runs above, a new reproducible hardware harness with --ignore-gpu-blocklist and --disable-software-rasterizer produced a mixed outcome on the same Intel UHD 620 / D3D11 device: **1/2**. The failed run received HTTP 200 but THREE.WebGLRenderer could not create a WebGL2 context because Chromium reported "Web page caused context loss and was blocked"; the second run rendered successfully at 34 FPS. This result reopened GitHub issue #14, overturning the earlier broad claim that the timeout was fully resolved.

An A/B variant with conservative Chrome flags (still requiring exact Intel D3D11 hardware identity, explicitly rejecting software rendering) subsequently **PASS 2/2** at 17 FPS and 23 FPS. The repository GPU smoke harness was updated to use those conservative flags and to stop promptly when the game displays an initialization error. Evidence on PHA:
- Aggressive: C:\ProgramData\QS3D\GladeGPUQA\pr15-intel-repeat\gpu-hardware-smoke.json — 1/2 PASS, overall FAIL.
- Conservative: C:\ProgramData\QS3D\GladeGPUQA\pr15-safe-flags\gpu-hardware-smoke.json — 2/2 PASS, overall PASS.

This is an operational correction to GPU QA launch flags, not a release of new gameplay code. Independent repeat on the final committed script must be checked before claiming that exact revision PASS. Do not claim universal GPU/physical-phone or long-run 100% certification.

### Final checked-in harness acceptance — 14 November 2026

The canonical conservative-flags script at Git commit cb810cf94835c0dd6d76d81568a25b97fdd5abed was downloaded verbatim to DESKTOP-PHA1S90, and the SHA-256 matched its checked-in counterpart: E079C0ED139A0E91E7D52DED113F480E36E6D6372A7DCFC2B5752A648CCDC6FE.

Three consecutive hardware checks against https://glade.qs3d.site/ then exited 0 with **GPU_HARDWARE_ACCEPTANCE=PASS RUNS=3**. All three used real Intel UHD Graphics 620 (ANGLE Direct3D11) WebGL2 rather than SwiftShader, loading overlay hidden and actual Eco scene rendering:
- Run 1: 31 FPS, 125 draw calls, 530675 triangles; no page or network errors.
- Run 2: 31 FPS, 125 draw calls, 529307 triangles; no page or network errors.
- Run 3: 34 FPS, 125 draw calls, 529867 triangles; no page or network errors.

Local artifact: C:\ProgramData\QS3D\GladeGPUQA\pr15-final-3run\gpu-hardware-smoke.json, SHA-256 **F486788188093C30A9A458BB263F3B72B04BAAE85904A65CB8527FCFEFAADEBA**. The Intel machine was not rebooted; its boot time remained 14 Nov 2026 14:20:27, with about 3.1 GiB RAM available after completion. The earlier conservative-flags A/B run also passed 2/2, for **5/5 consecutive conservative-flags hardware successes** across those two batches.

Acceptance is limited to Intel UHD 620, Chrome 157 / ANGLE D3D11, Eco preset and 390x844 emulated mobile viewport. Stress runs using aggressive GPU overrides can still trigger Chromium's context-blocking guard; don't use those overrides as the default acceptance profile. This does not prove every real mobile GPU or many-hour operational endurance.

## 14/11/2026 — Graceful WebGL2 context loss and safe scene recovery

The game previously displayed a static error on renderer initialization failure and had no deliberate recovery path for a GPU context lost during an active editing session. This change adds a user-controlled WebGL recovery screen, with no background reload loop or hidden loss of editing state.

- If WebGL2 initialization fails, show a visible Vietnamese Thử lại đồ họa button.
- If the browser fires webglcontextlost while a scene is active, call preventDefault, flush pending browser-local autosave if possible, stop the render loop and show a clear error with Thử lại đồ họa and Tải bản thiết kế dự phòng.
- Emergency JSON export serializes the current live scene even if localStorage is full, without GPU or network.
- Clicking Retry persists pending edits; when storage is blocked, browser confirmation is required before risking unsaved edits. Cancel preserves scene and backup UI. Successful persistence then allows an explicit reload to rebuild WebGL resources and restore the saved map.
- A webglcontextrestored event never blindly resumes custom postprocessing resources in an unsafe state; explicit reload remains available.
- Accessible buttons and viewport-constrained styles at 390px.

**Local QA on WIN11-181:** npm test **132/132 PASS** (six new recovery unit tests), npm run build PASS, git diff --check PASS. Playwright in separate Chrome 157 CDP context on isolated port 5487: **success:true, errorCount:0**. E2E creates a cottage by mouse in Empty Meadow, waits for autosave, changes time to 22.25, injects a *synthetic webglcontextlost browser event* (UI test without forcing actual GPU failure), and injects storage quota denial. Recovery screen appears; canceling reload preserves the unsaved edit; emergency JSON download contains one house and time=22.25 (330,747 bytes). After storage resumes, explicit retry reloads exactly once, restoring the house and time. At 390px the layout fits with no overflow. Local evidence: C:\ProgramData\QS3D\GladeDemo\pr16-graphics-recovery\webgl-recovery-e2e.json and recovered-webgl-design.json. Reproducible: npm run test:e2e:graphics-recovery. This validates recovery flow under *simulated* context loss, not physical GPU restoration across every driver.

**Critical environment warning:** On 14 Nov 2026, DESKTOP-PHA1S90 independently rebooted abnormally at about 17:04 local time. Windows System log shows Kernel-Power Event 41, EventLog 6008 and WHEA Logger 17 PCIe Root Port corrected errors. Hardware stability is a separate unresolved issue. No further GPU stress, reboot, Wi-Fi reset or driver changes were performed during this QA. Physical iOS/Android devices and multi-hour hardware endurance remain unverified. Earlier Intel UHD 620 smoke PASS is not comprehensive host stability proof.

No modification to WIN11-181 Session 2, other QS3D apps, production tunnel or GitHub Actions.

## 14/11/2026 — 3-minute isolated browser endurance QA (production)

A reusable, **browser-context-only** endurance script was added at tests/e2e/scene-endurance.mjs with instructions in tests/e2e/BROWSER-ENDURANCE-QA.md. It runs with npm run test:e2e:endurance and accepts GAME_URL, CHROME_CDP_URL, QA_DURATION_MS (30s–30m), QA_SAMPLE_MS (5s–60s) and QA_RESULTS_DIR. It never uses GitHub Actions or writes to production backend; test scene saves are isolated to a throwaway browser context.

**Actual production URL acceptance on WIN11-181 using separate Chrome 157 CDP context: PASS (exit code 0).**
- Production URL: https://glade.qs3d.site/; request HTTP 200.
- Created a real cottage using mouse clicks in Empty Meadow, changed time to 11:15 and verified browser-local autosave before starting the timer.
- **180 seconds / 12 samples** every 15 seconds: the game remained ready, no WebGL context lost, 1 cottage remained, preset remained Empty Meadow, autosave remained saved, 110 draw calls and ~466111 triangles in the test context, no page exceptions or failed network requests.
- Browser JavaScript heap across samples: **62.12–68.22 MiB**, no upward runaway in this bounded interval.
- WIN11-181 browser used a software-backed rendering path; **FPS=4 for this machine**, not a measurement of Intel GPU hardware or the player's device. This is a reliability test, not a hardware-performance endorsement.
- After 180 seconds, checked the local save and reloaded exactly once: same 1 cottage, time 11.25, no lost context. **success:true**, 0 page errors, 0 failed network requests.
- Evidence: C:\ProgramData\QS3D\GladeDemo\pr18-browser-endurance\scene-endurance.json, SHA256 **6C6D9A8CC10C6AE1E0136081C33D68FC012CD0E6485FC2C8B02EF7307D60F1A9**.
- Only new Chrome QA context was closed, existing Session 0 Chrome/157.0.8103.51 survived; Session 2, other QS3D sites, production tunnel and PHA services were not touched.

**Separate hardware-host reliability:** Read-only diagnostics on DESKTOP-PHA1S90 found at least **four** Kernel-Power 41 and matching EventLog 6008 pairs on 14 Nov 2026 (approximately 06:03, 14:20, 15:33, 17:04 local). Repeated WHEA 17 names root port 0:1C:5 (Intel 9D15); PnP location-path mapping shows Qualcomm QCA9377 802.11ac Wi-Fi is attached at PCIROOT(0)#PCI(1C05)#PCI(0000). This narrows the PCIe link where corrected errors are occurring, **but does not prove Wi-Fi caused the abnormal power losses**. No reboot, Wi-Fi reset, PCIe changes or new GPU stress attempts performed. Follow-up issue #17 remains open pending safe host-level diagnosis. This browser endurance result **does not certify physical iOS/Android phones, Intel GPU endurance or multi-hour server uptime**.

## 14/11/2026 20:14 VN — PHA host instability escalated; GPU QA safety gate

Read-only system inspection of DESKTOP-PHA1S90 found the host **rebooted unexpectedly again** at approximately 20:10:53 VN. Latest Kernel-Power Event 41 and EventLog 6008 appeared at 20:11. At least FIVE separate unclean restarts occurred during 14 Nov (~06:03, 14:20, 15:33, 17:04, 20:11). The most recent Event 41 reported BugcheckCode=0, no system minidump today; some earlier Event 41 records had SleepInProgress 6/1, suggesting power/sleep transition investigation is warranted but not establishing root cause.

Read-only logs showed 375 corrected WHEA 17 events in an approximately seven-hour window and 50 in the ten minutes after the latest reboot. Repeated WHEA records identify PCI 0:1C:5 Intel root port 9D15, mapped through PnP location path PCIROOT(0)#PCI(1C05) to Qualcomm QCA9377 wireless adapter. Qualcomm Wi-Fi remained Up at the time of the check. This demonstrates an unreliable PCIe link, but it cannot determine what caused the unclean restarts.

**Preventive code**: tests/e2e/gpu-host-safety.cjs now performs read-only Windows System event/uptime inspection and the hardware smoke script refuses to launch ANY Chrome GPU test when there was an unclean reboot in 24 hours, uptime < 120 min, >=5 WHEA 17 entries in the last hour, or unavailable/malformed evidence. Blocked status is exit code 3 and records structured hostSafety evidence and zero GPU runs; it is never counted as PASS. No override is offered over unstable remote Wi-Fi. The inspection makes no OS configuration changes.

QA on WIN11-181: npm test **140/140 PASS** (8 new safety tests) and Node syntax checks PASS. PHA Windows host must be observed in read-only mode; no driver changes, reboot, BIOS edits, Wi-Fi reset, GPU stress or power plan modifications were attempted. Existing game production at 26ff028d remained HTTP 200, Git clean and served independently.

Because this is a safety harness change only, it does not fix PHA hardware. Issue #17 remains OPEN and requires physical or out-of-band investigation; physical hardware long-run certification is not possible on this currently unstable machine.

### PHA real-device safety-gate acceptance (14 Nov 2026 ~20:24 VN)

The checked-in SHA256-verified GPU safety module and integrated GPU harness were separately downloaded from branch commit 5d06f2ded6dc4baa2c5478ac46e09b33e9de5a58 to DESKTOP-PHA1S90. Module SHA256: 5EBFBD1CF898A633EF48672472A8CA2ECF2ADF588D40AD7823228BBB45237BF7; harness SHA256: 1805F0679236E4C97ECB118F3EAD0AA5968E4CD700757830F04F61D9FFD14A54. Standalone read-only check returned safe:false, uptime 13 min, 5 Kernel-Power 41, 5 EventLog 6008, 86 WHEA17/hour.

The full integrated harness then exited with EXPECTED code 3 (GPU_HOST_PREFLIGHT_BLOCKED), emitted NO_GPU_BROWSER_LAUNCHED, JSON runs empty, at uptime 13.4 min, 5 unclean restarts and 88 WHEA17/hour. Evidence path: C:\ProgramData\QS3D\GladeGPUQA\host-guard-check-20261114\gpu-hardware-smoke.json. SHA256: F6C918157F5E6CD2915B1A8D6FF9C513976C6333E1FB13AE6B0D89852504B54D. This is PASS for the preventative safety gate, NOT a GPU renderer PASS or a fix for hardware root cause. No Chrome or GPU run launched. Host issue #17 remains OPEN.

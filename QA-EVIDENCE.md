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

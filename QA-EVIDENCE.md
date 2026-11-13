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

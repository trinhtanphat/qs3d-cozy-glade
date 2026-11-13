# QS3D Island QA and release record — 2026-11-13

## Reproducible local unit tests
Command: npm test
Result: **4 passed, 0 failed**.
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

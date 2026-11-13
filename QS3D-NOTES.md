# QS3D Cozy Glade — deploy & attribution

A browser-based Three.js/WebGL2 3D construction sandbox based on FireTable/tiny-glade (MIT, copyright 2026 FireTable). Upstream remains available at https://github.com/FireTable/tiny-glade and its original LICENSE is preserved.

## Runtime
Run npm ci && npm run build for a reproducible source build, then node server.mjs to serve at 127.0.0.1:5486. Cloudflare Tunnel publishes glade.qs3d.site, with hostname routing managed separately in C:\ProgramData\QS3D\GladeDemo\cloudflared.yml. Tunnel credentials and local configuration are deliberately excluded from this Git repository.

## Smoke test
- GET / returns HTML and /dist/glade.js, /dist/glade.css, /qs3d-guide.js return HTTP 200.
- GET /healthz returns JSON ok:true.
- /play/ also serves the game.
- Unknown paths return 404 and .git / dotfiles return 403.
- Launch a real browser and confirm HUD, 3D canvas, pointer interactions and WebGL2 load without console errors.

## Safety
The demo has no login backend and stores saves on the client or through exported JSON. Do not put API keys or cloudflared credential files in this repository. Existing QS3D production services are not modified.

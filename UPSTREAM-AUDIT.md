# Full Git fork and provenance audit — 2026-11-13

## Source remote
- Upstream: https://github.com/FireTable/tiny-glade
- Upstream HEAD: refs/heads/main
- Upstream main SHA: 3b7b2d817354a4bab5b782df68d03b1bedc122e9
- Published upstream branch heads: 1 (main)
- Upstream tags: 0
- Advertised refs: HEAD + refs/heads/main (2).
- Commits reachable from upstream main: 3.
- Local source checkout: git rev-parse --is-shallow-repository returned false.

## Genuine GitHub fork
- https://github.com/trinhtanphat/qs3d-tiny-glade-upstream
- GitHub API: fork=true; parent=FireTable/tiny-glade; default_branch=main.
- Fork main SHA: 3b7b2d817354a4bab5b782df68d03b1bedc122e9.
- One branch and no tags are available upstream; the fork covers all Git branches, tags and ancestor commits at audit time.

## Customized game repo
- https://github.com/trinhtanphat/qs3d-cozy-glade
- Main: QS3D customization, descended from upstream main.
- upstream-main: separate preserved exact SHA 3b7b2d8.
- Development happens in feat/qs3d-island-20261113 local worktree before merging to main.

## Future full-source synchronization
1. git fetch --prune origin '+refs/heads/*:refs/remotes/origin/*' '+refs/tags/*:refs/tags/*'
2. Compare remote branch and tag lists via git ls-remote --heads --tags on upstream and fork.
3. Update the preserved source ref without overwriting customized main.
4. Test on isolated QA then merge/deploy, keeping a rollback SHA.

This verifies all public Git branches/tags/history, not separately exported issue trackers, pull request discussions, organizational settings or third-party assets outside Git. GitHub fork metadata does not automatically clone those resources.

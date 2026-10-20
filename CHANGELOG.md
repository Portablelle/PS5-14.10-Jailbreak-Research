# Changelog

## 2026-10-20 — CVE-2026-43720 Canvas getContext UAF confirmed on device

- `docs/bugs/canvas-getcontext-uaf.md`: writeup rebuilt from upstream fix
  `040ef6e21ffa` (WebKit Bugzilla 313175, Safari 26.5.2). Root cause: missing
  `m_context` re-check after settings dictionary conversion in
  `HTMLCanvasElement::getContext()` / `OffscreenCanvas::getContext()` —
  dictionary getters re-enter `getContext()`, the outer call overwrites
  `m_context` and destroys the inner context while its JS wrapper lives.
- `tools/remote-loader/fa-canvas-uaf.js` (VCAN-): device probe. Runs 1-3:
  deterministic crash at first stale-wrapper use on both reachable branches
  ('2d' via `desynchronized`, bitmaprenderer via `alpha`); bidirectional
  aliased read/write 4/4 via same-class reclaim (`ident=sprayN`,
  `WRITETHRU hitN`, `READTHRU true`, no crash). Logs:
  `results/beacon-logs/vcan-run{1,2,3}.txt`.
- `tools/remote-loader/fa-canvas-fake.js` (VCFK-): stage-2 probe. The State
  lives in `Vector<State, 1>` (inline capacity) inside the context;
  `save()` is deferred (`++m_unrealizedSaveCount`), one state-modifying
  setter realizes exactly one append — an out-of-line `2*sizeof(State)`
  FastMalloc buffer that the context destructor frees. AB spray reclaims
  it: `lineWidth` write-through into a JS view + `setLineDash` stores a
  fresh `Vector<double>` header (heap pointer) in the same view — leak
  path with no fake vtable and no `m_canvas` deref risk.
- Fingerprint (4th console): `offscreen=false bitmaprenderer=true webgl=false`;
  this build converts only `desynchronized` from
  `CanvasRenderingContext2DSettings`.

## 2026-10-20 — host kit fixes (PRs #2, #3, #4 applied)

- PR #2: GET probe beacons persisted to host-beacons.log (204, no-cache).
- PR #3: DNS answers match the question (A/ANY only; AAAA/HTTPS get
  NOERROR + empty answer per RFC 4074).
- PR #4: strict Host checks before dispatch (POSTs from other hosts no
  longer logged); request logging tolerates pre-header parse errors.
- Offline suites: `test_host.py`, `test_dns.py`, `test_host_policy.py`
  (30/30 pass).

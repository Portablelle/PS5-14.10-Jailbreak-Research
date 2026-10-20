# CanvasRenderingContext UAF via reentrant getContext() (CVE-2026-43720)

**Status:** Unpatched in WK-1400 (PS5 14.10). Rebuilt from upstream fix commit; device probe prepared.
**CVE:** CVE-2026-43720 (WebKit Bugzilla 313175, rdar://175164594)
**Upstream:** Patched in commit `040ef6e21ffa` (Safari 26.5.2, June 2026). Also fixed for `OffscreenCanvas::getContext()` in the same commit.
**Credit:** Gia Bui (@yabeow, Calif.io), Josef Korbel (Citadelo).

## Bug

`HTMLCanvasElement::getContext()` checks `m_context` at the top, then calls
`convert<IDLDictionary<CanvasRenderingContext2DSettings>>()` on the settings
argument. Dictionary conversion invokes JS property getters, which can re-enter
`getContext()` on the same canvas and assign `m_context`. The outer call then
proceeds to `createContext2d()` / `createContextWebGL()` /
`createContextBitmapRenderer()`, which overwrites `m_context` with a new
`unique_ptr`, **destroying the inner context while its JS wrapper is still
alive**.

`CanvasRenderingContext` forwards `ref()`/`deref()` to its owning `CanvasBase`,
so the JS wrapper's ref does not keep the context alive. Any use of the stale
wrapper after the overwrite operates on freed memory, and on GC sweep the
wrapper's `deref()` reads `m_canvas` from a freed `this` — use-after-free.

The pre-fix code shape (top-of-function `m_context` check, then dictionary
conversion, then `createContext*()` with `ASSERT(!m_context)` compiled out in
release builds) is long-standing in WebKit and is the shape the WK-1400 vendor
tree carries. The upstream fix (June 2026) post-dates the vendor drop by
years, so PS5 14.10 is vulnerable by construction. `OffscreenCanvas::getContext()`
has the identical missing re-check.

## Trigger

```js
let canvas = document.createElement("canvas");
let innerCtx;
let outerCtx = canvas.getContext("2d", {
    get colorSpace() { innerCtx = canvas.getContext("2d"); return "srgb"; },
    get alpha() { return true; },
});
// innerCtx now wraps freed C++ memory; outerCtx is the live replacement.
```

The inner `getContext()` (no settings argument, so no nested dictionary
conversion) runs synchronously inside the getter, creates the first 2D context
and assigns `m_context`. When the getter returns, the outer call runs
`createContext2d()`, whose `m_context = CanvasRenderingContext2D::create(...)`
move-assignment destroys that first context. `innerCtx` still points at it.

Upstream regression test: `LayoutTests/fast/canvas/canvas-getContext-reentrant.html`
(added by the fix commit).

## Call Chain

1. JS calls `canvas.getContext('2d', settings)`.
2. `HTMLCanvasElement::getContext()` — `m_context` is null, no early return.
3. `convert<IDLDictionary<CanvasRenderingContext2DSettings>>()` reads
   `settings.colorSpace` — attacker getter runs synchronously.
4. Getter calls `canvas.getContext('2d')` — inner call: `m_context` still
   null, empty dictionary conversion (no JS), `createContext2d()` assigns
   `m_context` = inner context, returns it. `innerCtx` holds its wrapper.
5. Getter returns `"srgb"`. Conversion finishes.
6. Outer call proceeds to `createContext2d()` — `m_context = create(...)`
   destroys the inner context (unique_ptr overwrite). Wrapper in `innerCtx`
   now dangles.
7. Any `innerCtx` method/property use dereferences freed memory; on GC sweep
   the wrapper's `deref()` reads `this->m_canvas` from the freed object.

## Fix (Upstream)

Commit `040ef6e21ffa` re-checks `m_context` after dictionary conversion in all
four type branches of `HTMLCanvasElement::getContext()` and in
`OffscreenCanvas::getContext()`, returning the existing context when a
re-entrant call already set it. It also upgrades the `ASSERT(!m_context)` in
the four `createContext*()` methods to `ASSERT_WITH_SECURITY_IMPLICATION`.

## UAF Target and Exploitation Path

The freed object is a `CanvasRenderingContext2D` (or the OffscreenCanvas
equivalent) on the FastMalloc heap:

1. **Same-class reclaim:** the first `getContext('2d')` on a fresh spray canvas
   is the most likely allocation to reuse the freed slot (LIFO free list). The
   stale wrapper then aliases a live context of another canvas — reads and
   writes through `innerCtx` are visible through the spray context
   (bidirectional aliased read/write, no crash needed).
2. **Cross-class reclaim:** an ArrayBuffer backing store of the right size
   class fills the slot with controlled bytes; `innerCtx` method calls then
   dispatch through attacker-controlled state (`m_canvas`, `m_state`).
3. **Sweep deref:** dropping the wrapper and forcing GC runs `deref()` on the
   freed object — with a garbage `m_canvas` this is a wild refcount decrement.
4. PS5 environment favors all three: Gigacage disabled (WebCore and JSC
   share FastMalloc), freed memory stays mapped (stale reads often return
   intact values — a silent-survival trap the probe must account for), and
   security assertions are compiled out.

## Source Locations (upstream shape; WK-1400 carries the pre-fix version)

- `Source/WebCore/html/HTMLCanvasElement.cpp` — `getContext()`: missing
  post-conversion `m_context` re-check (all four type branches).
- `Source/WebCore/html/HTMLCanvasElement.cpp` — `createContext2d()`,
  `createContextWebGL()`, `createContextBitmapRenderer()`,
  `createContextWebGPU()`: `ASSERT(!m_context)` compiled out on release.
- `Source/WebCore/html/OffscreenCanvas.cpp` — `getContext()`: same missing
  re-check.
- `Source/WebCore/html/CanvasRenderingContext.h` — `ref()/deref()` forwarded
  to `m_canvas` (the wrapper keeps the canvas, not the context, alive).

## PS5 Requirements

- **Canvas 2D:** Available (confirmed in V399). WebGL is NOT available on the
  guide browser, so only the `2d` and (if exposed) `bitmaprenderer` branches
  are reachable; `bitmaprenderer` needs the `ImageBitmapRenderingContextSettings`
  dictionary (`alpha` member).
- **OffscreenCanvas:** availability to fingerprint on device (Safari 17.0-era
  engines usually expose it).
- **Dictionary getter reentrancy:** standard IDL conversion, no new API needed.
- **GC forcing:** no `GCController` on device — use allocation pressure plus
  FinalizationRegistry (both confirmed available in V399).

## Device Test

Prepared as `fa-canvas-uaf.js` (beacon prefix `VCAN-`). Phases:

- **Fingerprint:** OffscreenCanvas / bitmaprenderer / webgl availability.
- **Control:** trigger-shaped call without reentrancy (baseline), naming the
  dictionary members this build actually converts.
- **R1:** bare double-create; keep wrapper, touch freed object, string churn.
- **R2:** double-create + immediate same-class spray (200 canvases with 2D
  contexts); identity check `innerCtx.canvas === sprayCanvas[k]` and
  bidirectional write-through check (`lineWidth` / `fillStyle`). Non-crashing
  aliasing evidence.
- **R3:** double-create + ArrayBuffer spray across size classes (0x41 fill) +
  heavy touch of the stale wrapper.
- **R4:** double-create + garbage spray + drop wrapper + GC pressure — sweep
  deref crash oracle.

Survival of R1 alone proves nothing (freed memory stays mapped on PS5);
R2 aliasing or an R3/R4 crash is the positive signal.

## Device Run 1 (2026-10-20, first console)

Beacon log: `results/beacon-logs/vcan-run1.txt` (excerpt in
`tools/remote-loader/host-beacons.log`, 11:55-11:56).

- **Fingerprint:** `offscreen=false br=true webgl=false` — no OffscreenCanvas
  on the guide browser; ImageBitmapRenderingContext available; no WebGL
  (confirms V399).
- **Control:** `fired=1` — this build converts only ONE
  `CanvasRenderingContext2DSettings` member (not `colorSpace`).
- **R1-R4 ('2d'):** `inner=false` on all rounds — v1 attached the reentrancy
  to `colorSpace`, which this build does not convert. All '2d' rounds were
  no-ops. R4's GC pressure (3 x 30 rounds, ~240 MB transient) survived.
- **BR (bitmaprenderer, alpha member):** `inner=true outer=true same=false` —
  **double-create succeeded; the inner ImageBitmapRenderingContext was freed.**
- **Crash:** beacons stop immediately after `BR-1-RESULT`. The next operation
  is `inner.canvas` — the first use of the freed context. No `BR-1-CANVAS`,
  no `SURVIVED`, no `DONE-ALL-SURVIVED`. The webview died on that read
  (the "not enough free memory" notification is this console's generic
  webview-death marker, per third-console precedent).

**Conclusion: the UAF is live on device** — the bitmaprenderer branch
crashes at the first stale-wrapper dereference. Run 1 was not a clean
confirmation (heavy prior phases; single round), so v2 re-runs with:

1. **Proxy-based settings** for the '2d' trigger — the first member this
   build converts (whatever its name) fires the reentrant call; the CONTROL
   round names the members to close the question.
2. `via=` beacons recording which member triggered each double-create.
3. Same plan order (BR last) so a full clean pass precedes the crash oracle.

## Device Run 2 (2026-10-20, v2 probe, fresh webview)

Log: `results/beacon-logs/vcan-run2.txt`.

- **CONTROL:** `fired=[desynchronized]` — this build converts exactly one
  `CanvasRenderingContext2DSettings` member: `desynchronized`.
- **R1-1-CREATE:** `inner=true outer=true same=false via=desynchronized` —
  the Proxy trigger fired inside the conversion, the inner 2D context was
  created, and the outer call destroyed it. **Double-create confirmed on
  the '2d' branch.**
- **R1-1-REPLAY:** `true` — `m_context` now holds the outer context.
- **Crash:** beacons stop here. The next statement is `r.inner.canvas` —
  the first use of the freed context, on a webview **less than one second
  old** with no prior memory pressure (fingerprint + control + one trigger
  only). The '2d' branch dies exactly like the bitmaprenderer branch did in
  run 1.

**CVE-2026-43720 is confirmed on PS5 14.10, both reachable branches, with a
deterministic crash at the first stale-wrapper dereference.** This is the
first device-confirmed memory-corruption primitive in this research
(MetadataTable is DoS-only; the stream bugs are builtin-wall blocked;
CSSFontFace never crashed on three consoles).

## Device Run 3 (2026-10-20, v3 probe — BIDIRECTIONAL ALIASED R/W CONFIRMED)

Log: `results/beacon-logs/vcan-run3.txt`. Fresh webview, full plan.

**R2 aliasing — 4/4 rounds:**

```
R2-1-RESULT inner=true outer=true via=desynchronized ident=spray5
R2-1-WRITETHRU hit5   R2-1-READTHRU true   R2-1-SURVIVED
R2-2-RESULT ... ident=spray15
R2-2-WRITETHRU hit15  R2-2-READTHRU true   R2-2-SURVIVED
R2-3-RESULT ... ident=spray3
R2-3-WRITETHRU hit3   R2-3-READTHRU true   R2-3-SURVIVED
R2-4-RESULT ... ident=spray12
R2-4-WRITETHRU hit12  R2-4-READTHRU true   R2-4-SURVIVED
```

- `ident=sprayN`: `inner.canvas` on the stale wrapper returns SPRAY canvas N —
  the freed `CanvasRenderingContext2D` slot was reclaimed by a live spray
  context in **every round**. The reclaim index (3, 5, 12, 15) varies:
  roughly 3-15 same-class allocations interleave per `getContext('2d')`
  chain; 200 spray contexts always cover it.
- `WRITETHRU hitN`: `inner.lineWidth = 66.5` through the stale wrapper is
  visible on spray context N. `READTHRU true`: `42.5` written on spray
  context N is visible through the stale wrapper. **Bidirectional aliased
  read/write, no crash.**
- R1 mechanics (no touch): double-create + replay OK, survived.
- **R3-1:** after the 0x41 ArrayBuffer spray, the webview died at the first
  stale touch (last beacon `R3-1-SPRAY-DONE n=475`, no `R3-1-CANVAS`).

The R2/R3 contrast is the complete UAF characterization on device: the same
stale-wrapper touch **survives and aliases** when the freed slot holds a
live context, and **dies** when it holds attacker bytes.

## Status after runs 1-3

- Stage 1 (WebKit memory corruption): **CONFIRMED** — deterministic UAF, both
  reachable branches ('2d' via `desynchronized`, 'bitmaprenderer' via
  `alpha`), trigger reaches from plain web content on the guide browser.
- Stage 2 entry (aliased R/W): **CONFIRMED** — reliable same-class reclaim
  (4/4), stale wrapper fully functional against the reclaimed live context.
- Next (v4): replace the live-context reclaim with **controlled data** in the
  freed slot — needs the exact FastMalloc size class of
  `CanvasRenderingContext2D` (compute from the vendor source drop), then a
  crafted fake context (vtable / `m_state` / `m_canvas`) gives type
  confusion toward addrof/fakeobj and arbitrary read/write (Gigacage is
  disabled on PS5).

## Size-class note (v4 run 1, 2026-10-20)

The v4 probe (2*sizeof(State) spray at 384-512) died silently before its
first result beacon: **`sizeof(CanvasRenderingContext2D)` itself sits in the
384-512 range** — inline `Vector<State,1>` storage included. Spraying that
range reclaims the CONTEXT slot (zero-filled: `m_canvas` = `m_buffer` =
NULL) and the first stale read SEGVs. Consequences:

- The context slot must stay freed-but-mapped and untouched; the state
  buffer must be sprayed at a size class far away. v5 uses 8 realized
  saves (~16*sizeof(State), ~3.4KB) and sprays 1.8-4.4KB.
- The 384-512 context class retroactively explains v3 run 2 (death after
  two ~400-byte beacon XHRs reclaimed the slot) and v3 R3 (0x41 AB spray
  covering the class).
- Any future grooming near 384-512 must expect CanvasRenderingContext2D,
  XMLHttpRequest-sized WebCore objects, and small ABs to share the class.

## Full characterization (runs 4-8, 2026-10-20)

Logs: `results/beacon-logs/vcan-runs4-8.txt`.

- **v5/v7 (silent single-task): the bare stale read is FATAL even with a
  zero-allocation window.** v7's D1 control (plain double-create + one
  `lineWidth` read, everything in one synchronous JS task, beacons buffered
  and flushed after) died before its flush. The freed context block is not
  readable — granule decommit (MADV_FREE) or allocator damage beyond the
  freelist word. "Freed memory stays mapped" does not hold for the ~400-byte
  context class.
- **v6: no OffscreenCanvas in workers either** (`VCW-W-FP offscreen=false`)
  — the bug is only reachable via HTMLCanvasElement / bitmaprenderer on the
  main thread.
- **v8 G1-G3: the getter-side ops are SAFE** — `save()`xN + a state setter
  inside the dictionary conversion (realized saves grow the out-of-line
  state stack) plus the destruction of the grown context all survive
  (`G3-SURVIVED`, outer fills fine). v5's killer was the post-free read.
- **Structural verdict:** state-stack exfiltration through the stale wrapper
  is impossible by construction — the Vector header lives in the freed
  context block (unreadable), and any live context reclaiming the slot
  points its own Vector at its own buffer. The marker/pointer bytes in a
  freed state buffer cannot be read back: every JS-visible reclaim writes
  its own content (ArrayBuffers zero-fill).
- **v8 W: `ident=spray5 wrapperSame=false writethru=hit5` — DUAL DISTINCT
  JS WRAPPERS for one C++ CanvasRenderingContext2D.** The wrapper cache did
  NOT reuse the stale wrapper: `inner !== sprayCtxs[5]`, yet writes through
  one are visible through the other (`writethru=hit5`). This is a genuine
  two-wrapper alias, not a cache triviality.
- **v8 L1: the wild-wrapper lottery's first ticket crashed** (diverse-object
  reclaim + `W1.canvas` wild read) — expected oracle behavior; needs reruns.

## Status and the remaining paths (after runs 1-8)

- Stage 1 (WebKit memory corruption): **CONFIRMED** — deterministic UAF,
  both branches, JS-only trigger, getter-side state-stack growth safe.
- Stage 2 candidates, in order of strength:
  1. **Second-order UAF with GC-controlled timing:** keep the stale wrapper
     W1 of a double-create whose slot was reclaimed by a live spray context
     (dual-wrapper state). Drop the spray wrapper + its canvas, force GC —
     the canvas destructor destroys the context exactly when we choose, and
     W1 goes stale again over a slot we can immediately reclaim with a
     planned object. The first free is engine-timed (noisy); the second
     free is attacker-timed.
  2. **Wild-wrapper lottery** (v8 L): reclaim the slot with non-context
     WebCore objects; `W1.canvas` wraps the pointer at the `m_canvas`
     offset as an HTMLCanvasElement; `.width`/`.height` read 8 bytes of
     semi-random live heap memory. Noisy leak path, one ticket per run.
  3. The direct fake-context route stays blocked on the leak (any valid
     fake needs a real pointer, and the only pointer sources are unreadable
     freed blocks).

# Probe Index

All probes tested on PS5 14.10. Results from device beacon logs.

## MetadataTable Overflow Probes

### Early Discovery (probes/metadata-overflow/early/)

| Probe | Purpose | Device Result |
|-------|---------|---------------|
| p141 | First overflow test (wrong stride 96) | SIGSEGV, wraps to 715MB |
| p142 | Correct stride 112 | COMPILED-OK, then crash on call |
| p143 | Worker witness, targets below metadata | No corruption (forward only) |
| p144 | Bait-and-switch, targets above metadata | Forward write confirmed |

### Heap Groom (probes/metadata-overflow/heap-groom/)

| Probe | Purpose | Device Result |
|-------|---------|---------------|
| p146 | Worker .length polling | All 14 strings corrupted, .length=81400 |
| p147 | Substring views for data read | m_data8 intact, reads original 0x41 |
| p148 | Main-thread targets | 14 JSCORRUPT, 0 LEAKED, StringImpl intact |
| p148b | Sweep leak | Crash, no data |
| p149 | FinalizationRegistry + ArrayBuffer targets | OOM before completion |
| p149-diagnostic | Read after compile, before call | ZERO corruption (proves compile-time) |
| p150 | Throwing callback | OOB read crashes, garbage dereference |

### Extraction (probes/metadata-overflow/extraction/)

| Probe | Purpose | Device Result |
|-------|---------|---------------|
| p155 | Lean worker | Compilation testing |
| p156 | Bait-and-switch groom | Forward write layout |
| p157 | ArrayBuffer extract | Zero-init blocks stale reads |
| p158 | Throw extract | OOB crash |
| p159 | Gradient fill strings | Crash, rope cells break heap layout |
| p160 | Relapse CVE test | All patched |
| p161 | Fast gradient | Crash |
| p162 | Deep scan to 2000 bytes | Partial data |

### Sweep Survival (probes/sweep-survival/)

| Probe | Purpose | Device Result |
|-------|---------|---------------|
| p150g | 400 targets + 2000 padding, call function | CALLING then silence (240MB VM not enough) |
| p150i | 3 waves of 5000 buffers, free between | OOM at BUILD (MADV_FREE pressure) |
| p150j | Single wave 8000 buffers | OOM at BUILD (764MB too much) |
| p150k | 5000 buffers + heavy GC | OOM at BUILD (477MB + blob = too much) |

## Recon Probes (probes/recon/)

### p161a: FontFace API Recon (15 tests)

| Test | What | Result |
|------|------|--------|
| T0 | API availability | FontFace YES, document.fonts YES |
| T1 | Valid font load + add | LOADED-OK, ADD-OK |
| T2 | numTables=0 | RangeError (JS build, not parser) |
| T3 | numTables=0xFFFF | NetworkError (rejected) |
| T4 | Table offset past EOF | NetworkError |
| T5 | Table length=0 | NetworkError |
| T6 | Table length=0xFFFFFFFF | NetworkError |
| T7 | CFF (OTTO) signature | NetworkError |
| T8 | WOFF totalSfntSize=0xFFFFFFFF | NetworkError |
| T9 | WOFF maxTables | NetworkError |
| T10 | maxp numGlyphs=0xFFFF | OK (accepted) |
| T11 | unitsPerEm=0 + canvas draw | OK, DRAW-OK |
| T12 | Canvas pixel count | 311 non-zero pixels |
| T13 | ArrayBuffer source | OK (direct buffer loading works) |
| T14 | WOFF2 signature | NetworkError (not supported) |

### p161b: Image Decoder Recon (19 tests)

| Test | What | Result |
|------|------|--------|
| FMT-PNG | PNG 1x1 | OK |
| FMT-JPEG | JPEG 1x1 | OK |
| FMT-GIF | GIF 1x1 | OK |
| FMT-WEBP | WebP 1x1 | OK |
| FMT-BMP | BMP 1x1 | OK |
| FMT-SVG | SVG 1x1 | OK |
| FMT-ICO | ICO 1x1 | OK |
| CIB | createImageBitmap | Available |
| PNG-0x0 | Zero dimension | FAIL (rejected) |
| PNG-HUGE | 65535x65535 | FAIL (rejected) |
| PNG-BADCLR | Invalid color type | FAIL (rejected) |
| PNG-TRUNC | Truncated IDAT | OK (loaded) |
| PNG-32K | 32768x32768 | FAIL (rejected) |
| PNG-INTMAX | INT_MAX width | FAIL (rejected) |
| CANVAS | drawImage + getImageData | OK |
| CIB-WEBP | createImageBitmap from WebP | OK |
| CIB-CROP | CIB with crop rect | OK |
| CIB-HUGECROP | CIB with oversized crop | OK (clamped to 1x1) |

## RAB Probes

| Probe | Purpose | Device Result |
|-------|---------|---------------|
| p160a | RAB byteLength inversion | TypeErrors on all stale-read paths |
| p160b | RAB full sink audit | All sinks correctly guarded |
| p160c | RAB grow + fetch | Stale view reads extra zeros, no leak |

## Font Parser Fuzz (Session 11)

| Probe | Purpose | Device Result |
|-------|---------|---------------|
| p180a | 12 TrueType corruption variants via FontFace API | T5 LOCA-OOB LOADED, T7 DIR-PAST-EOF LOADED, T6/T11 REJECTED |
| p182 | Font loca OOB read at controlled offsets | Deployed, awaiting results |

## ClonedArguments UAF (Session 11)

| Probe | Purpose | Device Result |
|-------|---------|---------------|
| p221 | ClonedArgs butterfly UAF via Proxy trap | Proxy fires (beef0001), butterfly not freed |
| p243 | Heap feng shui: spray + butterfly adjacency | Holes read zeros, no spray reclaim (wrong allocator) |
| p246 | Butterfly reclaim via JSArray spray (same allocator) | Deployed, awaiting results |

## CSSFontFace UAF (Session 11)

| Probe | Purpose | Device Result |
|-------|---------|---------------|
| p170 | CSSFontFace UAF via WOFF2 font cycling | Network errors (PS5 rejects WOFF2) |
| p175 | CSSFontFace UAF via TTF from ArrayBuffer | Deployed, awaiting results |

## CanvasRenderingContext UAF (CVE-2026-43720)

Probe `fa-canvas-uaf.js` (beacon prefix `VCAN-`), writeup `docs/bugs/canvas-getcontext-uaf.md`.
Upstream fix `040ef6e21ffa` (Safari 26.5.2) — absent from WK-1400 by construction.

| Phase | What | Positive signal |
|-------|------|-----------------|
| FP | OffscreenCanvas / bitmaprenderer / webgl fingerprint | info |
| CONTROL | settings getters, no reentrancy | baseline |
| R1 x5 | bare double-create + touch + churn | mechanics only (survival proves nothing: freed memory stays mapped) |
| R2 x3 | same-class reclaim: 200 spray 2D contexts; innerCtx.canvas identity + lineWidth/fillStyle write-through | `IDENT=sprayK` + `WRITETHRU=hitK` + `READTHRU=true` = bidirectional aliased R/W |
| R3 x3 | ArrayBuffer reclaim (0x41) across size classes + heavy touch | crash or `CANVAS=other` |
| R4 x3 | garbage reclaim + drop wrapper + GC pressure | no `R4-i-SURVIVED` after `GC-DONE` = sweep deref crash |
| OS | OffscreenCanvas double-create variant | crash or freed-but-mapped reads |
| BR | bitmaprenderer double-create variant | crash or freed-but-mapped reads |

**Run 1 (2026-10-20):** `offscreen=false br=true webgl=false`. CONTROL
`fired=1` — only one settings member converted (not `colorSpace`), so the
v1 '2d' reentrancy never fired (R1-R4 no-ops). **BR round: double-create
succeeded (`inner=true outer=true same=false`) and the webview DIED at the
first stale-wrapper use** — beacons stop after `BR-1-RESULT`, `inner.canvas`
never beacons. UAF live on device; v2 adds a Proxy-based trigger (member-name
independent). Log: `results/beacon-logs/vcan-run1.txt`.

**Run 2 (2026-10-20, v2, fresh webview):** `CONTROL fired=[desynchronized]`;
`R1-1-CREATE inner=true outer=true same=false via=desynchronized` —
double-create confirmed on the '2d' branch — then death at `r.inner.canvas`
(R1-1-REPLAY is the last beacon), on a page less than one second old with no
memory pressure. **CVE-2026-43720 confirmed, both branches, deterministic
crash at first stale use.** v3 reorders: R2 aliasing round first (spray
makes the touch safe), crash oracles (R1T/BR) last. Log:
`results/beacon-logs/vcan-run2.txt`.

**Run 3 (2026-10-20, v3): BIDIRECTIONAL ALIASED R/W CONFIRMED, 4/4.**
Every R2 round: `ident=sprayN` (N in 3/5/12/15 — reclaim always lands, index
varies), `WRITETHRU hitN`, `READTHRU true`, SURVIVED. R1 mechanics OK. R3-1
(0x41 garbage reclaim) died at the first stale touch. The R2/R3 contrast is
the complete on-device UAF characterization: same touch, live-context reclaim
= survives + aliases, attacker-byte reclaim = death. **Stage 1 confirmed,
Stage 2 aliased read/write confirmed.** Log: `results/beacon-logs/vcan-run3.txt`.

**Runs 4-8 (2026-10-20, stage-2 campaign):** v4 (384-512 spray) and v5
(~16xState spray) died silently — the 384-512 range is the context class
itself. v6: no OffscreenCanvas in workers. v7: the bare stale read is fatal
even in a fully silent single-task window — the freed context block is not
readable (granule decommit); state-stack exfiltration through the stale
wrapper is structurally closed. v8: getter-side saves+marker are SAFE
(G1-G3), **W: `wrapperSame=false` — dual distinct JS wrappers for one C++
context with bidirectional write-through** (the strongest remaining
primitive), wild-wrapper lottery L1 crashed (first ticket). Consolidated
logs: `results/beacon-logs/vcan-runs4-8.txt`.


## Relapse Probes (probes/relapse-test/)

| Probe | Purpose | Device Result |
|-------|---------|---------------|
| p160 | Full Relapse CVE test suite | All patched on 14.10 |

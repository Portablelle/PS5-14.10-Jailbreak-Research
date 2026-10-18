# Strategy

## Current Phase: Broad Surface Audit

MetadataTable overflow (CVE-2026-64784) is confirmed real but blocked by the 4.29GB sweep. We are now auditing every reachable WebCore and JSC surface for a new entry point.

## Approach

### Phase 1: Recon probes on device (done)
Fingerprint the PS5 WebView. Determine which APIs exist, which formats are supported, which parser paths are reachable from JavaScript.

Results:
- p163: Full API availability matrix
- p161a: FontFace API recon (15 tests)
- p161b: Image decoder recon (19 tests)

### Phase 2: Source audit (in progress)
Run dedicated audit agents against every WebCore module in WebKit-1200. One agent per attack surface. Each agent reads the actual source code and reports specific bugs with file paths and line numbers.

Currently auditing 17+ surfaces including font parsers, image decoders, DOM mutation, SVG, XML parsing, Workers, Canvas, CSS layout, HTML parser, WebSocket, editing commands, Shadow DOM, Fetch/URL, CSS animations, and WeakRef/FinalizationRegistry.

### Phase 3: Targeted fuzzing probes
For each source finding rated PLAUSIBLE or CONFIRMED, build a probe that triggers the specific code path on device. Ship as JS, load via beacon server, read results from beacon log.

### Phase 4: Exploitation
Once a surviving bug is found on device:
1. Determine primitive type (read, write, type confusion, UAF)
2. Build ASLR leak if needed
3. Build arbitrary R/W primitive
4. Achieve WebKit process code execution
5. Pivot to kernel

## What We Need

The ideal bug for PS5 14.10 exploitation:
- Reachable from JavaScript in the PS5 WebView
- Does not require JIT, WASM, SharedArrayBuffer, or WebGL
- Produces a controlled memory corruption (not just a crash)
- Corruption is readable from JavaScript (not write-only)
- Survives: the bug should not crash the process before JS regains control

## Known Constraints

| Constraint | Impact |
|------------|--------|
| No JIT | Cannot corrupt JIT code, no RWX pages |
| No WASM | Cannot use WASM memory for heap layout control |
| No SharedArrayBuffer | Cannot race between threads |
| No WebGL | Cannot use GPU buffer tricks |
| Gigacage disabled | ArrayBuffer backing stores share heap with JSC internals (helps exploitation) |
| FreeBSD kernel | Different syscall table, different kernel exploit surface |
| 16KB pages | Page alignment differs from x86 (4KB) |
| LLInt only | All bytecode execution through interpreter loop |
| ~500MB usable memory | OOM kills process above this |

## Why Gigacage Being Disabled Matters

On standard WebKit (macOS/Linux), Gigacage isolates ArrayBuffer backing stores into a separate virtual address region. This prevents JSC heap corruption from reaching ArrayBuffer data and vice versa. On PS5 (FreeBSD), Gigacage is disabled (`GIGACAGE_ENABLED 0`), which means ArrayBuffer backing stores route through the same FastMalloc heap as JSC objects. Any heap corruption primitive that can reach FastMalloc allocations can potentially corrupt ArrayBuffer contents readable from JavaScript.

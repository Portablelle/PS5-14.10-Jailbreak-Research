# PS5 14.10 Jailbreak Research

WebKit jailbreak research for PlayStation 5 firmware 14.10. All data comes from probes that ran on the actual console.

> **Disclaimer:** Authorized security research on personally owned hardware. For educational and research purposes only.

## Target

Validated on device (p163).

| Property | Value |
|----------|-------|
| Platform | PlayStation 5 |
| Firmware | 14.10 |
| Browser | Safari 17.0 / AppleWebKit 605.1.15 |
| JIT | Disabled (LLInt only) |
| Cores | 4 |
| Display | 1920x1080 |

**Available:** Workers, WebSocket, fetch, SubtleCrypto, Canvas 2D, ReadableStream, ResizableArrayBuffer, WeakRef, FinalizationRegistry, Proxy, BigInt, structuredClone

**Not available:** WebAssembly, SharedArrayBuffer, WebGL, WebAudio, IndexedDB, ServiceWorker

## Source Reference

The PS5 WebKit binary is not publicly available. We use the open source **WebKit-1200** snapshot (December 2023) as a reference for structure layouts, function internals, and allocator behavior. This is the closest matching version to the Safari 17.0 / AppleWebKit 605.1.15 engine on the console. All assumptions from source are then validated on device with probes.

## The Bug

JavaScriptCore Bug 317632. `UnlinkedMetadataTable::finalize()` uses an `unsigned` accumulator with no overflow check.

```
38,348,816 calls x 112 bytes = 4,295,067,392
uint32 wraps to 100,096 bytes
```

Allocator reserves 100KB. The interpreter writes 4.29GB forward into heap.

## Probes

84+ probes across 10 sessions. See [docs/PROBE_INDEX.md](docs/PROBE_INDEX.md) for the full list with device results.

| Probe | What it does | Result |
|-------|-------------|--------|
| p141 | Overflow test (wrong stride) | SIGSEGV |
| p142 | Correct stride (112) | Overflow triggers |
| p143 | Targets before buffer | No corruption, sweep is forward only |
| p144 | Bait and switch | Forward write confirmed |
| p146 | Worker .length polling | **All 14 strings corrupted, .length = 81400** |
| p147, p148 | Substring and main thread views | StringImpl data intact, JSString.m_fiber corrupted |
| p149g | Read after compile, before call | Overflow is at compile time, not call time |
| p150 | Throwing callback | OOB read crashes before callback |
| p150g-k | Sweep survival (5 strategies) | All OOM or crash, sweep is too long |
| p156 | charCodeAt scan | All 0x41, m_data8 points to original buffer |
| p159, p161 | Gradient strings | Crash, rope cells break heap layout |
| p160 | Relapse CVE set | **All patched on 14.10** |
| p160a-c | RAB byteLength inversion | TypeErrors on all stale read paths |
| p161a | FontFace API recon | 15 tests, numGlyphs=0xFFFF accepted, unitsPerEm=0 renders |
| p161b | Image decoder recon | 7 formats work, truncated PNG loads, CIB available |
| p163 | Device fingerprint | Complete |

## Key Findings

1. **MetadataTable integer overflow triggers on device.** Bug 317632. `UnlinkedMetadataTable::finalize()` unsigned accumulator. 38,348,816 call sites wraps to 100,096 bytes. Allocator reserves 100KB, interpreter writes 4.29GB forward.

2. **Bait and switch heap groom controls write target.** Bait strings fill the heap first. Target strings go above them. Free the baits and run GC. Metadata buffer takes a freed bait slot. Sweep goes forward into the targets.

3. **Sweep corrupts JSString objects.** Overwrites `m_fiber` in JSString headers inside MarkedSpace. All 14 targets report `.length = 81400` after the sweep.

4. **StringImpl backing data stays intact.** `charCodeAt` returns original 0x41 because `m_data8` still points to the original buffer. Corruption is in the JSString header, not the character data.

5. **Sweep is too long to survive.** 4.29GB forward write exits mapped virtual memory. Maximum working spray is ~240MB (2400 buffers). 5000+ buffers causes OOM during compilation. Five different strategies tested (p150g through p150k), all fail.

6. **All Relapse WebKit bugs are patched on 14.10.** p160 tested the full set.

7. **Gigacage is disabled on PS5.** ArrayBuffer backing stores share heap with JSC internals. No address space isolation. Significant for any future primitive.

8. **FontFace API is fully reachable.** Font parser accepts numGlyphs=0xFFFF and unitsPerEm=0. CSSFontFace UAF found in source (testing on device).

9. **All 7 image formats supported.** PNG, JPEG, GIF, WebP, BMP, SVG, ICO. Truncated PNG IDAT loads without error.

## How to Use

1. Clone the repo
2. Run `python3 tools/host.py`
3. Edit `tools/fa-v62-huff.html` to pick a probe
4. Open the URL on the PS5 browser
5. Watch the beacon log

## Models Used

This research was built with multiple LLMs working together.

| Model | Role |
|-------|------|
| Claude Opus 4.6 | Primary workhorse. Probes, source analysis, struct layouts, heap modeling, coordination |
| GPT-6.1-Sol | Codex dispatches, verification passes, structure recommendations |
| GPT-6.1-Astra | Flagship analysis (sometimes unavailable) |
| DeepSeek v4.1-Flash | Scene sweep, PUP carving, gap analysis, gadget hunting |
| DeepSeek v4-Pro | Deep analysis tasks |
| GLM 5.3 Flash | Router analysis, verification, cross audit |
| Kimi K3 | Escape sequence analysis, exploit page construction |
| Qwen 3.8 | Architecture ladder synthesis, verification |
| Mimo | Analysis support |

## Progress

90+ probes across 11 sessions over 5 days. Three active exploitation paths under development. 20+ attack surfaces audited.

| Stage | Status |
|-------|--------|
| Bug identification | Done (CVE-2026-64784 + 3 new bugs) |
| Trigger on device | Done |
| Heap grooming | Done |
| JSString corruption | Done |
| Sweep survival | Blocked (4.29GB too long) |
| New bug search | Done (20+ surfaces audited) |
| Font parser OOB read | Testing (loca table offset accepted on device) |
| ClonedArgs butterfly UAF | Testing (JSArray reclaim strategy) |
| CSSFontFace UAF | Testing (TTF ArrayBuffer variant) |
| Arbitrary read/write | Not started |
| WebKit code execution | Not started |
| Kernel exploit | Not started |

## Contact

X: [@Arn0Stride7](https://x.com/Arn0Stride7)

## License

MIT

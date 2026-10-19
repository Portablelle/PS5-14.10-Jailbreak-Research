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

**Available:** Workers, WebSocket, fetch, SubtleCrypto, Canvas 2D, ReadableStream, WritableStream, TransformStream, ResizableArrayBuffer, WeakRef, FinalizationRegistry, Proxy, BigInt, structuredClone, FontFace, Custom Elements, Atomics

**Not available:** WebAssembly, SharedArrayBuffer, WebGL, WebAudio, IndexedDB, ServiceWorker, BYOB streams, WebGPU

## Source Reference

The PS5 WebKit binary is not publicly available. We use two open source snapshots as reference:

- **WebKit-1200** (December 2023) — initial reference, closest to Safari 17.0 / AppleWebKit 605.1.15
- **WebKit-1400** (WK-1400) — primary audit source since Session 11, used for all current source analysis

All assumptions from source are validated on device with probes.

## The Bug

### CVE-2026-43715: CSSFontFace iterateClients UAF

[Full writeup](docs/bugs/cssfontface-uaf.md)

`iterateClients()` in CSSFontFace.cpp copies a WeakHashSet into a `Vector<Ref<Client>>` and then invokes a callback on each client. When `FontFace::fontStateChanged` runs, it resolves `m_loadedPromise`. The promise resolution checks whether the result is a thenable -- if the resolved value has a `.then` property, the engine calls that getter synchronously.

An attacker places a getter on `FontFace.prototype.then` that removes a style element and forces a synchronous layout. This causes a client to be removed from the WeakHashSet while the callback loop is still iterating. The next iteration invokes a callback on the now-disconnected client -- a use-after-free.

```js
Object.defineProperty(FontFace.prototype, 'then', { get() {
    document.getElementById('victim-style').remove();
    document.body.offsetHeight; // force synchronous layout
}, configurable: true });

const face = new FontFace('test', 'url(font.ttf)');
document.fonts.add(face);
face.load();
```

**Status:** Patched in upstream WebKit (commit `5aedb82`). The WK-1400 build on PS5 14.10 does not include this fix. A device test has been deployed and is awaiting crash confirmation.

## Probes

90+ probes across 11+ sessions. See [docs/PROBE_INDEX.md](docs/PROBE_INDEX.md) for the full list with device results.

| Probe | What it does | Result |
|-------|-------------|--------|
| p141 | Overflow test (wrong stride) | SIGSEGV |
| p142 | Correct stride (112) | Overflow triggers |
| p143 | Targets before buffer | No corruption, sweep is forward only |
| p144 | Bait and switch | Forward write confirmed |
| p146 | Worker .length polling | **All 14 strings corrupted, .length = 81400** |
| p147, p148 | Substring and main thread views | StringImpl data intact, JSString.m_fiber corrupted |
| p150g-k | Sweep survival (5 strategies) | All OOM or crash, sweep is too long |
| p160 | Relapse CVE set | **All patched on 14.10** |
| p163 | Device fingerprint | Complete |
| V399 | Full API fingerprint | Version/17.0, no WASM/SAB/BYOB/WebGPU, yes RAB/Atomics/Workers/FontFace/Proxy |
| V445 | CSSFontFace UAF | Deployed, awaiting results |

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

| Stage | Status |
|-------|--------|
| Bug identification | Done |
| 20+ surface audit | Done |
| CSSFontFace UAF (CVE-2026-43715) | Device test deployed |
| Arbitrary read/write | Not started |
| WebKit code execution | Not started |

## Contact

X: [@Arn0Stride7](https://x.com/Arn0Stride7)

## Support

If you want to help keep this research going, contributions go directly into keeping the lights on.

| Method | Address |
|--------|---------|
| PayPal | [paypal.me/arnoldzap](https://paypal.me/arnoldzap) |
| BTC | `bc1qw2lpq8p0cspdk9dlddv6y0wswh6z6svtjjkn73` |
| ETH | `0xfad7D7e182FC77194AB3737130651Ec85958932b` |
| SOL | `BftaLxgQvgn9WN1YXTJePeUPWzJK5whMnFRVQ8EdLzvv` |

All donations will be disclosed and used for AI subscriptions, PS5 and PS4 hardware for jailbreak research, and continuous improvement of this project.

## License

MIT

# Progress Audit

Status of the PS5 14.10 WebKit exploitation research.

## Timeline

| Session | Date | Focus |
|---------|------|-------|
| 1-6 | Oct 15-16 | Bug discovery, stride correction, heap groom, JSString corruption |
| 7-8 | Oct 17 | Extraction attempts, RAB inversion, Relapse testing |
| 9 | Oct 17-18 | Sweep survival testing (p150g-k), MetadataTable declared BLOCKED |
| 10 | Oct 18 | Pivot to new surfaces. Font/image recon. 17+ audit agents deployed |

## Exploit Chain Progress

| Stage | Status | Notes |
|-------|--------|-------|
| Bug identification | Done | CVE-2026-64784 MetadataTable overflow confirmed |
| Trigger on device | Done | p142: COMPILED-OK with N=38,348,816 |
| Heap grooming | Done | Bait-and-switch controls write target |
| JSString corruption | Done | p146: all 14 strings .length=81400 |
| Data extraction | Blocked | Sweep is 4.29GB, too long to survive |
| **New bug search** | **In progress** | 17+ audit agents scanning all WebCore surfaces |
| CSSFontFace UAF | Testing | Source-verified, p170 deployed |
| Arbitrary read/write | Not started | Waiting for exploitable primitive |
| WebKit code execution | Not started | |
| Kernel exploit | Not started | |

## What We Know About the Target

- Firmware 14.10, WebKit-1200 era (Safari 17.0 / AppleWebKit 605.1.15)
- LLInt-only execution (JIT disabled)
- FreeBSD r230171, AMD Zen 2, 16KB pages
- Gigacage disabled (huge for exploitation, ArrayBuffers share heap)
- MADV_FREE keeps virtual mappings after free
- ~500MB usable memory before OOM kills process
- All Relapse CVEs patched

## Probe Count

84+ probes across 10 sessions.

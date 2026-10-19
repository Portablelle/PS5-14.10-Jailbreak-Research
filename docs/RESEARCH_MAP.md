# Research Map

## Active Lead

### CVE-2026-43715 -- CSSFontFace iterateClients UAF

A use-after-free in WebKit's CSSFontFace client iteration. The `iterateClients()` function copies a WeakHashSet into a vector and invokes callbacks on each client. A thenable getter on `FontFace.prototype.then` runs synchronous JavaScript during one of those callbacks, removing a style element and forcing a layout update. This disconnects a client from the set while the loop is still running. The next iteration calls back into the disconnected client -- a use-after-free.

This bug is patched in upstream WebKit. The WK-1400 build on PS5 firmware 14.10 does not include the fix. A device test has been deployed and is awaiting crash confirmation.

See [bugs/cssfontface-uaf.md](bugs/cssfontface-uaf.md) for the full writeup.

## Exhausted Surfaces

Over 20 attack surfaces have been audited across 11+ sessions. All were dead-ended. See [ATTACK_SURFACE.md](ATTACK_SURFACE.md) for the full list.

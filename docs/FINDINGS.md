# Findings

All findings are validated on device (PS5 14.10) or verified against WebKit-1200 source.

## Confirmed Bugs

### 1. MetadataTable Integer Overflow (Bug 317632 / CVE-2026-64784)

`UnlinkedMetadataTable::finalize()` uses an `unsigned` accumulator with no overflow check. With 38,348,816 op_call sites at stride 112, the accumulator wraps from 4,295,067,392 to 100,096. The allocator reserves 100KB. The interpreter writes 4.29GB forward into heap memory.

**Status: BLOCKED.** The overflow triggers and corrupts heap objects, but the 4.29GB forward sweep crashes the process when it exits mapped virtual memory. Maximum working spray is ~240MB (2400 buffers), covering less than 6% of sweep distance. No early exit exists in finishCreation(). See `docs/bugs/metadatatable-overflow.md` for the full writeup.

### 2. JSString Header Corruption (via MetadataTable)

The sweep corrupts JSString.m_fiber in MarkedSpace cells. All 14 target strings report `.length = 81400` after the overflow. StringImpl backing data stays intact (charCodeAt returns original 0x41). The corruption is in the JSString header, not the character data.

Validated: p146, p147, p148 on device.

### 3. Forward Write Directionality (Proven)

finishCreation() sweeps FORWARD only (higher addresses). Targets placed before the metadata buffer are never reached. Bait and switch heap groom (allocate baits, then targets, free baits, trigger overflow) controls where the sweep lands.

Validated: p143 (no corruption when targets below), p144 (corruption when targets above).

### 4. CSSFontFace UAF (Source Verified)

`CSSFontFaceSet::matchingFacesExcludingPreinstalledFonts` (line 381) returns `std::reference_wrapper<CSSFontFace>` (non-owning). The fix changed this to `Ref<CSSFontFace>`. Also `fontLoadEventOccurred()` calls `pump()` and client callbacks without `Ref<CSSFontFace> protectedThis`. Only `timeoutFired()` and `fontLoaded()` have that protection.

**Status: TESTING.** Probe p170 deployed. Awaiting device results.

## Confirmed Dead Ends

### Yarr Regex C3 Position Corruption
1-unit displacement in C3 character class handling always causes match failure. Cannot produce controlled out-of-bounds reads. Verified in source.

### RAB byteLength Inversion
ResizableArrayBuffer has an inverted bounds check that allows conceptual OOB access, but all sink paths (SubtleCrypto, TextDecoder, DataView) throw TypeError before reaching the underlying buffer. Every read/write path correctly re-validates length.

Validated: p160a (TypeErrors on all stale-read paths).

### ClonedArguments propertyCapacity
PreciseAllocation for ClonedArguments has outOfLineCapacity=4 and canRealloc always returns false. Cannot trigger reallocation to create a type confusion.

### Relapse WebKit CVE Set
All known Relapse bugs (prior firmware exploit chain) are patched on 14.10.

Validated: p160 on device.

### Streams API BYOB Reader
BYOB reader ctor/elementSize mismatch is real (acknowledged by FIXME comments in source) but TypedArray constructor bounds checking prevents all OOB paths. Every combination results in RangeError or truncated but in-bounds views.

## Audited Surfaces (No Bugs Found)

| Surface | Agent | Result |
|---------|-------|--------|
| Integer overflows (full JSC) | overflow-hunt | MetadataTable is unique. All other subsystems use Checked<>/RELEASE_ASSERT |
| ASLR leak primitives | aslr-binary-audit | Error.stack has no addresses, ArrayBuffer always zeroed, performance.now() is 1ms resolution |
| MetadataTable alternative strategies | metatbl-alt-strategy | No shortcut for sweep. No early exit, link() safe, destructor safe |
| SerializedScriptValue (structuredClone) | clone-deserialize-audit | Well hardened. No type confusion, no UAF, no uninit memory |
| Streams API + SubtleCrypto | streams-api-audit | BYOB mismatch is real but TypedArray bounds checking blocks all OOB |

## Device Recon Results (Session 10)

### FontFace API (p161a)
FontFace and document.fonts.add work on PS5. Parser rejects most malformed fonts (NetworkError). Two edge cases accepted:
- numGlyphs=0xFFFF (65535) loads without error
- unitsPerEm=0 loads AND renders on canvas (potential div-by-zero in layout math)
- WOFF2 is rejected
- ArrayBuffer source loading works (no data URL needed)

### Image Decoders (p161b)
All 7 formats supported: PNG, JPEG, GIF, WebP, BMP, SVG, ICO. createImageBitmap available. Edge cases:
- Truncated PNG IDAT loads successfully (potential uninit memory read)
- 0x0, 65535x65535, 32768x32768, INT_MAX width all rejected
- CIB huge crop clamped to 1x1

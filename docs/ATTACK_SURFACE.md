# Attack Surface

PS5 14.10 WebView attack surface map. APIs confirmed on device, audit status tracked per surface.

## API Availability

Confirmed via p163 device fingerprint probe.

### Available
| API | Notes |
|-----|-------|
| Workers | Via Blob URL only (no fetch of external scripts) |
| WebSocket | Full support |
| fetch / XHR | Same-origin and local network |
| SubtleCrypto | Full Web Crypto API |
| Canvas 2D | No WebGL |
| SVG | Inline and via Image |
| FontFace | Load from ArrayBuffer or data URL, document.fonts.add works |
| structuredClone | With MessageChannel |
| ReadableStream / WritableStream | Including BYOB readers |
| ResizableArrayBuffer | With grow(), not transfer() |
| WeakRef / FinalizationRegistry | GC callback timing available |
| Proxy / Reflect | Full trap support |
| BigInt | Arithmetic and TypedArray interop |
| eval / Function() | Dynamic code execution |
| Custom Elements | Full v1 API |
| Shadow DOM | Open and closed modes |
| MutationObserver | Attribute, childList, subtree |
| CSS Animations / Transitions | requestAnimationFrame available |
| Blob / File / FileReader | Blob URL creation works |
| URL / URLSearchParams | Full API |
| TextEncoder / TextDecoder | UTF-8 and other encodings |
| createImageBitmap | With crop parameters |
| DOMParser | XML and HTML parsing |
| Performance API | performance.now() at 1ms resolution |
| console | log, warn, error (no remote access) |

### Not Available
| API | Notes |
|-----|-------|
| WebAssembly | Not exposed |
| SharedArrayBuffer | Not exposed (no cross-origin isolation) |
| WebGL / WebGL2 | Context creation fails |
| Web Audio | AudioContext not available |
| IndexedDB | Not exposed |
| ServiceWorker | Not registered |
| XSLT | XSLTProcessor not available |
| Web Notifications | Not available |
| Geolocation | Not available |
| WebRTC | Not available |

## Audit Status

### Fully Audited (No Bugs Found)
- JSC integer overflow patterns (MetadataTable is unique)
- ASLR leak primitives (none in JS-reachable paths)
- SerializedScriptValue / structuredClone
- Streams API + BYOB readers
- RAB byteLength handling (inverted check exists but all sinks guarded)
- Yarr regex engine
- ClonedArguments allocation

### Audited (Bugs Found)
- MetadataTable overflow (real bug, BLOCKED by 4.29GB sweep)
- CSSFontFace UAF (source verified, device test pending)

### Audit In Progress (Session 10)
- Font parsers (WOFF2, CFF, OTF, SVG fonts)
- Image decoders (PNG, JPEG, WebP, GIF)
- DOM mutation + Custom Elements
- JSC deep runtime (Map/Set iterator, BigInt, Proxy, generators)
- SVG processing (filters, use element, animation)
- XML/DOMParser
- Worker lifecycle
- Canvas 2D internals
- CSS layout engine
- HTML tokenizer / tree builder
- WebSocket frame parsing
- Editing commands (execCommand)
- Shadow DOM slot assignment
- Fetch/URL/Compression API
- CSS animation/transition timing
- WeakRef/FinalizationRegistry GC timing

### Not Yet Audited
- Beacon API
- Web Locks API
- Cache API
- History/Navigation API
- IntersectionObserver / ResizeObserver
- CSS custom properties / Houdini (if available)
- Console string formatting internals

# Crash-Corpus Walk — Complete Results (2026-10-20)

644 cases walked to completion (`CORPUS-DONE-643`), ~24 sessions, crash-resume
protocol. Log: `results/beacon-logs/corpus-walk-complete.txt`.

## Killers (BEFORE without GAP)

| Case | Test | Fix / nature | Notes |
|------|------|--------------|-------|
| 147 | `fast/shadow-dom/svg-mpath-removed-from-ancestor-crash` | BZ 265562, fix `580e5844`: `TreeScopeOrderedMap::getElementById` invalid read via `SVGURIReference::targetElementFromIRIString` during mpath removal (treescope mid-update) | **7/7 deterministic** (1 original + 6 crash-loop replays before the cursor fix). Strongest determinism of the day. |
| 152 | `fast/text/partial-text-invalidation-with-first-letter-crash` | [IFC][Partial layout] incorrect invalidation position | 1/1 |
| 154 | `fast/multicol/last-set-crash` | **`WTFCrashWithSecurityImplication` in `RenderFragmentedFlow::removeLineFragmentInfo()`** | 1/1 — WebKit itself flags the invariant as security-relevant |
| 160 | `fast/text/first-letter-partial-invalidation-crash` | [IFC] fallback to full invalidation with first-letter | 1/1 |
| 176 | `fast/block/crash-when-style-and-renderer-invalidated-for-floating-object-element` | BZ 272687 floating-object style+renderer invalidation | 1/1 |
| 217 | `fast/grid/subgrid-inherited-line-names-crash` | [Subgrid] implicitly named lines can be empty | 1/1 |
| 360 | WPT `html/semantics/interactive-elements/the-details-element/details-keyboard-activation` | WPT re-import (BZ 296170); keyboard activation path | 1/1 — trigger needs triage |
| 410 | `svg/custom/referenced-svg-resources-crash-on-slot-removal` | **`TreeScopeOrderedMap::getElementById` via `ReferencedSVGResources::~ReferencedSVGResources`** | 1/1 — **second distinct trigger into the same sink as case 147** |
| 499 | WPT `css/cssom/insertRule-page-detached-grouping-rule-crash` | null deref in `CSSParser::parsePageSelector()` | 1/1, DoS-shaped |
| 504 | `fast/parser/resources/xml-parser-end-detach-frame.xhtml` | null deref in `XMLDocumentParser::end()` | 1/1, DoS-shaped |

## Exploitation ranking

1. **Case 176** (BZ 272687, dup of 272296; fixed by the patch for **BZ 272488**,
   commit `7edad1b0d5e5`, originally landed from the
   `webkit-2024.4-embargoed` branch with WebKit security CC'd) —
   `RenderBlockFlow::rebuildFloatingObjectSetFromIntrudingFloats()` moved the
   old floating objects into a `RendererToFloatInfoMap` keyed by RAW
   `RenderBox*` pointers, compared stale float geometry against the rebuilt
   set, and marked line ranges dirty from it — dangling renderer pointers
   across a layout rebuild. The fix DELETES the whole path. Pure-JS minimal
   trigger (writing-mode + display class flips + a float rebuild);
   **mutation→layout window is attacker-sized**. The strongest remaining
   reclaim candidate of the corpus.
2. **Cases 152/160** (BZ 263019 / 263182) — IFC partial-invalidation computes
   inconsistent damage offsets (first-letter, offset past the last display
   box); downstream OOB-read shapes, fixes at `626ccb56` / `c7356ae7`.
3. **Case 217** (BZ 280068) — subgrid implicitly-named lines can produce an
   EMPTY Vector used downstream (fix `65ecac43`).
4. ~~Cases 147 + 410~~ — `TreeScopeOrderedMap` kills are RELEASE_ASSERT aborts
   on this build (17.0-era `get()` asserts `treeScope == scope`): DoS only.
   Minimal clip-path trigger 3/3 (`fa-sink-battery.js`).
5. ~~Case 154~~ — multicol stale `m_lastSetWorkedOn`: the cache points at a
   MOVED (live) set, not a freed one; the kill needs the heavy CSS +
   `execCommand` immediately at onload (delayed 1.5s → survives; noscript →
   survives; nolayout → survives; `fa-sink3.js`). Assert DoS, nothing to
   reclaim.
6. 499/504 — null derefs, DoS only.

## Session mechanics (for future walks)

- The crash-resume cursor initially replayed killed cases (crash-loop at 147,
  6 deaths); fixed in `host.py` (`next = max(BEFORE ∪ GAP) + 1`, commit
  `aa08b64`).
- Auto-reload between 60-case batches (commit `8445788`) — the walk
  self-drives; only crashes need a manual guide reopen.
- WPT harness files (`/resources/testharness.js`, `testdriver.js`,
  `testdriver-actions.js`, `testharnessreport.js`, `web-animations/testcommon.js`,
  `common/reftest-wait.js`, `fonts/ahem.css`, ...) served from the kit root
  (fetched from `LayoutTests/imported/w3c/web-platform-tests/` — note the extra
  directory level vs. the test-referenced paths). Still missing:
  `js-test-resources/ui-helper.js`, `images/green.png`, `common/blank.html`
  (low traffic).

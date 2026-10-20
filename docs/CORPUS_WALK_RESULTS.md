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

## Exploitation ranking (final, after the sink2/3/4 campaign)

1. ~~**Case 176**~~ (BZ 272687/272296, fixed by the embargoed patch for BZ
   272488, commit `7edad1b0d5e5`) — the stale `RendererToFloatInfoMap`
   (raw `RenderBox*` keys across the float rebuild) is real, and the
   exact-file replicate kills 3/3 with every WINDOW beacon delivered
   (`fa-sink4.js`, `results/beacon-logs/sink4-176.txt`): the
   mutation→layout window exists and sprays run inside it — but all three
   variants (baseline, AB, in-iframe float-element) die identically. The
   dangling renderers are freed INSIDE the deadly layout pass (the rebuild
   invalidates, destroys, then compares the stale map in one operation).
   No JS-controllable reclaim window. Deterministic DoS with a security-
   shaped root cause; a reclaim would need the free to move out of the
   layout pass.
2. **Cases 152/160** (BZ 263019 / 263182) — IFC partial-invalidation computes
   inconsistent damage offsets; downstream OOB-read shapes, fixes at
   `626ccb56` / `c7356ae7`. Unexplored for windows.
3. **Case 217** (BZ 280068) — subgrid empty-Vector downstream use
   (fix `65ecac43`). Unexplored.
4. ~~Cases 147 + 410~~ — `TreeScopeOrderedMap` kills are RELEASE_ASSERT aborts
   on this build: DoS. Minimal clip-path trigger 3/3 (`fa-sink-battery.js`).
5. ~~Case 154~~ — multicol stale `m_lastSetWorkedOn` points at a MOVED (live)
   set; kill needs heavy CSS + `execCommand` at onload exactly (bisected,
   `fa-sink3.js`). Assert DoS.
6. 499/504 — null derefs, DoS only.

## Session conclusion (2026-10-20)

Twelve reproducible kills were confirmed on this console (canvas UAF runs,
event-dispatcher 3/3, ten corpus killers). Every one is either a teardown-tight
UAF (free and use inside one C++ operation: the 1ms RunLoop::Timer callback,
the in-layout float rebuild, the engine-timed canvas slot whose freed block is
unreadable) or an assert/null-deref DoS. The canvas bug (CVE-2026-43720)
remains the best stage-1 primitive — attacker-sized reclaim window, proven 4/4
same-class aliasing — but its pointer exfiltration is structurally closed
without the vendor binary. The realistic next steps: binary analysis
(sizes/offsets/gadgets for a fake that survives), further corpus harvests, or
the IFC/subgrid bugs' windows.

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

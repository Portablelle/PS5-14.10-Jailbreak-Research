# RemoteLayerTreeEventDispatcher RunLoop::Timer UAF (BZ 315533)

**Status:** Unpatched in the PS5 14.10 build. **Confirmed on device: deterministic kill, 3/3 observed deaths (corpus walk 1, walk-1 teardown gap, case-loop iteration 0).**
**Upstream:** fixed in commit `2df698f59386b2ffccd45c7ef28422b69eba8c44` (Aug 2026, Safari branch 7624). WebKit Bugzilla 315533, rdar://177889453.
**Found by:** the crash-corpus replay (case 24 of the 51-test harvest) — the same test was ZigZagBoi1's case 30 (6/6 on their console, PR #55).

## Bug

`RemoteLayerTreeEventDispatcher::scheduleDelayedRenderingUpdateDetectionTimer()`
lazily creates `m_delayedRenderingUpdateDetectionTimer` (a `RunLoop::Timer`)
**on the scrolling thread**, against the scrolling thread's run loop. When the
owning page/popup closes, `~RemoteScrollingCoordinatorProxyMac()` runs on the
**main thread**, calls `invalidate()`, and drops the last reference — destroying
the dispatcher and the timer on the main thread. `CFRunLoopTimerInvalidate()`
does not synchronize with a CFRunLoopTimer callback the scrolling thread's run
loop has already begun dispatching, so the callback reads the freed `TimerBase`
through its raw context pointer — heap-use-after-free in
`RunLoop::TimerBase::start()::$_0::__invoke` on the scrolling thread.

The upstream fix destroys the timer ON the scrolling thread from
`invalidate()` (holding a strong reference across the dispatch), mirroring the
`ThreadedScrollingTree::invalidate()` fix (225114@main).

## Trigger (test shape)

`LayoutTests/fast/scrolling/mac/event-dispatcher-timer-close-crash.html`:
popup with an animated `will-change:transform` div → layer-tree commit →
scrolling-thread display-link registration → **1ms one-shot timer** → popup
closed after two rAFs → main-thread destruction races the in-flight callback.
30 cycles per load. In our iframe runner the kill lands during the
**teardown gap after the iframe's removal** (OK/GAP emitted, then silence) —
the delayed scrolling-thread callback kills the process up to ~300ms after
removal.

## Object layout (WTF RunLoop.h, COCOA_EVENT_LOOP)

```
RunLoop::TimerBase:                RunLoop::Timer (the freed object):
  +0   vptr                          +0   vptr (fired() is VIRTUAL)
  +8   Ref<RunLoop> m_runLoop        +8   m_runLoop (raw ptr)
  +16  ASCIILiteral m_description    +16  m_description (static string ptr)
  +24  RetainPtr<CFRunLoopTimerRef>  +24  m_timer (CF object)
                                     +32  Function<void()> m_function
                                          (lambda: [ThreadSafeWeakPtr weakThis]
                                           { weakThis.get()->...timerFired(); })
```

`fired() { m_function(); }` — the callback's first post-UAF action is a
**virtual dispatch through the freed vptr**, then the WTF::Function's
inline-captured ThreadSafeWeakPtr chain. sizeof(RunLoop::Timer) ≈ 56-64
bytes (FastMalloc 64 class).

## Exploitation assessment

- **PC-control shape:** reclaim the ~64-byte slot with controlled bytes →
  `fired()` dispatches through the attacker vptr → RIP control on the
  **scrolling thread** (a second thread — no JIT needed, ROP/JOP).
- **The window is the problem:** the timer is a **1ms one-shot** — the
  free→use gap is sub-millisecond and kernel-scheduler-dependent. A JS-side
  reclaim cannot reliably land in it. Our three kills prove the *use* always
  follows the free (the natural race works), but not that a spray can interpose.
- **Compared to the canvas bug (CVE-2026-43720):** the canvas gives an
  attacker-sized window (reclaim whenever we want, proven 4/4) but only
  main-thread reads; this bug gives a thread-hijack target but a razor-thin
  window. They complement: canvas = grooming machinery, this = the PC target
  once a heap leak exists (fake Timer + fake vtable).
- Popups: the test opens popups (`window.open`) — whether the guide browser
  allows them determines which code path schedules the timer in the iframe
  runner (the kills happened either way, 3/3).

## Device evidence

- Walk 1 (corpus): death between GAP-24 and BEFORE-25 (the 80ms teardown gap).
- Case-loop: death between C24-GAP-0 and C24-BEFORE-1 (the 300ms gap).
- Walk 2: case 24 not replayed (resume) — no death.
- The signature: OK + GAP emitted for the case, then process death during the
  inter-case gap — a delayed scrolling-thread kill after iframe removal.

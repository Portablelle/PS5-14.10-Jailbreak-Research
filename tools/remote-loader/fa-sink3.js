// fa-sink3 — bisect WHERE case 154 kills: initial layout vs main()
//
// fa-sink2 established: the exact corpus file kills 3/3, but no WINDOW
// beacons fired — the death likely lands during the iframe's INITIAL LAYOUT
// (the universal column-count:6381 CSS takes seconds to lay out) BEFORE
// main() (onload) runs. This probe splits the trigger:
//
//   V1 full       — the exact file (control, known 3/3 kill)
//   V2 noscript   — same DOM + CSS, <script> removed: if this kills, the
//                   trigger is pure CSS+DOM layout (no JS interaction at all)
//   V3 nolayout   — script + DOM, heavy CSS stripped to nothing: if this
//                   kills, the trigger is main()'s execCommand path
//   V4 delayedmain— full file but main() postponed 1500ms after onload: if
//                   the death moves out ~1.5s later, main() is the kill site
//
// All variants inject a main-entry hook (beacon at the first line of main)
// plus the window hook after prepend. Beacon loss during the crash is
// expected; the variants' survival pattern is the signal.
// Crash-resume via localStorage (killed steps skipped).
// Beacon prefix: VS3-
(function() {
  var BASE = location.protocol + '//' + location.host;
  function B(tag, body) {
    try {
      var x = new XMLHttpRequest();
      var u = BASE + '/beacon/VS3-' + tag + '?t=' + Date.now();
      if (body) u += '&d=' + encodeURIComponent(String(body).substring(0, 300));
      x.open('GET', u, true);
      x.send();
    } catch(e) {}
  }

  B('BOOT');

  var TEST_URL = BASE + '/corpus/LayoutTests_fast_multicol_last-set-crash.html';

  function runVariant(name, transform, next) {
    B('V-' + name + '-START');
    var xhr = new XMLHttpRequest();
    xhr.open('GET', TEST_URL + '?t=' + Date.now(), true);
    xhr.onload = function() {
      var src = xhr.responseText;
      src = src.replace('if (window.testRunner)', 'if (false)');
      src = src.replace('function main() {',
        'function main() { if (window.parent && window.parent.__mainHook) window.parent.__mainHook(); ');
      src = src.replace('x23.prepend(x28);',
        'x23.prepend(x28); if (window.parent && window.parent.__sprayHook) window.parent.__sprayHook();');
      src = transform(src);
      var frame = document.createElement('iframe');
      frame.style.cssText = 'width:320px;height:200px';
      document.body.appendChild(frame);
      var doc = frame.contentDocument;
      window.__mainHook = function() { B('V-' + name + '-MAIN'); };
      window.__sprayHook = function() { B('V-' + name + '-WINDOW'); };
      doc.open();
      doc.write(src);
      doc.close();
      var guard = 0;
      var timer = setInterval(function() {
        guard++;
        if (guard > 24) {
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
  }

  var VARIANTS = [
    ['full', function(src) { return src; }],
    ['noscript', function(src) {
      return src.replace(/<script>[\s\S]*<\/script>/, '<script>window.__noscript = true;<\/script>');
    }],
    ['nolayout', function(src) {
      return src.replace(/<style>[\s\S]*<\/style>/, '');
    }],
    ['delayedmain', function(src) {
      return src.replace('window.onload = main;', 'window.onload = function() { setTimeout(main, 1500); };')
                .replace('<body onload="main()">', '<body>');
    }]
  ];

  var STEP_KEY = 'vs3-step-v1';
  var startStep = 0;
  try { startStep = parseInt(localStorage.getItem(STEP_KEY) || '0', 10) || 0; } catch (e) {}
  function saveStep(i) {
    try { localStorage.setItem(STEP_KEY, String(i)); } catch (e) {}
  }

  B('PLAN', 'steps=' + VARIANTS.length + ' from=' + startStep);
  setTimeout(function() {
    // sequential driver with crash-resume
    var idx = startStep;
    function step() {
      var v = VARIANTS[idx];
      if (!v) { B('DONE-ALL-SURVIVED'); return; }
      saveStep(idx + 1);
      runVariant(v[0], v[1], function() { idx++; step(); });
    }
    step();
  }, 200);
})();

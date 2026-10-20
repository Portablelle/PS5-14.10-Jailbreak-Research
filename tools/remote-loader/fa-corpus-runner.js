// fa-corpus-runner — replay public WebKit crash-regression tests on the console
//
// Adapted from ZigZagBoi1's p166-corpus-runner.js (PR #55) for this kit:
//   - cases load in iframes from /corpus/<file> (served from tools/remote-loader/corpus/)
//   - BEFORE-<i> ... OK/ERR/STALL-<i> ... GAP-<i> beacon protocol (the webview's
//     death between BEFORE and GAP names the killer case)
//   - resume: on load, GET /corpus-next (host.py scans host-beacons.log for the
//     highest GAP-<i>) — a corpus walk survives any number of crashes without
//     re-running closed cases. Fallback: ?start=N (default 0).
//   - session tag + monotonic n= counter (this browser double-delivers beacons)
//
// The corpus (51 tests) was harvested with tools/webkit_crash_corpus.py from
// the ZigZagBoi1 repo: crash-fix commits since the Safari 17.0 branch point,
// keeping only tests ADDED by the fix commit. Third-party test content.
//
// Beacon prefix: VCORP-
(function() {
  var BASE = location.protocol + '//' + location.host;

  function param(name, def) {
    var m = new RegExp('[?&]' + name + '=([^&]*)').exec(location.search);
    return m ? decodeURIComponent(m[1]) : def;
  }

  var SESSION = Math.random().toString(36).slice(2, 8);
  var SEQ = 0;

  function B(tag) {
    var url = BASE + '/beacon/VCORP-' + SESSION + '-' + tag + '?t=' + Date.now() + '&n=' + (++SEQ);
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(url)) return;
    } catch (e) {}
    try {
      var x = new XMLHttpRequest();
      x.open('GET', url, true);
      x.send();
    } catch (e) {}
  }

  var count = parseInt(param('count', '60'), 10) || 60;
  var stall = parseInt(param('timeout', '4000'), 10) || 4000;

  var list = null;
  var active = null;

  function advance(i, end) {
    if (i >= end) {
      B('CORPUS-DONE-' + (end - 1));
      return;
    }
    var entry = list[i];
    B('BEFORE-' + i);

    var frame = document.createElement('iframe');
    var token = {};
    var timer = null;
    active = token;

    function finish(kind) {
      if (active !== token) return;
      active = null;
      clearTimeout(timer);
      B(kind + '-' + i + '-' + entry.file.replace(/[^A-Za-z0-9._-]/g, ''));
      try { frame.parentNode.removeChild(frame); } catch (e) {}
      // Emitted after the frame is gone: OK-i without GAP-i means the process
      // died while tearing that case down.
      B('GAP-' + i);
      setTimeout(function() { advance(i + 1, end); }, 80);
    }

    frame.onload = function() { finish('OK'); };
    frame.onerror = function() { finish('ERR'); };
    frame.style.cssText = 'width:320px;height:200px;border:1px solid #ccc';
    frame.src = BASE + '/corpus/' + entry.file;
    document.body.appendChild(frame);

    timer = setTimeout(function() { finish('STALL'); }, stall);
  }

  var listXhr = new XMLHttpRequest();
  listXhr.open('GET', BASE + '/corpus/list.json?t=' + Date.now(), true);
  listXhr.onload = function() {
    try {
      list = JSON.parse(listXhr.responseText);
    } catch (e) {
      B('LIST-BROKEN');
      return;
    }
    var end = Math.min(count, list.length);
    B('BOOT-' + list.length);
    // resume: ask the host where the previous walk stopped
    var curXhr = new XMLHttpRequest();
    curXhr.open('GET', BASE + '/corpus-next?t=' + Date.now(), true);
    curXhr.onload = function() {
      var start = parseInt(param('start', ''), 10);
      if (isNaN(start)) {
        try { start = JSON.parse(curXhr.responseText).next; }
        catch (e) { start = 0; }
      }
      if (start < 0) start = 0;
      if (start >= list.length) {
        B('ALREADY-DONE-' + start);
        return;
      }
      var end2 = Math.min(start + count, list.length);
      B('RESUME-from-' + start + '-to-' + end2);
      advance(start, end2);
    };
    curXhr.onerror = function() {
      var start = parseInt(param('start', '0'), 10) || 0;
      var end2 = Math.min(start + count, list.length);
      B('RESUME-LOCAL-from-' + start + '-to-' + end2);
      advance(start, end2);
    };
    curXhr.send();
  };
  listXhr.onerror = function() { B('LIST-FETCH-FAIL'); };
  listXhr.send();
})();

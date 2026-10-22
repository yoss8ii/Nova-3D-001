/*! printer-anim.js — 3D printing animation (single file, no dependencies)
 *
 * USAGE (put it in any <div> or <p>):
 *   <div data-printer-anim></div>
 *   <script src="printer-anim.js" defer><\/script>
 *
 * Options (attributes on the container, all optional):
 *   data-color="#ffffff"   filament / keychain colour (6-digit hex)
 *   data-bg="transparent"  background colour (default: transparent = the page shows through)
 * Palette = the NOVA 3D logo: white, light grey, sage green (#5D9362), light sage (#A9C8A7).
 * It follows the page theme: light colours on a dark page, greys + green on a light page
 * (reads <html data-theme> or the device's dark mode, live).
 *
 * Manual: PrinterAnim.mount(document.querySelector('#box'), {color:'#fff', bg:'transparent'})
 */
(function () {
  'use strict';

  // STATUS: currently NOT used. The <div data-printer-anim> in public/index.html is commented out.
  // To show it again, uncomment that block on the home page.
  // The animation is drawn on a <canvas> at 60 fps, with a fixed internal size of W x H (760 x 420)
  // that is scaled to the container width.
  //
  // CONSTANTS (all coordinates are in canvas pixels, origin top-left):
  //   W,H   canvas size            CX     horizontal centre     BED   y of the print bed
  //   N     number of layers       LH     height of one layer   REST  y of the nozzle at rest
  //   KX0/KX1  left/right edge of the keychain, KY0 its top, KR its corner radius
  //   HX,HY,HR centre and radius of the keychain hole    SX,SY centre of the filament spool
  var W = 900, H = 520, CX = 380, BED = 330, N = 40, LH = 3, REST = 130;
  // Printer coordinates (CX, BED...) are drawn on a 760-wide stage, then zoomed Z times and centred on the canvas (ZX, ZY).
  var Z = 1.4, ZX = W / 2, ZY = 258, MIDY = 225;
  // Logo palette
  // Palette: reassigned at every frame according to the page theme (see frame()). FG = text / ghost colour, CM = comment colour (r,g,b)
  var GREEN = '#5D9362', LGREEN = '#A9C8A7', GREY = '#c4c5c9', LGREY = '#e9e9ec', FG = '#ffffff', CM = '196,197,201';
  var KX0 = CX - 45, KX1 = CX + 45, KY0 = BED - N * LH, KR = 18;
  var HX = CX, HY = 240, HR = 10;                     // keychain hole
  var SX = CX + 170, SY = 104;                        // filament spool
  // Duration (seconds) of each phase of the loop, in this order (see ORDER):
  // boot = heat up, print = print the layers, fin = cool down, lift = keychain floats up,
  // hold = it hovers, rb = fake "reboot" glitch, then the loop restarts. T = total duration.
  var D = { boot: 1.6, print: 8.8, fin: 1.0, lift: 1.6, hold: 4.2, rb: 2.0 };
  var ORDER = ['boot', 'print', 'fin', 'lift', 'hold', 'rb'];
  var T = 0; for (var k in D) T += D[k];
  // Monospace font used for the floating G-code lines and the status text
  var FONT = '11px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';

  // Random G-code / explanation lines that float around the printer (comment lines start with // or ;)
  var CODE = [
    'G28 ; home all axes',
    'M104 S210 ; heat the nozzle',
    'M140 S60 ; heat the bed',
    'M106 S255 ; part cooling fan',
    'G1 Z0.2 ; set layer height',
    'G1 X12.4 Y8.1 E0.42 ; extrude',
    '// slicer cuts model in layers',
    '// stepper motors move X/Y/Z',
    '// nozzle melts PLA at 210C',
    '// extruder pushes the filament',
    '// each layer sticks on the last',
    '// fan cools the plastic fast',
    'while (layer < total) print();',
    'if (layer == total) done();',
    'G92 E0 ; reset extruder',
    '// bed heat = better grip',
    'G1 F1800 ; set print speed',
    'M82 ; absolute extrusion'
  ];
  // Lines shown during the "reboot" phase
  var RB = ['// rebooting firmware...', 'M999 ; restart printer', 'G28 ; home all axes', 'M84 ; motors off', '// clearing the bed...'];

  // Pre-computes, for each of the N layers, its y position, its left/right edges (rounded
  // corners make the first/last layers narrower) and the segments left after cutting the hole.
  // This runs once at load time.
  // Per-layer geometry of the keychain (rounded tag with a hole)
  var LAY = [];
  (function () {
    for (var i = 0; i < N; i++) {
      var yc = BED - (i + 0.5) * LH, inset = 0, dy;
      if (yc < KY0 + KR) { dy = KY0 + KR - yc; inset = KR - Math.sqrt(Math.max(0, KR * KR - dy * dy)); }
      else if (yc > BED - KR) { dy = yc - (BED - KR); inset = KR - Math.sqrt(Math.max(0, KR * KR - dy * dy)); }
      var L = KX0 + inset, R = KX1 - inset, segs = [[L, R]], hd = Math.abs(yc - HY);
      if (hd < HR) { var hw = Math.sqrt(HR * HR - hd * hd); segs = [[L, HX - hw], [HX + hw, R]]; }
      LAY.push({ y: BED - (i + 1) * LH, L: L, R: R, segs: segs });
    }
  })();

  // Small math helpers: ease() = smooth start/end (0..1), lerp() = linear blend between a and b,
  // rgb()/rgba() = hex colour -> "rgb(...)" string, shade() = lighten (a>0) or darken (a<0) a colour,
  // rnd() = random item of an array
  function ease(x) { x = x < 0 ? 0 : x > 1 ? 1 : x; return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; }
  function lerp(a, b, x) { return a + (b - a) * x; }
  function rgb(hex) { var n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function rgba(hex, a) { var c = rgb(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function shade(hex, a) {
    var c = rgb(hex).map(function (v) { return Math.max(0, Math.min(255, Math.round(a < 0 ? v * (1 + a) : v + (255 - v) * a))); });
    return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
  }
  function rnd(a) { return a[Math.floor(Math.random() * a.length)]; }

  // mount(el, opt) = starts the animation inside the element "el". Called automatically for every
  // [data-printer-anim] element (see auto() at the bottom). Options: color (filament), bg (background).
  // Safe to call twice on the same element (ignored the second time).
  function mount(el, opt) {
    if (!el || el.__printerAnim) return;
    el.__printerAnim = true;
    opt = opt || {};
    var color = opt.color || el.getAttribute('data-color') || '#ffffff';
    var bg = opt.bg || el.getAttribute('data-bg') || 'transparent';
    if (!/^#[0-9a-f]{6}$/i.test(color)) color = '#ffffff';
    var solid = /^#[0-9a-f]{6}$/i.test(bg);

    // Create the <canvas>, with an accessible label, inside the container
    var cv = document.createElement('canvas');
    cv.style.cssText = 'display:block;width:100%;height:auto;aspect-ratio:' + W + '/' + H;
    cv.setAttribute('role', 'img');
    cv.setAttribute('aria-label', 'Animation: a 3D printer prints a keychain layer by layer');
    el.appendChild(cv);
    var c = cv.getContext('2d');

    // Keep the canvas sharp: internal pixel size = displayed width x device pixel ratio (max 2)
    function resize() {
      var w = el.clientWidth || W, dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(w * dpr); cv.height = Math.round(w * dpr * H / W);
    }
    resize();
    if (window.ResizeObserver) new ResizeObserver(resize).observe(el); else window.addEventListener('resize', resize);

    // Horizontal gradient used to paint the keychain layers so they look rounded/metallic
    var grad = c.createLinearGradient(KX0, 0, KX1, 0);
    grad.addColorStop(0, '#c4c5c9'); grad.addColorStop(0.3, color);
    grad.addColorStop(0.6, '#f3f3f4'); grad.addColorStop(1, '#c4c5c9');
    // Same keychain gradient with darker edges, for a light page
    var gradL = c.createLinearGradient(KX0, 0, KX1, 0);
    gradL.addColorStop(0, '#a9abb2'); gradL.addColorStop(0.3, color);
    gradL.addColorStop(0.6, '#ececee'); gradL.addColorStop(1, '#a9abb2');
    var gradD = grad;
    // Is the page dark? <html data-theme="dark|light"> wins, otherwise the device setting (live)
    var mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
    function isDark() { var t = document.documentElement.getAttribute('data-theme'); return t === 'light' ? false : t === 'dark' ? true : !!(mq && mq.matches); }

    // Animation state: t = time inside the loop, clock = total time (for wobbles/blinking),
    // rot = spool angle, lines = floating code lines, visible = is the canvas on screen
    var t = 0, clock = 0, rot = 0, lines = [], sp = 0, visible = true, last = 0;
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) t = D.boot + D.print + D.fin + D.lift + 1;
    if ('IntersectionObserver' in window) new IntersectionObserver(function (e) { visible = e[0].isIntersecting; }).observe(cv);

    // Draws ONE layer of the keychain between x = a and x = b (used for partly printed layers).
    // Every second layer is slightly darker to show the layer lines.
    // green = true draws the green "extrusion" copy (shifted right, like the logo's N); it is drawn
    // for all layers BEFORE the white faces so the white always stays on top.
    function drawL(l, a, b, i, green) {
      for (var s = 0; s < l.segs.length; s++) {
        var x0 = Math.max(l.segs[s][0], a), x1 = Math.min(l.segs[s][1], b);
        if (x1 <= x0) continue;
        if (green) {
          c.fillStyle = GREEN; c.fillRect(x0 + 6, l.y, x1 - x0, LH + 0.4);
          if (i % 2) { c.fillStyle = 'rgba(0,0,0,.14)'; c.fillRect(x0 + 6, l.y, x1 - x0, LH + 0.4); }
          continue
        }
        c.fillStyle = grad; c.fillRect(x0, l.y, x1 - x0, LH + 0.4);
        if (i % 2) { c.fillStyle = 'rgba(110,112,120,.2)'; c.fillRect(x0, l.y, x1 - x0, LH + 0.4); }
        c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(x0, l.y, x1 - x0, 0.8);
      }
    }

    // frame(dt) = computes the state for this instant and draws everything. dt = seconds since last frame.
    // Part 1: find the current phase (ph) and its progress p (0..1)
    function frame(dt) {
      t += dt; clock += dt;
      // Palette for the current page theme
      var dk = isDark();
      LGREEN = dk ? '#A9C8A7' : '#5D9362'; GREY = dk ? '#c4c5c9' : '#a9abb2'; LGREY = dk ? '#e9e9ec' : '#d3d4d9';
      FG = dk ? color : '#2b2c30'; CM = dk ? '196,197,201' : '120,122,130'; grad = dk ? gradD : gradL;
      if (t >= T) { t -= T; lines = []; }
      var ph = 'rb', p = 1, acc = 0;
      for (var q = 0; q < 6; q++) {
        var d = D[ORDER[q]];
        if (t < acc + d || q === 5) { ph = ORDER[q]; p = Math.min(1, (t - acc) / d); break; }
        acc += d;
      }

      // Part 2: depending on the phase compute nozzle height (nozzleY), nozzle x (hx), temperature,
      // number of finished layers (done), lift amount (lf) and the status text
      // ---- state ----
      var nozzleY = REST, hx = CX, temp = 60, done = 0, frac = 0, lf = 0, e, status = '';
      if (ph === 'boot') {
        e = ease(p); temp = lerp(25, 210, e); hx = lerp(CX, LAY[0].L, e);
        nozzleY = p < 0.5 ? REST : lerp(REST, BED, ease((p - 0.5) * 2));
        status = '> heating  nozzle ' + Math.round(temp) + 'C  bed ' + Math.round(lerp(22, 60, e)) + 'C';
      } else if (ph === 'print') {
        temp = 210; var tp = p * N; done = Math.min(N - 1, Math.floor(tp)); frac = Math.min(1, tp - done);
        var Lp = LAY[done];
        hx = done % 2 ? lerp(Lp.R, Lp.L, frac) : lerp(Lp.L, Lp.R, frac);
        nozzleY = BED - (done + Math.min(1, frac * 6)) * LH;
        status = '> printing  layer ' + (done + 1) + '/' + N + '  nozzle 210C  bed 60C';
      } else if (ph === 'fin') {
        e = ease(p); done = N; temp = lerp(210, 60, p);
        nozzleY = lerp(KY0, REST, e); hx = lerp(LAY[N - 1].L, CX, e);
        status = '> print finished  cooling down';
      } else {
        done = N;
        lf = ph === 'lift' ? ease(p) : 1;
        status = ph === 'rb' ? '> rebooting printer...  ' + Math.round(p * 100) + '%' : '> [ OK ] keychain ready';
      }
      var hf = Math.max(0, (temp - 25) / 185), printing = ph === 'print';
      if (printing) rot += dt * 1.8;
      var oy = -55 * lf + Math.sin(clock * 2.2) * 5 * lf, sc = 1 + 0.1 * lf;
      var sx = sc * (1 - lf * 0.12 * (0.5 - 0.5 * Math.cos(clock * 1.2)));
      var oa = 1;
      if (ph === 'rb') oa = p < 0.5 ? (Math.random() < 0.55 ? 1 : 0.15) : 0;

      // Part 3: spawn a new floating code line every 0.2-0.6 s (max 10 on screen),
      // only if it fits in a free spot; remove lines when their life is over
      // ---- code lines ----
      sp -= dt;
      if (sp <= 0 && lines.length < 10) {
        sp = 0.18 + Math.random() * 0.4;
        var txt, r = Math.random();
        if (printing && r < 0.3) {
          txt = rnd(['; layer ' + (done + 1) + ' / ' + N, 'G1 Z' + ((done + 1) * 0.2).toFixed(1) + ' ; next layer',
            'M105 ; T:' + Math.round(temp) + 'C', 'G1 X' + (Math.random() * 90).toFixed(1) + ' Y' + (Math.random() * 90).toFixed(1) + ' E' + (Math.random() * 3).toFixed(2)]);
        } else txt = ph === 'rb' ? rnd(RB) : rnd(CODE);
        c.font = FONT;
        var tw = c.measureText(txt).width, zs = [];
        if (tw < 236) zs.push(0);
        if (tw < 146) zs.push(1);
        if (zs.length && !lines.some(function (o) { return o.t === txt; })) {
          var z = rnd(zs), y = 0, ok = false;
          for (var tr = 0; tr < 8 && !ok; tr++) {
            y = 24 + Math.floor(Math.random() * 24) * 18; ok = true;
            for (var j = 0; j < lines.length; j++) if (lines[j].z === z && Math.abs(lines[j].y - y) < 17) ok = false;
          }
          if (ok) lines.push({ t: txt, z: z, x: z ? W - 160 : 10, y: y, age: 0, life: 3.2 + Math.random() * 1.6 });
        }
      }
      lines = lines.filter(function (o) { o.age += dt; return o.age < o.life; });

      // Part 4: drawing, back to front: background dots -> code lines -> printer frame and bed ->
      // ghost of the model -> keychain (+ glow, shadow, sparkles) -> gantry, filament, nozzle, spool ->
      // reboot glitch -> status text and progress bar
      // ---- draw ----
      c.setTransform(cv.width / W, 0, 0, cv.width / W, 0, 0);
      c.clearRect(0, 0, W, H);
      if (solid) {
        c.fillStyle = bg; c.fillRect(0, 0, W, H);
      }

      c.font = FONT; c.textBaseline = 'middle'; c.textAlign = 'left';
      for (var li = 0; li < lines.length; li++) {
        var o = lines[li], n = Math.min(o.t.length, Math.floor(o.age * 40));
        var al = Math.min(1, o.age * 4) * Math.min(1, (o.life - o.age) / 0.8);
        c.fillStyle = (o.t.charAt(0) === '/' || o.t.charAt(0) === ';') ? 'rgba(' + CM + ',' + (al * 0.8) + ')' : rgba(FG, al);
        c.fillText(o.t.slice(0, n) + (n < o.t.length ? '\u2588' : ''), o.x, o.y);
      }

      // everything below (printer) is drawn zoomed and centred
      c.save(); c.translate(ZX, ZY); c.scale(Z, Z); c.translate(-CX, -MIDY);
      // printer frame
      c.fillStyle = dk ? '#3a3a3d' : '#c9cbd0'; c.fillRect(CX - 140, 342, 280, 30);
      c.fillStyle = LGREY; c.fillRect(CX - 140, 342, 280, 2);
      var leds = [GREY, GREEN, '#8d8e94'];
      for (var ld = 0; ld < 3; ld++) {
        c.fillStyle = leds[ld]; c.globalAlpha = ld === 1 ? 0.4 + 0.6 * (printing ? Math.abs(Math.sin(clock * 6)) : 0.4) : 0.8;
        c.beginPath(); c.arc(CX - 118 + ld * 14, 358, 3, 0, 6.3); c.fill();
      }
      c.globalAlpha = 1;
      [CX - 135, CX + 123].forEach(function (x) {
        c.fillStyle = GREY; c.fillRect(x, 50, 12, 292);
        c.fillStyle = LGREY; c.fillRect(x + 1, 50, 3, 292);
        c.fillStyle = GREEN; c.fillRect(x, 50, 12, 4);
      });
      c.fillStyle = '#8d8e94'; c.fillRect(CX - 110, BED, 220, 12);
      c.fillStyle = rgba(GREEN, 0.35 + 0.65 * hf); c.fillRect(CX - 110, BED, 220, 2);

      // ghost of the model
      if (ph === 'boot' || printing) {
        c.globalAlpha = 0.08; c.fillStyle = FG;
        for (var gi = printing ? done : 0; gi < N; gi++) for (var gs = 0; gs < LAY[gi].segs.length; gs++) c.fillRect(LAY[gi].segs[gs][0], LAY[gi].y, LAY[gi].segs[gs][1] - LAY[gi].segs[gs][0], LH);
        c.globalAlpha = 1;
      }

      var cy = KY0 + (BED - KY0) / 2;
      if (lf > 0 && oa > 0) {
        c.fillStyle = 'rgba(0,0,0,' + (dk ? 0.35 : 0.14) * lf + ')';
        c.beginPath(); c.ellipse(CX, BED + 1, 46 * (1 - 0.35 * lf), 5, 0, 0, 6.3); c.fill();
        var gr = c.createRadialGradient(CX, cy + oy, 10, CX, cy + oy, 130);
        gr.addColorStop(0, rgba(GREEN, 0.3 * lf * (0.8 + 0.2 * Math.sin(clock * 3)))); gr.addColorStop(1, rgba(GREEN, 0));
        c.fillStyle = gr; c.fillRect(CX - 140, cy + oy - 140, 280, 280);
        c.fillStyle = LGREEN;
        for (var sk = 0; sk < 12; sk++) {
          var ang = clock * 0.9 + sk * 0.5236, rr = 75 + 10 * Math.sin(clock * 1.7 + sk * 2);
          c.globalAlpha = 0.8 * lf;
          c.beginPath(); c.arc(CX + Math.cos(ang) * rr, cy + oy + Math.sin(ang) * rr * 0.55, 1.5 + 1.1 * Math.sin(clock * 3 + sk), 0, 6.3); c.fill();
        }
        c.globalAlpha = 1;
      }

      if (done > 0 || printing || ph !== 'boot') {
        c.save();
        c.globalAlpha = oa;
        c.translate(CX, cy + oy); c.scale(sx, sc); c.translate(-CX, -cy);
        var full = printing ? done : done;
        for (var oi = 0; oi < full; oi++) drawL(LAY[oi], KX0, KX1, oi, true);
        if (printing) { var PG = LAY[done]; if (done % 2) drawL(PG, hx, KX1, done, true); else drawL(PG, KX0, hx, done, true); }
        for (var oi2 = 0; oi2 < full; oi2++) drawL(LAY[oi2], KX0, KX1, oi2);
        if (printing) {
          var PL = LAY[done];
          if (done % 2) drawL(PL, hx, KX1, done); else drawL(PL, KX0, hx, done);
        }
        if (lf > 0) {
          c.globalAlpha = oa * lf; c.strokeStyle = GREEN; c.lineWidth = 3;
          c.beginPath(); c.arc(CX, HY - 8, 14, 0, 6.3); c.stroke();
        }
        c.restore();
      }

      // gantry + hotend
      var by = nozzleY - 58;
      c.fillStyle = GREY; c.fillRect(CX - 123, by, 246, 12);
      c.fillStyle = LGREY; c.fillRect(CX - 123, by, 246, 2);
      c.fillStyle = GREEN; c.fillRect(CX - 123, by + 10, 246, 2);
      // filament
      c.strokeStyle = LGREY; c.lineWidth = 2; c.beginPath();
      c.moveTo(SX - 24, SY - 8); c.quadraticCurveTo(CX + 100, by - 50, hx, by - 3); c.stroke();
      c.fillStyle = '#8d8e94'; c.fillRect(hx - 15, by - 3, 30, 20);
      c.fillStyle = LGREY; c.fillRect(hx - 15, by - 3, 30, 3);
      c.fillStyle = '#6d6e74';
      for (var fn = 0; fn < 4; fn++) c.fillRect(hx - 7, nozzleY - 34 + fn * 4, 14, 2);
      c.fillStyle = '#a4a5aa'; c.fillRect(hx - 8, nozzleY - 18, 16, 10);
      c.fillStyle = rgba(GREEN, hf * 0.9); c.fillRect(hx - 8, nozzleY - 18, 16, 10);
      c.fillStyle = shade(color, -0.1 - (1 - hf) * 0.5);
      c.beginPath(); c.moveTo(hx - 5, nozzleY - 8); c.lineTo(hx + 5, nozzleY - 8); c.lineTo(hx + 1.5, nozzleY); c.lineTo(hx - 1.5, nozzleY); c.fill();
      if (hf > 0.5) {
        var ng = c.createRadialGradient(hx, nozzleY, 0, hx, nozzleY, 14);
        ng.addColorStop(0, rgba(LGREEN, 0.55 * hf)); ng.addColorStop(1, rgba(LGREEN, 0));
        c.fillStyle = ng; c.fillRect(hx - 14, nozzleY - 14, 28, 28);
      }
      // spool
      c.strokeStyle = GREY; c.lineWidth = 4; c.beginPath(); c.moveTo(CX + 135, SY); c.lineTo(SX, SY); c.stroke();
      c.fillStyle = GREY; c.beginPath(); c.arc(SX, SY, 26, 0, 6.3); c.fill();
      c.fillStyle = color; c.beginPath(); c.arc(SX, SY, 22, 0, 6.3); c.fill();
      c.fillStyle = GREEN; c.beginPath(); c.arc(SX, SY, 12, 0, 6.3); c.fill();
      c.strokeStyle = LGREY; c.lineWidth = 2;
      for (var sk2 = 0; sk2 < 3; sk2++) {
        var sa = rot + sk2 * 2.0944; c.beginPath(); c.moveTo(SX, SY); c.lineTo(SX + Math.cos(sa) * 11, SY + Math.sin(sa) * 11); c.stroke();
      }

      c.restore();   // end of the zoomed printer

      // reboot glitch
      if (ph === 'rb') {
        if (solid) { c.fillStyle = 'rgba(0,0,0,' + Math.sin(p * Math.PI) * 0.35 + ')'; c.fillRect(0, 0, W, H); }
        for (var gl = 0; gl < 4; gl++) if (Math.random() < 0.5) { c.fillStyle = rgba(FG, 0.08); c.fillRect(0, Math.random() * H, W, 2 + Math.random() * 6); }
        if (solid && p < 0.5 && Math.random() < 0.3) { c.fillStyle = 'rgba(255,255,255,.05)'; c.fillRect(0, 0, W, H); }
      }

      // status bar
      c.font = '12px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace'; c.textAlign = 'center';
      c.fillStyle = LGREEN; c.fillText(status, W / 2, H - 28);
      var prog = ph === 'print' ? p : ph === 'rb' ? p : ph === 'boot' ? p : 1;
      c.fillStyle = dk ? 'rgba(255,255,255,.14)' : 'rgba(0,0,0,.1)'; c.fillRect(W / 2 - 110, H - 14, 220, 3);
      c.fillStyle = GREEN; c.fillRect(W / 2 - 110, H - 14, 220 * prog, 3);
    }

    // Main loop (requestAnimationFrame). Pauses when the canvas is off-screen or the tab is hidden.
    // With "reduce motion" enabled, the keychain is shown finished and nothing moves.
    function loop(now) {
      var dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      if (visible && !document.hidden) frame(reduce ? 0 : dt);
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  // Auto-start: mount every element that has the data-printer-anim attribute
  function auto() {
    var els = document.querySelectorAll('[data-printer-anim]');
    for (var i = 0; i < els.length; i++) mount(els[i]);
  }
  // Public API: PrinterAnim.mount(element, options)
  window.PrinterAnim = { mount: mount };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto); else auto();
})();

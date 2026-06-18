/* Live cursors + "laser pointer" trails for room members.

   Each client publishes its pointer as { rx, ry, drawing } where rx/ry are the
   position as a fraction (0..1) of the main .content frame. Everyone shares the
   same app layout, so the same fraction maps to the same place on each member's
   screen regardless of their window size or scroll position. The page scrolls
   (not .content), so .content's bounding rect already tracks the scroll.

   Trails ("look here!") are only recorded while the right mouse button is held
   (drawing=true). A trail segment fades out over ~1s and is drawn on a single
   full-window canvas.

   Pure presentation: nothing here is persisted. See js/sync.js for transport. */

window.App = window.App || {};

(function (App) {
  'use strict';

  var TRAIL_MS = 1000;   // a trail point lives ~1s, fading the whole time
  var STALE_MS = 8000;   // hide cursors whose last update is older than this
  var LERP = 0.35;       // smoothing factor for cursor motion (0..1)

  // ---- position, relative to the main content frame ----------------------
  // The cursor is tracked as a fraction (rx, ry) of the .content area's size.
  // Everyone shares the same app layout, so the same fraction lands on the same
  // place regardless of window size or scroll position — the page scrolls, so
  // .content's bounding rect already moves with the scroll and we just use it.
  function contentRect() {
    var c = document.querySelector('.content');
    return c ? c.getBoundingClientRect() : null;
  }

  // Sender: turn a viewport point into a fraction of the content frame.
  // (Name kept for the existing ui.js call site.) target is unused now.
  App.buildCursorAnchor = function (target, clientX, clientY) {
    var r = contentRect();
    if (!r || r.width <= 0 || r.height <= 0) {
      return { rx: clientX / Math.max(1, window.innerWidth),
               ry: clientY / Math.max(1, window.innerHeight) };
    }
    return {
      rx: (clientX - r.left) / r.width,
      ry: (clientY - r.top) / r.height
    };
  };

  // Receiver: map a fraction back to a viewport pixel point on this screen.
  function resolveCursor(c) {
    var r = contentRect();
    if (!r) {
      return { x: c.rx * window.innerWidth, y: c.ry * window.innerHeight };
    }
    return { x: r.left + c.rx * r.width, y: r.top + c.ry * r.height };
  }

  // ---- per-cursor render state --------------------------------------------
  // Keyed by deviceId. Holds the smoothed on-screen position and a trail buffer.
  var rendered = {}; // id -> { el, label, color, sx, sy, trail: [{x,y,t}], lastSeen }
  var layer = null;  // overlay div hosting the cursor markers
  var canvas = null, ctx = null;

  // deterministic, well-spread color from a device id
  function colorFor(id) {
    var h = 0;
    for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    var hue = h % 360;
    return 'hsl(' + hue + ',85%,62%)';
  }

  function ensureLayer() {
    if (layer) return;
    layer = document.getElementById('cursorLayer');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'cursorLayer';
      document.body.appendChild(layer);
    }
    canvas = document.getElementById('cursorTrail');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'cursorTrail';
      document.body.appendChild(canvas);
    }
    ctx = canvas.getContext('2d');
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
  }

  function resizeCanvas() {
    if (!canvas) return;
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function makeCursorEl(color, name) {
    var wrap = document.createElement('div');
    wrap.className = 'rc-cursor';
    wrap.innerHTML =
      '<svg class="rc-arrow" width="20" height="20" viewBox="0 0 20 20">' +
        '<path d="M2 2 L2 16 L6 12 L9 18 L12 17 L9 11 L15 11 Z" ' +
        'fill="' + color + '" stroke="#000" stroke-width="1.2" ' +
        'stroke-linejoin="round"/></svg>' +
      '<span class="rc-label" style="background:' + color + '"></span>';
    wrap.querySelector('.rc-label').textContent = name;
    layer.appendChild(wrap);
    return wrap;
  }

  // ---- main loop ----------------------------------------------------------
  function tick() {
    if (!layer) { requestAnimationFrame(tick); return; }
    var now = Date.now();
    var cursors = (App.room && App.room.cursors) || {};
    var seen = {};

    Object.keys(cursors).forEach(function (id) {
      var c = cursors[id];
      if (!c || (now - (c.at || 0)) > STALE_MS) return;
      seen[id] = true;

      var r = rendered[id];
      if (!r) {
        r = rendered[id] = {
          el: makeCursorEl(colorFor(id), c.name || 'Guest'),
          color: colorFor(id), sx: 0, sy: 0, trail: [], placed: false
        };
      }

      var pos = resolveCursor(c);

      // update name if it changed
      var lbl = r.el.querySelector('.rc-label');
      if (lbl && lbl.textContent !== (c.name || 'Guest')) lbl.textContent = c.name || 'Guest';

      // snap on first placement, then smooth toward the target position
      if (!r.placed) { r.sx = pos.x; r.sy = pos.y; r.placed = true; }
      else { r.sx += (pos.x - r.sx) * LERP; r.sy += (pos.y - r.sy) * LERP; }
      r.el.style.transform = 'translate(' + r.sx + 'px,' + r.sy + 'px)';
      r.el.style.display = '';

      // record a trail point only while this user is "drawing" (right-click)
      if (c.drawing) {
        var last = r.trail[r.trail.length - 1];
        if (!last || Math.abs(last.x - r.sx) > 1 || Math.abs(last.y - r.sy) > 1) {
          r.trail.push({ x: r.sx, y: r.sy, t: now });
        }
      } else if (r.trail.length) {
        // keep the tail draining out even after the button is released
        var lastT = r.trail[r.trail.length - 1];
        if (lastT && !lastT.gap) r.trail.push({ x: r.sx, y: r.sy, t: now, gap: true });
      }
    });

    // remove cursor markers for ids that disappeared
    Object.keys(rendered).forEach(function (id) {
      if (!seen[id]) {
        var r = rendered[id];
        // let any remaining trail fade before removing the marker
        if (r.trail.length && (now - r.trail[r.trail.length - 1].t) < TRAIL_MS) {
          if (r.el) r.el.style.display = 'none';
        } else {
          if (r.el && r.el.parentNode) r.el.parentNode.removeChild(r.el);
          delete rendered[id];
        }
      }
    });

    drawTrails(now);
    requestAnimationFrame(tick);
  }

  function drawTrails(now) {
    if (!ctx) return;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    Object.keys(rendered).forEach(function (id) {
      var r = rendered[id];
      // prune expired points
      r.trail = r.trail.filter(function (p) { return (now - p.t) < TRAIL_MS; });
      if (r.trail.length < 2) return;

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = r.color;
      // draw each segment with an age-based alpha + width so the line tapers and
      // fades along its length (newest = brightest/thickest)
      for (var i = 1; i < r.trail.length; i++) {
        var a = r.trail[i - 1], b = r.trail[i];
        if (b.gap) continue; // don't bridge a pen-up jump
        var age = now - b.t;
        var k = 1 - age / TRAIL_MS; // 1 = fresh, 0 = expired
        if (k <= 0) continue;
        ctx.globalAlpha = k * 0.85;
        ctx.lineWidth = 2 + k * 4;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    });
    ctx.globalAlpha = 1;
  }

  // ---- lifecycle ----------------------------------------------------------
  // Tear everything down when leaving a room (or when there are no cursors).
  function reset() {
    Object.keys(rendered).forEach(function (id) {
      var r = rendered[id];
      if (r.el && r.el.parentNode) r.el.parentNode.removeChild(r.el);
    });
    rendered = {};
    if (ctx) ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  }

  App.startCursors = function () {
    ensureLayer();
    if (!App._cursorLoopStarted) {
      App._cursorLoopStarted = true;
      requestAnimationFrame(tick);
    }
  };

  // boot once the page is ready, and clear our render state on room changes
  function boot() {
    App.startCursors();
    if (App.onRoomChange) App.onRoomChange(function (code) { if (!code) reset(); });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})(window.App);

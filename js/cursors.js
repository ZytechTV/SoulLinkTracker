/* Live cursors + "laser pointer" trails for room members.

   Each client publishes its pointer as { anchor, rx, ry, drawing } where:
     - anchor  = a STABLE css selector for the element under the cursor (built
                 from the data-* hooks the renderer already emits), or null when
                 over no tracked element (then rx/ry are viewport-relative).
     - rx, ry  = the cursor's position INSIDE that element, 0..1.
   The receiver resolves `anchor` against its own DOM and places the cursor at
   the same logical spot — so it lands on the same UI element regardless of the
   viewer's scroll position or window size.

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

  // ---- anchor building (sender side) --------------------------------------
  // Priority-ordered list of attributes that uniquely-enough identify a spot in
  // the UI. We build a selector from the closest ancestor carrying one of them,
  // combined with data-player/data-catch when present so it stays specific.
  var ANCHOR_ATTRS = [
    'data-catch', 'data-anatype', 'data-bankpick', 'data-box',
    'data-typehl', 'data-col', 'data-row'
  ];

  function attrSel(elm, name) {
    var v = elm.getAttribute(name);
    if (v == null) return null;
    // escape quotes/backslashes for a safe attribute selector
    v = String(v).replace(/(["\\])/g, '\\$1');
    return '[' + name + '="' + v + '"]';
  }

  // Build a stable selector for the element under (clientX, clientY), plus the
  // relative position within it. Returns { anchor, rx, ry } (anchor may be null).
  App.buildCursorAnchor = function (target, clientX, clientY) {
    var hostEl = null;
    var sel = null;

    if (target && target.closest) {
      for (var i = 0; i < ANCHOR_ATTRS.length && !hostEl; i++) {
        var hit = target.closest('[' + ANCHOR_ATTRS[i] + ']');
        if (!hit) continue;
        var parts = [attrSel(hit, ANCHOR_ATTRS[i])];
        // qualify with player/catch so e.g. the same slot index on two players
        // doesn't collide
        if (hit.hasAttribute('data-player') && ANCHOR_ATTRS[i] !== 'data-player') {
          parts.push(attrSel(hit, 'data-player'));
        }
        if (hit.hasAttribute('data-catch') && ANCHOR_ATTRS[i] !== 'data-catch') {
          parts.push(attrSel(hit, 'data-catch'));
        }
        sel = parts.join('');
        hostEl = hit;
      }
      // fall back to the active tab panel as a coarse anchor
      if (!hostEl) {
        var panel = target.closest('.tabpanel');
        if (panel && panel.id) { sel = '#' + panel.id; hostEl = panel; }
      }
    }

    if (hostEl) {
      var r = hostEl.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        return {
          anchor: sel,
          rx: (clientX - r.left) / r.width,
          ry: (clientY - r.top) / r.height
        };
      }
    }
    // viewport-relative fallback
    return {
      anchor: null,
      rx: clientX / Math.max(1, window.innerWidth),
      ry: clientY / Math.max(1, window.innerHeight)
    };
  };

  // ---- anchor resolving (receiver side) -----------------------------------
  // Returns absolute viewport pixel coords for a published cursor, or null if
  // the anchor element isn't present on this screen right now.
  function resolveCursor(c) {
    if (!c.anchor) {
      return {
        x: c.rx * window.innerWidth,
        y: c.ry * window.innerHeight
      };
    }
    var elm;
    try { elm = document.querySelector(c.anchor); } catch (e) { elm = null; }
    if (!elm) return null;
    var r = elm.getBoundingClientRect();
    if (r.width <= 0 && r.height <= 0) return null;
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

  // A pinned chip at the top edge for someone who is in the room but currently
  // looking at something we can't show (different tab / different pokémon).
  function makeEdgePin(color) {
    var pin = document.createElement('div');
    pin.className = 'rc-edge';
    pin.style.background = color;
    layer.appendChild(pin);
    return pin;
  }

  // Friendly label for where a teammate is, from the coarse `tab` they publish.
  var TAB_LABEL = {
    Dashboard: 'Dashboard', Bank: 'the Bank', Info: 'Pokémon Info',
    Catch: 'the Catchrate calc', Caps: 'Level Caps', Room: 'the Room view',
    Setup: 'the start screen'
  };
  function whereLabel(c) {
    var where = c.tab && TAB_LABEL[c.tab] ? TAB_LABEL[c.tab] : 'elsewhere';
    return (c.name || 'Guest') + ' 👀 ' + where;
  }

  // ---- main loop ----------------------------------------------------------
  function tick() {
    if (!layer) { requestAnimationFrame(tick); return; }
    var now = Date.now();
    var cursors = (App.room && App.room.cursors) || {};
    var seen = {};

    var offscreen = []; // ids that are present-in-room but not on our screen

    Object.keys(cursors).forEach(function (id) {
      var c = cursors[id];
      if (!c || (now - (c.at || 0)) > STALE_MS) return;
      seen[id] = true;

      var r = rendered[id];
      if (!r) {
        r = rendered[id] = {
          el: makeCursorEl(colorFor(id), c.name || 'Guest'),
          edge: null, color: colorFor(id), sx: 0, sy: 0, trail: [], placed: false
        };
      }

      var pos = resolveCursor(c);
      if (!pos) {
        // teammate is viewing something this screen doesn't have -> hide the
        // live cursor, surface an edge pin instead so we still know they're here
        r.el.style.display = 'none';
        if (!r.edge) r.edge = makeEdgePin(r.color);
        r.edge.textContent = whereLabel(c);
        offscreen.push(r);
        return;
      }
      if (r.edge) { if (r.edge.parentNode) r.edge.parentNode.removeChild(r.edge); r.edge = null; }

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

    // stack the off-screen edge pins along the top so they don't overlap
    offscreen.forEach(function (r, i) {
      r.edge.style.transform = 'translate(12px,' + (12 + i * 22) + 'px)';
    });

    // remove cursor markers for ids that disappeared
    Object.keys(rendered).forEach(function (id) {
      if (!seen[id]) {
        var r = rendered[id];
        if (r.edge) { if (r.edge.parentNode) r.edge.parentNode.removeChild(r.edge); r.edge = null; }
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
      if (r.edge && r.edge.parentNode) r.edge.parentNode.removeChild(r.edge);
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

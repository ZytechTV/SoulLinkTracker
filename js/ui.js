/* UI wiring: navigation, event delegation, toasts, import/export, unload guard. */

window.App = window.App || {};

(function (App) {
  'use strict';


  function toast(msg, kind) {
    var box = document.getElementById('toasts');
    var t = document.createElement('div');
    t.className = 'toast' + (kind ? ' ' + kind : '');
    t.innerHTML = msg;
    box.appendChild(t);
    setTimeout(function () {
      t.style.transition = 'opacity .3s';
      t.style.opacity = '0';
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 300);
    }, kind === 'death' ? 6000 : 3500);
  }
  App.toast = toast;

  // ---------- Log panel (run history + console) ----------
  var logMode = 'run';   // 'run' | 'console'
  var logOpen = false;
  var lastSeen = 0;      // for the unread badge

  function timeStr(t) {
    var d = new Date(t);
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }
  var RUN_ICON = { catch: '🎯', death: '💀', move: '📦', badge: '🏅', evolve: '✨', wipe: '☠', info: '•' };
  var CON_ICON = { join: '➕', leave: '➖', sync: '🔌', error: '⚠', info: '•' };

  function logEntries() {
    return logMode === 'run' ? (App.state.runLog || []) : (App.consoleLog || []);
  }

  function renderLogPanel() {
    var panel = document.getElementById('logPanel');
    if (!panel) return;
    var entries = logEntries().slice().reverse(); // newest first
    var rows = entries.length
      ? entries.map(function (e) {
          var icon = logMode === 'run'
            ? (RUN_ICON[e.kind] || '•')
            : (CON_ICON[e.level] || '•');
          var who = (logMode === 'run' && e.actor)
            ? '<span class="log-actor">' + App.esc(e.actor) + '</span> '
            : '';
          return '<div class="log-row log-' + App.esc(logMode === 'run' ? e.kind : e.level) + '">' +
            '<span class="log-time">' + timeStr(e.t) + '</span>' +
            '<span class="log-ico">' + icon + '</span>' +
            '<span class="log-text">' + who + App.esc(e.text) + '</span></div>';
        }).join('')
      : '<div class="log-empty hint">No entries yet.</div>';

    panel.innerHTML =
      '<div class="log-head">' +
      '<div class="log-tabs">' +
      '<button class="log-tab' + (logMode === 'run' ? ' on' : '') + '" data-logmode="run">Run Log</button>' +
      '<button class="log-tab' + (logMode === 'console' ? ' on' : '') + '" data-logmode="console">Console</button>' +
      '</div>' +
      '<button class="log-close" id="logCloseBtn" title="Close">✕</button>' +
      '</div>' +
      '<div class="log-list">' + rows + '</div>';
  }

  function refreshLogBadge() {
    var badge = document.getElementById('logBadge');
    var btn = document.getElementById('logBtn');
    if (!btn) return;
    btn.style.display = App.state.started ? '' : 'none';
    if (!badge) return;
    if (logOpen) { badge.style.display = 'none'; return; }
    // count run-log entries newer than lastSeen (the meaningful ones)
    var unseen = (App.state.runLog || []).filter(function (e) { return e.t > lastSeen; }).length;
    if (unseen > 0) { badge.textContent = unseen > 99 ? '99+' : unseen; badge.style.display = ''; }
    else badge.style.display = 'none';
  }

  function toggleLog(open) {
    logOpen = (open == null) ? !logOpen : open;
    var panel = document.getElementById('logPanel');
    if (logOpen) {
      renderLogPanel();
      panel.style.display = '';
      requestAnimationFrame(function () { panel.classList.add('open'); });
      lastSeen = Date.now();
    } else {
      panel.classList.remove('open');
      setTimeout(function () { if (!logOpen) panel.style.display = 'none'; }, 200);
    }
    refreshLogBadge();
  }
  App._refreshLog = function () { if (logOpen) renderLogPanel(); refreshLogBadge(); };

  // open/close + tab switching
  document.getElementById('logBtn').addEventListener('click', function () { toggleLog(); });
  document.getElementById('logPanel').addEventListener('click', function (e) {
    if (e.target.closest('#logCloseBtn')) { toggleLog(false); return; }
    var tab = e.target.closest('[data-logmode]');
    if (tab) { logMode = tab.getAttribute('data-logmode'); renderLogPanel(); }
  });
  // live updates: console log changes, and re-render after every app render
  if (App.onLogChange) App.onLogChange(function () { App._refreshLog(); });

  function go(tab) {
    App.state.activeTab = tab;
    App.render();
  }
  App.go = go;

  // resolve a pokemon name typed into a datalist input to a slug (delegates to render.js)
  function nameToSlug(name) { return App.nameToSlug(name); }

  // ---------- Live room flows ----------
  // Ask once for a display name (remembered on the device). Returns null if the
  // user cancels. `def` pre-fills the prompt.
  function askName(def) {
    var pre = App.savedName() || def || '';
    var n = prompt('Your display name (shown to others in the room):', pre);
    if (n == null) return null;
    n = n.trim().slice(0, 24) || 'Guest';
    App.rememberName(n);
    return n;
  }

  // Every new/loaded game automatically becomes a live room with a generated
  // code + password (shown in the Room tab for sharing). Best-effort: if sync is
  // unavailable the game still works locally.
  function autoStartRoom(gameKey) {
    if (!App.syncAvailable || !App.syncAvailable()) return;
    if (App.room && App.room.code) return; // already in a room (e.g. after join)
    // ask for the host's display name (default = first player's name)
    var def = (App.state.players[0] && App.state.players[0].name) || 'Host';
    var name = askName(def);
    if (name == null) name = App.savedName() || def; // cancel -> keep the default, room still opens
    var code = App.genRoomCode(gameKey);
    var pw = App.genRoomPassword();
    App.createRoom(code, pw, name).then(function (c) {
      App.render();
      toast('🔴 Live room <b>' + App.esc(c) + '</b> created. Invite friends from the Room tab.');
    }).catch(function (e) {
      toast('Live room could not start (' + App.esc(e.message) + '). Playing locally.', 'death');
    });
  }

  // Join a friend's room (from the start-screen card, Room tab, or invite link).
  function doJoinRoom(code, pw, confirmReplace) {
    if (!App.syncAvailable()) { toast('Live sync is unavailable (offline?).', 'death'); return; }
    if (!String(code || '').trim()) { toast('Please enter a room code.', 'death'); return; }
    if (confirmReplace && App.state.started &&
        !confirm('Joining replaces your current run with the room\'s state.\nExport first if you want to keep it. Continue?')) return;
    var name = askName();
    if (name == null) return;
    App.joinRoom(code, pw, name).then(function (c) {
      App.render();
      toast('🔴 Joined room <b>' + App.esc(c) + '</b> as <b>' + App.esc(name) + '</b> — live now.');
    }).catch(function (e) { toast(App.esc(e.message), 'death'); });
  }

  // re-render when the room status flips (so the Room tab + indicator update)
  if (App.onRoomChange) App.onRoomChange(function () { if (App.state.started) App.render(); });

  // ---------- Invite link: auto-join if the page was opened with #room=... ----
  (function () {
    if (!App.parseInvite) return;
    var inv = App.parseInvite();
    if (!inv) return;
    App.clearInvite(); // strip code+password from the address bar immediately
    // wait a tick so the rest of the app is ready, then offer to join
    setTimeout(function () {
      if (!App.syncAvailable || !App.syncAvailable()) {
        toast('Invite link found, but live sync is unavailable.', 'death');
        return;
      }
      if (confirm('You opened an invite to room "' + inv.code + '".\nJoin it now?')) {
        doJoinRoom(inv.code, inv.pw, true);
      }
    }, 300);
  })();

  // ---------- Garbage-collect dead rooms once on startup (best-effort) ----------
  if (App.cleanupDeadRooms) {
    setTimeout(function () { App.cleanupDeadRooms(); }, 4000);
  }

  // ---------- Tab nav ----------
  document.getElementById('tabnav').addEventListener('click', function (e) {
    // global actions living in the tab bar (right side)
    if (e.target.closest('#taExportBtn')) { App.exportJSON(); toast('Export started ⬇'); return; }
    if (e.target.closest('#taResetBtn')) {
      if (confirm('Quit to the start screen? Unsaved data will be lost — export first!')) {
        App.resetState(); App.render(); toast('Quit — back to the start screen.');
      }
      return;
    }
    var pill = e.target.closest('.room-pill[data-tab]');
    if (pill) { go(pill.getAttribute('data-tab')); return; }

    var b = e.target.closest('.tabbtn');
    if (!b || b.disabled) return;
    go(b.getAttribute('data-tab'));
  });


  // ---------- Global click delegation ----------
  document.querySelector('.content').addEventListener('click', function (e) {
    var t = e.target;

    // Start screen: start new game (each game is automatically a live room)
    if (t.closest('#startGameBtn')) {
      var gsel = document.getElementById('newGameSelect');
      var psel = document.getElementById('newPlayerCount');
      var n = parseInt(psel.value, 10);
      App.startNewGame(gsel.value, n, App._newGameMeta.slice(0, n));
      App.render();
      toast('Good luck on your ' + App.esc(gsel.value) + ' challenge!');
      autoStartRoom(gsel.value);
      return;
    }

    // Setup buttons
    if (t.closest('#exportBtn')) { App.exportJSON(); toast('Export started ⬇'); return; }
    if (t.closest('#importBtn')) { document.getElementById('importFile').click(); return; }

    // click the LIVE pill -> open the Room tab
    var pill = t.closest('.room-pill[data-tab]');
    if (pill) { go(pill.getAttribute('data-tab')); return; }

    // Live room controls
    if (t.closest('#joinRoomCardBtn')) {
      var jc = document.getElementById('joinRoomCode');
      var jp = document.getElementById('joinRoomPw');
      doJoinRoom(jc ? jc.value : '', jp ? jp.value : '', false);
      return;
    }
    if (t.closest('#roomLeaveBtn')) {
      if (!confirm('Leave the live room? Others stay in it; you go local-only.\nThe game itself keeps running.')) return;
      App.leaveRoom();
      App.render();
      toast('Left the room — playing locally now.');
      return;
    }
    // copy a room field (code/password) to the clipboard
    var copyBtn = t.closest('[data-roomcopy]');
    if (copyBtn) {
      var val = copyBtn.getAttribute('data-roomcopy');
      if (navigator.clipboard) navigator.clipboard.writeText(val).then(function () {
        toast('Copied to clipboard ✓');
      }).catch(function () { toast('Copy failed — select it manually.', 'death'); });
      return;
    }
    if (t.closest('#resetBtn')) {
      if (confirm('Quit to the start screen? Unsaved data will be lost — export first!')) {
        App.resetState(); App.render(); toast('Quit — back to the start screen.');
      }
      return;
    }

    // Dashboard / Catch: open new-catch modal
    if (t.closest('#dashNewCatch') || t.closest('#bankPickNewCatch')) {
      App.openCatchModal();
      return;
    }

    // Empty team slot -> pick a pokemon from this player's bank
    var bp = t.closest('[data-bankpick]');
    if (bp) { App.openBankPickModal(parseInt(bp.getAttribute('data-bankpick'), 10)); return; }

    // Pokémon Info: choose a pokemon (no block)
    if (t.closest('#infoPokeBtn')) {
      App.openPokePicker({
        title: 'Pokémon Info',
        onPick: function (slug) {
          if (!slug || App.isPlaceholder(slug)) return;
          App._infoSel = { slug: slug };
          App._renderPokemonInfo();
        }
      });
      return;
    }
    // Catchrate: choose a pokemon (resets the cached capture data)
    if (t.closest('#catchPokeBtn')) {
      App.openPokePicker({
        title: 'Catchrate Calculator',
        onPick: function (slug) {
          if (!slug || App.isPlaceholder(slug)) return;
          var prev = App._catchSel || {};
          // keep HP / status / selected ball / situational inputs across the change;
          // ball menu (hidden set) lives in App._catchHidden and is untouched here.
          App._catchSel = {
            slug: slug,
            hp: prev.hp != null ? prev.hp : 1,
            status: prev.status || 'none',
            ball: prev.ball,
            inputs: prev.inputs
          };
          App._renderCatchRate();
        }
      });
      return;
    }
    // Catchrate: toggle a ball on/off in the left menu (independent of pokemon)
    var crm = t.closest('[data-crballtoggle]');
    if (crm) {
      var mid = crm.getAttribute('data-crballtoggle');
      var hidden = App.catchHidden();
      if (hidden[mid]) delete hidden[mid];
      else hidden[mid] = true;
      App._refreshBallMenuItem(mid);     // grey out / restore the menu row
      App._refreshCatchResult();         // update the scale (and which ball is selected)
      App._refreshCatchSituational();    // shown inputs depend on visible balls
      return;
    }
    // Catchrate: pick a ball (card or scale marker) -> drives the big result
    var crb = t.closest('[data-crball]');
    if (crb) {
      App._catchSel = App._catchSel || { slug: '', status: 'none' };
      App._catchSel.ball = crb.getAttribute('data-crball');
      App._refreshCatchResult();
      App._refreshCatchSitHighlight();
      return;
    }
    // Catchrate: status pick -> recompute results
    var crst = t.closest('[data-crstatus]');
    if (crst) {
      var box = crst.closest('.cr-status-row');
      box.querySelectorAll('.cr-status').forEach(function (n) { n.classList.remove('on'); });
      crst.classList.add('on');
      (App._catchSel || {}).status = crst.getAttribute('data-crstatus');
      App._refreshCatchResult();
      return;
    }

    // Info: switch evolution-stage moves tab
    var st = t.closest('[data-stage]');
    if (st) {
      var box = st.closest('.info-moves');
      box.querySelectorAll('.stage-tab').forEach(function (n) { n.classList.remove('on'); });
      st.classList.add('on');
      App.renderStageMoves(st.getAttribute('data-stage'), App.state.generation);
      return;
    }
    // Info: select a move -> show details in the separate Move Info box
    var mr = t.closest('[data-move]');
    if (mr) {
      var scroll = mr.closest('.move-scroll');
      if (scroll) scroll.querySelectorAll('.move-row.selected').forEach(function (n) { n.classList.remove('selected'); });
      mr.classList.add('selected');
      App.renderMoveDetail(mr.getAttribute('data-move'), mr.getAttribute('data-movename'));
      return;
    }
    // Info: switch ability tab -> show that ability's text
    var atab = t.closest('[data-abilitytab]');
    if (atab) {
      var box = atab.closest('.info-box');
      box.querySelectorAll('.ability-tab').forEach(function (n) { n.classList.remove('on'); });
      atab.classList.add('on');
      App.renderAbilityContent(atab.getAttribute('data-abilitytab'));
      return;
    }

    // Type matchup: pick left/right pokemon
    var mub = t.closest('[data-matchupbtn]');
    if (mub) {
      var side = mub.getAttribute('data-matchupbtn');
      var opts = {
        title: side === 'left' ? 'Your Pokémon' : 'Opponent Pokémon',
        allowClear: true,
        onPick: function (slug) {
          App._matchup = App._matchup || {};
          App._matchup[side] = slug || null;
          App._renderers.dashboard();
        }
      };
      if (side === 'left') {
        // suggest all living team pokemon across players
        var sug = [];
        App.state.players.forEach(function (p) {
          App.teamEntries(p.id).forEach(function (x) {
            if (x.entry.status === 'alive' && x.entry.pokemon) sug.push(x.entry.pokemon);
          });
        });
        opts.suggested = sug;
        opts.suggestedLabel = 'Your team';
      }
      App.openPokePicker(opts);
      return;
    }

    // magnifier -> open Pokémon Info tab for this pokemon
    var lup = t.closest('[data-infolookup]');
    if (lup) {
      var slug = lup.getAttribute('data-infolookup');
      App._infoSel = { slug: slug };
      go('Info');
      return;
    }

    // edit pencil -> Pokémon details modal
    var ed = t.closest('[data-edit-catch]');
    if (ed) {
      App.openDetailModal(ed.getAttribute('data-edit-catch'), parseInt(ed.getAttribute('data-edit-player'), 10));
      return;
    }

    // Dashboard slot: "Died" -> whole link dies, owner blamed
    var kl = t.closest('[data-killlink]');
    if (kl) {
      var klC = kl.getAttribute('data-catch'), klP = parseInt(kl.getAttribute('data-player'), 10);
      var owner = App.playerById(klP);
      if (confirm('"Died" kills the ENTIRE soul-link of this encounter. ' +
          (owner ? owner.name + ' gets +1 death. ' : '') + 'Continue?')) {
        var kres = App.killLink(klC, klP);
        App.render();
        if (kres) {
          var partners = kres.killed.map(function (pid) { var p = App.playerById(pid); return p ? p.name : '?'; }).join(', ');
          toast('💀 Soul-link broken on ' + App.esc(kres.route) + '!<br>' +
            (owner ? 'Blame: <b>' + App.esc(owner.name) + '</b>' : '') +
            (partners ? '<br>Died too: <b>' + App.esc(partners) + '</b>' : ''), 'death');
          if (kres.wipe && kres.wipe.length) App.openGameOverModal(kres.wipe);
        }
      }
      return;
    }

    // Dashboard slot: "Evolve" -> change the pokemon
    var ev = t.closest('[data-evolve]');
    if (ev) {
      var evC = ev.getAttribute('data-catch'), evP = parseInt(ev.getAttribute('data-player'), 10);
      App.openPokePicker({
        title: 'Evolve into…',
        onPick: function (slug) {
          if (!slug) return;
          App.evolveEntry(evC, evP, slug);
          App.render();
          toast('⤴ Evolved into ' + App.esc(App.displayName(slug)) + '.');
        }
      });
      return;
    }


    // Dashboard/Catch slot: move to bank
    var tobank = t.closest('[data-tobank]');
    if (tobank) {
      App.moveEntry(tobank.getAttribute('data-catch'), parseInt(tobank.getAttribute('data-player'), 10), 'bank');
      App.render();
      return;
    }

    // Dashboard: badge toggle
    var badge = t.closest('.badge');
    if (badge) {
      var bi = parseInt(badge.getAttribute('data-badge'), 10);
      App.state.badges[bi] = !App.state.badges[bi];
      var region = App.regionInfo();
      var bname = (region && region.badges && region.badges[bi]) ? region.badges[bi] + ' Badge' : 'Badge ' + (bi + 1);
      App.logRun('badge', (App.state.badges[bi] ? '🏅 earned ' : 'removed ') + bname);
      App._renderers.dashboard(); // logRun already marked dirty/pushed
      return;
    }

    // Catch: delete
    var del = t.closest('[data-delcatch]');
    if (del) {
      if (confirm('Delete this encounter?')) {
        App.deleteCatch(del.getAttribute('data-delcatch'));
        App.render();
      }
      return;
    }
    // Catch: status pills
    var pill = t.closest('[data-setstatus]');
    if (pill) {
      handleSetStatus(
        pill.getAttribute('data-catch'),
        parseInt(pill.getAttribute('data-player'), 10),
        pill.getAttribute('data-setstatus')
      );
      return;
    }


    // Map hotspot -> jump to catch (or open modal pre-filled for that route)
    var spot = t.closest('[data-mroute]');
    if (spot) {
      var route2 = spot.getAttribute('data-mroute');
      var c = App.state.catches.find(function (cc) { return cc.route === route2; });
      if (c) {
        go('Catch');
        setTimeout(function () {
          var node = document.getElementById('catch-' + c.id);
          if (node) { node.scrollIntoView({ behavior: 'smooth', block: 'center' }); node.style.outline = '3px solid var(--accent)'; setTimeout(function(){node.style.outline='';},1500); }
        }, 60);
      } else {
        App.openCatchModal();
        var rsel = document.getElementById('modalRoute');
        if (rsel) { rsel.value = route2; rsel.dispatchEvent(new Event('change', { bubbles: true })); }
        toast('New encounter on ' + App.esc(route2) + '.');
      }
      return;
    }

    // Type chart: click a header -> persistent highlight of that single type (row+col)
    var th = t.closest('.type-th');
    if (th) {
      var ty = th.getAttribute('data-col') || th.getAttribute('data-row');
      var already = (persistentTypes.length === 1 && persistentTypes[0] === ty);
      persistentTypes = already ? [] : [ty];
      applyTypeHighlight(persistentTypes);
      return;
    }

    // Dashboard pokemon click -> highlight its type(s) row+col (toggle, persistent)
    var hl = t.closest('[data-typehl]');
    if (hl) {
      var slug = hl.getAttribute('data-typehl');
      var ptypes = App.typesForCurrentGen(slug); // gen-correct
      var same = ptypes.length === persistentTypes.length &&
        ptypes.every(function (x) { return persistentTypes.indexOf(x) >= 0; });
      persistentTypes = same ? [] : ptypes.slice();
      applyTypeHighlight(persistentTypes);
      // mark the clicked pokemon as active
      document.querySelectorAll('[data-typehl].hl-active').forEach(function (n) { n.classList.remove('hl-active'); });
      if (!same) hl.classList.add('hl-active');
      return;
    }
  });

  // ----- type chart highlighting -----
  var persistentTypes = []; // types currently pinned by a click

  function applyTypeHighlight(typeList) {
    var chart = document.querySelector('.typechart');
    if (!chart) return;
    chart.querySelectorAll('.hl').forEach(function (n) { n.classList.remove('hl'); });
    typeList.forEach(function (ty) {
      chart.querySelectorAll('[data-col="' + ty + '"],[data-row="' + ty + '"]').forEach(function (n) {
        n.classList.add('hl');
      });
    });
    // toggle the dim-everything-else mode (indirect highlight via backdrop)
    chart.classList.toggle('has-hl', typeList.length > 0);
    if (!typeList.length) {
      document.querySelectorAll('[data-typehl].hl-active').forEach(function (n) { n.classList.remove('hl-active'); });
    }
  }

  // header hover = temporary highlight on top of the pinned one
  document.querySelector('.content').addEventListener('mouseover', function (e) {
    var th = e.target.closest('.type-th');
    if (th) {
      var ty = th.getAttribute('data-col') || th.getAttribute('data-row');
      applyTypeHighlight(persistentTypes.concat([ty]));
      return;
    }
    // hover a team weakness/resistance bar -> highlight the responsible type-chips
    // and show a per-pokemon breakdown tooltip.
    var ana = e.target.closest('[data-anatype]');
    if (ana) {
      var apid = parseInt(ana.getAttribute('data-anaplayer'), 10);
      var atk = ana.getAttribute('data-anatype');
      var kind = ana.getAttribute('data-anakind');
      highlightResponsibleChips(apid, atk, kind);
      showAnaTooltip(ana, apid, atk, kind);
    }
  });
  document.querySelector('.content').addEventListener('mousemove', function (e) {
    if (anaTip && anaTip.style.display === 'block') positionAnaTooltip(e.clientX, e.clientY);
  });
  document.querySelector('.content').addEventListener('mouseout', function (e) {
    if (e.target.closest('.type-th')) applyTypeHighlight(persistentTypes);
    if (e.target.closest('[data-anatype]')) { clearResponsibleChips(); hideAnaTooltip(); }
  });

  // ----- breakdown tooltip for the weakness/resistance bars -----
  var anaTip = null;
  function ensureAnaTip() {
    if (!anaTip) {
      anaTip = document.createElement('div');
      anaTip.className = 'ana-tip';
      anaTip.style.display = 'none';
      document.body.appendChild(anaTip);
    }
    return anaTip;
  }
  function fmtMult(m) {
    // tidy ×0.25 / ×0.5 / ×2 / ×4 etc.
    return '×' + (Math.round(m * 100) / 100);
  }
  function showAnaTooltip(barEl, playerId, atk, kind) {
    var rows = App.typeBreakdown(playerId, atk, kind);
    if (!rows.length) return;
    var tip = ensureAnaTip();
    var head = '<div class="ana-tip-head">' +
      App.esc(atk.toUpperCase()) + ' — ' +
      (kind === 'weak' ? 'Weaknesses' : 'Resistances') + '</div>';
    var body = rows.map(function (r) {
      var types = r.types.map(function (t) {
        return '<span class="ana-tip-type" style="background:' + App.typeColor(t) + '">' +
          App.esc(t.slice(0, 3).toUpperCase()) + '</span>';
      }).join('');
      return '<div class="ana-tip-row">' +
        '<span class="ana-tip-name">' + App.esc(r.name) + '</span>' +
        types +
        '<span class="ana-tip-mult">' + fmtMult(r.mult) + '</span></div>';
    }).join('');
    tip.innerHTML = head + body;
    tip.style.display = 'block';
    var rect = barEl.getBoundingClientRect();
    positionAnaTooltip(rect.left + rect.width / 2, rect.top);
  }
  function positionAnaTooltip(cx, cy) {
    if (!anaTip) return;
    var pad = 12;
    var w = anaTip.offsetWidth, h = anaTip.offsetHeight;
    var x = cx + pad, y = cy - h - pad;
    if (x + w > window.innerWidth - 4) x = cx - w - pad;
    if (y < 4) y = cy + pad;
    anaTip.style.left = Math.max(4, x) + 'px';
    anaTip.style.top = Math.max(4, y) + 'px';
  }
  function hideAnaTooltip() {
    if (anaTip) anaTip.style.display = 'none';
  }

  // Highlight the type-chips of a player's pokemon that cause weakness/resistance to `atk`.
  function highlightResponsibleChips(playerId, atk, kind) {
    var data = window.TYPE_DATA.forGen(App.state.generation);
    var chart = data.chart, getMult = window.TYPE_DATA.getMult;
    var chips = document.querySelectorAll('.dash-slots .pctype[data-pcplayer="' + playerId + '"]');
    // find the player's column to dim only within it
    var colEl = null;
    chips.forEach(function (c) { if (!colEl) colEl = c.closest('.dash-col'); });
    if (colEl) colEl.classList.add('chips-dim');
    chips.forEach(function (chip) {
      var t = chip.getAttribute('data-pctype');
      var m = getMult(chart, atk, t);
      var responsible = (kind === 'weak') ? (m > 1) : (m < 1);
      chip.classList.toggle('chip-on', responsible);
    });
  }
  function clearResponsibleChips() {
    document.querySelectorAll('.chips-dim').forEach(function (n) { n.classList.remove('chips-dim'); });
    document.querySelectorAll('.pctype.chip-on').forEach(function (n) { n.classList.remove('chip-on'); });
  }

  function handleSetStatus(catchId, playerId, status) {
    var blameId = null;
    if (status === 'dead') {
      var c = App.findCatch(catchId);
      // if no blame yet, ask
      if (c && c.deathBlame == null) {
        blameId = askBlame();
        if (blameId === false) return; // cancelled
      }
    }
    var res = App.setEntryStatus(catchId, playerId, status, blameId);
    App.render();
    if (res && status === 'dead') {
      var blameName = '';
      if (res.blameId != null) {
        var bp = App.playerById(res.blameId);
        blameName = bp ? bp.name : '';
      }
      if (res.cascade) {
        var names = res.killed.map(function (pid) {
          var p = App.playerById(pid); return p ? p.name : '?';
        }).join(', ');
        toast('💀 SOUL-LINK BROKEN on ' + App.esc(res.route) + '!<br>Died too: <b>' + App.esc(names) +
          '</b>' + (blameName ? '<br>Blame: <b>' + App.esc(blameName) + '</b>' : ''), 'death');
      } else {
        toast('💀 Dead' + (blameName ? ' — Blame: <b>' + App.esc(blameName) + '</b>' : ''), 'death');
      }
      var wipe = App.checkWipe();
      if (wipe.length) App.openGameOverModal(wipe);
    } else if (res && res.burnedAll) {
      toast('Encounter on ' + App.esc(res.route) + ' burned for all.');
    }
  }

  function askBlame() {
    var players = App.state.players;
    var lines = players.map(function (p, i) { return (i + 1) + ' = ' + p.name; }).join('\n');
    var ans = prompt('Who is to blame for the death?\n' + lines + '\n\n(enter a number, empty = nobody)', '');
    if (ans === null) return false; // cancelled
    if (ans.trim() === '') return null;
    var idx = parseInt(ans, 10) - 1;
    if (idx >= 0 && idx < players.length) return players[idx].id;
    return null;
  }

  // ---------- input/change delegation ----------
  // Catchrate situational number inputs (turn, level, weight) — live recompute.
  document.querySelector('.content').addEventListener('input', function (e) {
    var ci = e.target.closest('[data-crinput]');
    if (ci && ci.type === 'number') {
      var key = ci.getAttribute('data-crinput');
      var spec = App.CATCH_INPUTS[key];
      var v = parseInt(ci.value, 10);
      if (isNaN(v)) return; // let them finish typing
      if (spec) v = Math.max(spec.min, Math.min(spec.max, v));
      App._catchSel = App._catchSel || { slug: '', status: 'none' };
      App._catchSel.inputs = App._catchSel.inputs || {};
      App._catchSel.inputs[key] = v;
      App._refreshCatchResult();
      return;
    }
  });

  // Catchrate HP bar — live update of label, fill width/colour and ball results.
  document.querySelector('.content').addEventListener('input', function (e) {
    var t = e.target;
    if (t.id !== 'crHp') return;
    var pct = Math.max(1, Math.min(100, parseInt(t.value, 10) || 1));
    var frac = pct / 100;
    App._catchSel = App._catchSel || { slug: '', status: 'none' };
    App._catchSel.hp = frac;
    // Pokémon-game HP bar colour: green > 50%, yellow > 20%, red otherwise.
    var col = frac > 0.5 ? '#5cd664' : (frac > 0.2 ? '#f6c043' : '#e25555');
    var lbl = document.getElementById('crHpVal');
    if (lbl) { lbl.textContent = pct + '%'; lbl.style.color = col; }
    var fill = document.getElementById('crHpFill');
    if (fill) { fill.style.width = pct + '%'; fill.style.background = col; }
    App._refreshCatchResult();
  });

  // Catchrate ball scale — drag along the track; the thumb snaps to the nearest
  // ball marker, and that ball becomes the selected one.
  (function () {
    var dragging = false;

    function snapToPointer(clientX) {
      var track = document.getElementById('crScale');
      if (!track) return;
      var marks = track.querySelectorAll('.cr-scale-mark');
      if (!marks.length) return;
      var rect = track.getBoundingClientRect();
      var x = Math.max(0, Math.min(rect.width, clientX - rect.left));
      // pick the marker whose centre is closest to the pointer
      var bestId = null, bestDist = Infinity;
      marks.forEach(function (mk) {
        var mr = mk.getBoundingClientRect();
        var cx = mr.left + mr.width / 2 - rect.left;
        var d = Math.abs(cx - x);
        if (d < bestDist) { bestDist = d; bestId = mk.getAttribute('data-crball'); }
      });
      if (bestId && (!App._catchSel || App._catchSel.ball !== bestId)) {
        App._catchSel = App._catchSel || { slug: '', status: 'none' };
        App._catchSel.ball = bestId;
        App._refreshCatchResult();
        App._refreshCatchSitHighlight();
      }
    }

    document.querySelector('.content').addEventListener('pointerdown', function (e) {
      // Direct hit on a marker (incl. its sprite/label): select THAT ball and do
      // not start an x-only drag. Stacked markers share an x-position, so x-snap
      // would otherwise always grab the topmost one — making lower ones unclickable.
      var mark = e.target.closest('.cr-scale-mark');
      if (mark) {
        var id = mark.getAttribute('data-crball');
        if (id && (!App._catchSel || App._catchSel.ball !== id)) {
          App._catchSel = App._catchSel || { slug: '', status: 'none' };
          App._catchSel.ball = id;
          App._refreshCatchResult();
          App._refreshCatchSitHighlight();
        }
        return; // no drag from a marker -> clean single click
      }
      // Empty track: start a drag that snaps to the nearest ball by x-position.
      var track = e.target.closest('#crScale');
      if (!track) return;
      dragging = true;
      snapToPointer(e.clientX);
      e.preventDefault();
    });
    document.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      snapToPointer(e.clientX);
    });
    document.addEventListener('pointerup', function () { dragging = false; });
  })();

  document.querySelector('.content').addEventListener('change', function (e) {
    var t = e.target;

    // Catchrate: situational toggle (fishing, night, …) -> recompute
    var ct = t.closest('[data-crinput]');
    if (ct && ct.type === 'checkbox') {
      var key = ct.getAttribute('data-crinput');
      App._catchSel = App._catchSel || { slug: '', status: 'none' };
      App._catchSel.inputs = App._catchSel.inputs || {};
      App._catchSel.inputs[key] = ct.checked;
      App._refreshCatchResult();
      return;
    }

    // start screen: player count change re-renders the name/color fields
    if (t.id === 'newPlayerCount') { App._renderNewPlayerFields(parseInt(t.value, 10)); return; }
    if (t.hasAttribute('data-newpname')) {
      var ni = parseInt(t.getAttribute('data-newpname'), 10);
      if (App._newGameMeta[ni]) App._newGameMeta[ni].name = t.value;
      return;
    }
    if (t.hasAttribute('data-newpcolor')) {
      var nci = parseInt(t.getAttribute('data-newpcolor'), 10);
      if (App._newGameMeta[nci]) { App._newGameMeta[nci].color = t.value; App._renderNewPlayerFields(App._newGameMeta.length); }
      return;
    }

    if (t.id === 'burnAll') { App.state.uncaughtBurnsAll = t.checked; App.markDirty(); return; }

    // player name/color
    if (t.hasAttribute('data-pname')) {
      var pid = parseInt(t.getAttribute('data-pname'), 10);
      var p1 = App.playerById(pid); if (p1) { p1.name = t.value; App.markDirty(); }
      return;
    }
    if (t.hasAttribute('data-pcolor')) {
      var pid2 = parseInt(t.getAttribute('data-pcolor'), 10);
      var p2 = App.playerById(pid2); if (p2) { p2.color = t.value; App.markDirty(); App.render(); }
      return;
    }

    // blame select
    if (t.hasAttribute('data-blame')) {
      var c = App.findCatch(t.getAttribute('data-blame'));
      if (c) { c.deathBlame = t.value ? parseInt(t.value, 10) : null; App.markDirty(); }
      return;
    }

    // pokemon input (datalist)
    if (t.hasAttribute('data-pokeinput')) {
      var slug = nameToSlug(t.value);
      App.setEntryPokemon(t.getAttribute('data-catch'), parseInt(t.getAttribute('data-player'), 10), slug);
      App.render();
      return;
    }

    // entry fields
    if (t.hasAttribute('data-field')) {
      var field = t.getAttribute('data-field');
      var val = (t.type === 'checkbox') ? t.checked : t.value;
      App.setEntryField(t.getAttribute('data-catch'), parseInt(t.getAttribute('data-player'), 10), field, val);
      if (field === 'shiny') App.render();
      return;
    }
  });

  // ---------- New Catch modal ----------
  var modalRoot = document.getElementById('modalRoot');
  App._modalOutcome = 'success';

  function anyRerollChecked() {
    var boxes = modalRoot.querySelectorAll('[data-mreroll]');
    for (var i = 0; i < boxes.length; i++) if (boxes[i].checked) return true;
    return false;
  }

  function applyOutcomeUI() {
    var oc = App._modalOutcome;
    var rerolling = anyRerollChecked();

    var pills = modalRoot.querySelectorAll('[data-moutcome]');
    pills.forEach(function (p) {
      var v = p.getAttribute('data-moutcome');
      var selCls = (v === 'success') ? ' sel-alive' : (v === 'fail') ? ' sel-dead' : ' sel-uncaught';
      p.className = 'pill' + (v === oc ? selCls : '');
    });

    // When a reroll is checked, the outcome is irrelevant (link dies) -> hide buttons,
    // show the reroll hint, and hide the blame field (nobody is blamed on a reroll).
    var outcomeWrap = document.getElementById('modalOutcomeWrap');
    if (outcomeWrap) outcomeWrap.style.display = rerolling ? 'none' : '';
    var rerollHint = document.getElementById('modalRerollHint');
    if (rerollHint) rerollHint.style.display = rerolling ? '' : 'none';

    // blame shown only for a plain fail (not when rerolling)
    var blameWrap = document.getElementById('modalBlameWrap');
    if (blameWrap) blameWrap.style.display = (!rerolling && oc === 'fail') ? '' : 'none';

    // a rerolling player's pokemon picker/inputs are disabled (placeholder, no species)
    App.state.players.forEach(function (p) {
      var box = modalRoot.querySelector('[data-mreroll="' + p.id + '"]');
      var btn = modalRoot.querySelector('[data-mpokebtn="' + p.id + '"]');
      var nick = modalRoot.querySelector('[data-mnick="' + p.id + '"]');
      var shiny = modalRoot.querySelector('[data-mshiny="' + p.id + '"]');
      var on = box && box.checked;
      if (btn) {
        btn.disabled = on;
        if (on) { btn.setAttribute('data-mslug', ''); setPickButton(btn, ''); }
      }
      [nick, shiny].forEach(function (el) { if (el) { el.disabled = on; if (on && el.type === 'text') el.value = ''; } });
    });
  }

  // Update a picker button's sprite + label to reflect the chosen slug.
  function setPickButton(btn, slug) {
    var img = btn.querySelector('.pp-sprite');
    var label = btn.querySelector('.pp-label');
    btn.setAttribute('data-mslug', slug || '');
    if (slug) {
      if (img) img.src = App.spriteUrl(slug, false);
      if (label) label.textContent = App.displayName(slug);
      btn.classList.add('chosen');
    } else {
      if (img) img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>');
      if (label) label.textContent = 'Choose Pokémon…';
      btn.classList.remove('chosen');
    }
  }

  modalRoot.addEventListener('click', function (e) {
    var t = e.target;
    if (t.closest('[data-modalclose]')) { App.closeModal(); return; }
    if (t.closest('#bankPickNewCatch')) { App.openCatchModal(); return; }

    // open the pokemon picker for a player's encounter slot
    var pokeBtn = t.closest('[data-mpokebtn]');
    if (pokeBtn) {
      var p = App.playerById(parseInt(pokeBtn.getAttribute('data-mpokebtn'), 10));
      var typeSel = document.getElementById('modalType');
      var isStatic = typeSel && typeSel.value === 'static';
      App.openPokePicker({
        title: 'Choose Pokémon' + (p ? ' — ' + p.name : ''),
        allowClear: true,
        blockMode: !isStatic, // normal encounter -> grey out claimed lines; static -> all allowed
        onPick: function (slug) { setPickButton(pokeBtn, slug); }
      });
      return;
    }

    // --- Pokémon Details modal ---
    var detailModal = t.closest('.detail-modal');
    if (detailModal) {
      var dC = detailModal.getAttribute('data-detailcatch');
      var dP = parseInt(detailModal.getAttribute('data-detailplayer'), 10);
      // change pokemon via picker (type-aware block; own catch + own line allowed)
      if (t.closest('#detailPokeBtn')) {
        var cc = App.findCatch(dC);
        var curEntry = App.findEntry(dC, dP);
        App.openPokePicker({
          title: 'Change Pokémon',
          blockMode: cc && cc.catchType !== 'static',
          excludeCatchId: dC,
          allowFamily: curEntry ? App.familyOf(curEntry.pokemon) : null,
          onPick: function (slug) {
            if (!slug) return;
            var hit = App.checkPickAllowed(dC, dP, slug);
            if (hit) { toast(App.esc(App.displayName(slug) + ' — ' + App.displayName(hit.slug) + ' line already caught on ' + hit.route), 'death'); return; }
            var btn = document.getElementById('detailPokeBtn');
            if (btn) setPickButton(btn, slug);
          }
        });
        return;
      }
      // status pills
      var sp = t.closest('[data-dstatus]');
      if (sp) {
        detailModal.querySelectorAll('[data-dstatus]').forEach(function (n) {
          n.className = 'pill' + (n === sp ? ' sel-' + n.getAttribute('data-dstatus') : '');
        });
        detailModal.setAttribute('data-pendingstatus', sp.getAttribute('data-dstatus'));
        return;
      }
      // save
      if (t.closest('#detailSave')) { saveDetail(detailModal, dC, dP); return; }
    }

    // Game Over: "I made a mistake" -> revert the death that caused the wipe
    if (t.closest('#undoDeath')) {
      if (App.undoLastDeath()) {
        App.closeModal();
        App.render();
        App.logRun('info', '↩ undid the last death (misclick correction)');
        toast('↩ Death undone — the run continues.');
      } else {
        toast('Nothing to undo.', 'death');
      }
      return;
    }

    // Game Over: restart with same setup, +1 try
    if (t.closest('#restartRun')) {
      App.restartSameSetup();
      App.closeModal();
      App.render();
      toast('New attempt — Try #' + App.state.tryCount + '. Good luck!');
      return;
    }

    // bank-pick item -> bring the whole link to team
    var bpi = t.closest('[data-bpcatch]');
    if (bpi) {
      var ok = App.moveEntry(bpi.getAttribute('data-bpcatch'), parseInt(bpi.getAttribute('data-bpplayer'), 10), 'team');
      App.closeModal();
      if (!ok) toast('Team is full (max 6).');
      App.render();
      return;
    }

    // outcome pill
    var oc = t.closest('[data-moutcome]');
    if (oc) { App._modalOutcome = oc.getAttribute('data-moutcome'); applyOutcomeUI(); return; }

    // save
    if (t.closest('#modalSave')) { saveModalCatch(); return; }
  });

  function saveModalCatch() {
    var route = document.getElementById('modalRoute').value;
    var type = document.getElementById('modalType').value;
    var outcome = App._modalOutcome || 'success';
    if (!route) { toast('Please choose a route.'); return; }
    if (!App.canAddCatch(route, type)) {
      toast('There is already a normal encounter on ' + App.esc(route) + '. Use "Static" for more.', 'death');
      return;
    }

    // gather per-player input incl. the reroll checkbox
    var payload = {};
    var anyPokemon = false, anyReroll = false;
    App.state.players.forEach(function (p) {
      var rerollBox = modalRoot.querySelector('[data-mreroll="' + p.id + '"]');
      var isReroll = rerollBox ? rerollBox.checked : false;
      if (isReroll) anyReroll = true;
      var pokeBtn = modalRoot.querySelector('[data-mpokebtn="' + p.id + '"]');
      var nickInput = modalRoot.querySelector('[data-mnick="' + p.id + '"]');
      var shinyInput = modalRoot.querySelector('[data-mshiny="' + p.id + '"]');
      var slug = isReroll ? '' : (pokeBtn ? pokeBtn.getAttribute('data-mslug') : '');
      if (slug) anyPokemon = true;
      payload[p.id] = {
        pokemon: slug,
        nickname: nickInput ? nickInput.value : '',
        shiny: shinyInput ? shinyInput.checked : false,
        reroll: isReroll
      };
    });

    // when rerolling, the outcome is irrelevant; otherwise we need valid input
    if (!anyReroll) {
      if (!anyPokemon) { toast('Enter at least one pokémon that was faced.'); return; }
      if (outcome === 'fail') {
        var blameSel = document.getElementById('modalBlame');
        var blameId = blameSel && blameSel.value ? parseInt(blameSel.value, 10) : null;
        if (blameId == null) { toast('For a "Fail" please pick who is to blame.'); return; }
        payload.blameId = blameId;
      }
    } else {
      // require at least one non-reroll player to have a pokemon? No — all could reroll.
      // (If everyone rerolled it's just a dead placeholder link, which is valid.)
    }

    // Dex / species clause — only for players who actually caught something
    // (non-reroll), normal encounters, outcomes that record a real species.
    if (type !== 'static' && (outcome === 'success' || outcome === 'fail' || anyReroll)) {
      var blockedMsg = null;
      App.state.players.some(function (p) {
        if (payload[p.id].reroll) return false; // placeholder claims nothing
        var slug = payload[p.id].pokemon;
        if (!slug) return false;
        // a player who didn't catch (intentional w/o reroll) still records species but
        // intentional means uncaught -> doesn't claim; only success/fail/reroll-death claim.
        var willBeCaught = anyReroll || outcome === 'success' || outcome === 'fail';
        if (!willBeCaught) return false;
        var hit = App.isFamilyBlocked(slug, null);
        if (hit) {
          blockedMsg = App.displayName(slug) + ' is blocked — the ' + App.displayName(hit.slug) +
            ' line was already caught on ' + hit.route + '. Use a Static encounter or mark "Too many rerolls".';
          return true;
        }
        return false;
      });
      if (blockedMsg) { toast(App.esc(blockedMsg), 'death'); return; }
    }

    App.createCatch(route, type, outcome, payload);
    App.closeModal();
    App.render();

    if (anyReroll) {
      var names = App.state.players.filter(function (p) { return payload[p.id].reroll; })
        .map(function (p) { return p.name; }).join(', ');
      toast('🔁 Too many rerolls (' + App.esc(names) + ') on ' + App.esc(route) +
        ' — whole link dead, no blame. Rerolled players got a placeholder.', 'death');
      var wipeR = App.checkWipe();
      if (wipeR.length) App.openGameOverModal(wipeR);
    } else if (outcome === 'fail') {
      var bp = App.playerById(payload.blameId);
      toast('💀 Failed attempt on ' + App.esc(route) + ' — encounter is dead.' +
        (bp ? '<br>Blame: <b>' + App.esc(bp.name) + '</b> (+1 death)' : ''), 'death');
      var wipe = App.checkWipe();
      if (wipe.length) App.openGameOverModal(wipe);
    } else if (outcome === 'intentional') {
      toast('✕ Encounter on ' + App.esc(route) + ' faced but skipped on purpose.');
    } else {
      toast('✓ Encounter on ' + App.esc(route) + ' caught.');
    }
  }

  // Save edits from the Pokémon Details modal.
  function saveDetail(modal, catchId, playerId) {
    var entry = App.findEntry(catchId, playerId);
    if (!entry) { App.closeModal(); return; }

    var pokeBtn = document.getElementById('detailPokeBtn');
    var newSlug = pokeBtn ? pokeBtn.getAttribute('data-mslug') : entry.pokemon;
    var nick = document.getElementById('detailNick');
    var shiny = document.getElementById('detailShiny');
    var routeSel = document.getElementById('detailRoute');
    var newStatus = modal.getAttribute('data-pendingstatus') || entry.status;
    var newRoute = routeSel ? routeSel.value : null;

    // validate pokemon change against the dex clause (own catch + own line allowed)
    if (newSlug && newSlug !== entry.pokemon) {
      var hit = App.checkPickAllowed(catchId, playerId, newSlug);
      if (hit) {
        toast(App.esc(App.displayName(newSlug) + ' is blocked — ' + App.displayName(hit.slug) +
          ' line already caught on ' + hit.route + '.'), 'death');
        return;
      }
    }

    // per-pokemon fields
    entry.pokemon = newSlug || '';
    App.setEntryField(catchId, playerId, 'nickname', nick ? nick.value : '');
    App.setEntryField(catchId, playerId, 'shiny', shiny ? shiny.checked : false);

    // link-wide: route
    if (newRoute != null) App.setCatchRoute(catchId, newRoute);

    // link-wide: status (only alive <-> dead)
    var prevStatus = entry.status;
    if (newStatus !== prevStatus) {
      if (newStatus === 'dead') {
        App.killLink(catchId, playerId); // whole link dies (no extra blame beyond owner)
      } else if (newStatus === 'alive') {
        App.reviveLink(catchId);
      }
    }

    App.recomputeDeaths();
    App.markDirty();
    App.closeModal();
    App.render();
    toast('✓ Updated.');

    if (newStatus === 'dead' && prevStatus !== 'dead') {
      var wipe = App.checkWipe();
      if (wipe.length) App.openGameOverModal(wipe);
    }
  }

  // modal change: route selection updates hint
  modalRoot.addEventListener('change', function (e) {
    // per-player reroll checkbox toggles the outcome UI
    if (e.target.hasAttribute && e.target.hasAttribute('data-mreroll')) { applyOutcomeUI(); return; }
    if (e.target.id === 'modalRoute' || e.target.id === 'modalType') {
      var route = document.getElementById('modalRoute').value;
      var type = document.getElementById('modalType').value;
      var hint = document.getElementById('modalRouteHint');
      if (!hint) return;
      if (!route) { hint.textContent = ''; return; }
      var normal = App.routeCatchCount(route, 'normal');
      var statics = App.routeCatchCount(route, 'static');
      var msg = 'On ' + route + ': ' + normal + ' normal, ' + statics + ' static.';
      if (type === 'normal' && normal > 0) msg += ' ⚠ Normal encounter already used — pick "Static".';
      hint.textContent = msg;
    }
  });

  // ---------- Pokémon picker overlay ----------
  var pickerRoot = document.getElementById('pickerRoot');

  pickerRoot.addEventListener('click', function (e) {
    var t = e.target;
    if (t.closest('[data-pickclose]')) { App.closePokePicker(); return; }

    // tab switch
    var tab = t.closest('[data-picktab]');
    if (tab) {
      App._pickerTab = tab.getAttribute('data-picktab');
      pickerRoot.querySelectorAll('.pick-tab').forEach(function (n) { n.classList.remove('active'); });
      tab.classList.add('active');
      App._applyPickerFilter();
      return;
    }

    // pick an item (or the Clear button, which has data-pickslug="")
    var item = t.closest('[data-pickslug]');
    if (item) {
      if (item.getAttribute('data-blocked') === '1') {
        toast(App.esc(item.getAttribute('title')), 'death');
        return; // blocked line — not selectable
      }
      var slug = item.getAttribute('data-pickslug');
      var cb = App._pickerCb;
      App.closePokePicker();
      if (cb) cb(slug);
      return;
    }
  });

  pickerRoot.addEventListener('input', function (e) {
    if (e.target.id === 'pickSearch') {
      App._pickerQuery = e.target.value;
      App._applyPickerFilter();
    }
  });

  // Esc closes the picker (then the modal stays open)
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && pickerRoot.style.display !== 'none') App.closePokePicker();
  });

  // ---------- file import ----------
  document.getElementById('importFile').addEventListener('change', function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        App.importJSON(reader.result);
        App.render();
        toast('Import successful ✓');
        autoStartRoom(App.state.game); // loaded save becomes a live room too
      } catch (err) {
        toast('Import failed: ' + App.esc(err.message), 'death');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  // ---------- Bank drag & drop (per-player team <-> bank) ----------
  var content = document.querySelector('.content');
  var dragData = null; // { catchId, playerId }

  content.addEventListener('dragstart', function (e) {
    var card = e.target.closest('[data-dragcatch]');
    if (!card) return;
    dragData = {
      catchId: card.getAttribute('data-dragcatch'),
      playerId: parseInt(card.getAttribute('data-dragplayer'), 10)
    };
    card.classList.add('dragging');
    if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragData.catchId); }
  });

  content.addEventListener('dragend', function () {
    var c = content.querySelector('.bcard.dragging');
    if (c) c.classList.remove('dragging');
    content.querySelectorAll('.bank-zone.dragover').forEach(function (z) { z.classList.remove('dragover'); });
    dragData = null;
  });

  content.addEventListener('dragover', function (e) {
    var zone = e.target.closest('.bank-zone');
    if (!zone || !dragData) return;
    // only allow dropping onto this dragged pokemon's own player column
    if (parseInt(zone.getAttribute('data-zoneplayer'), 10) !== dragData.playerId) return;
    e.preventDefault(); // allow drop
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    zone.classList.add('dragover');
  });

  content.addEventListener('dragleave', function (e) {
    var zone = e.target.closest('.bank-zone');
    if (zone && !zone.contains(e.relatedTarget)) zone.classList.remove('dragover');
  });

  content.addEventListener('drop', function (e) {
    var zone = e.target.closest('.bank-zone');
    if (!zone || !dragData) return;
    var zonePlayer = parseInt(zone.getAttribute('data-zoneplayer'), 10);
    if (zonePlayer !== dragData.playerId) return; // wrong player's column
    e.preventDefault();
    var target = zone.getAttribute('data-zone'); // 'team' | 'bank'
    // soul-linked: the whole link moves together
    var ok = App.moveEntry(dragData.catchId, dragData.playerId, target);
    if (!ok && target === 'team') toast("Can't move to team — a partner's team is full (max 6).");
    dragData = null;
    App.render();
  });

  // ---------- live cursors ----------
  // Broadcast our pointer to the room (element-anchored). Holding the RIGHT
  // mouse button turns on a fading "laser pointer" trail for everyone.
  (function () {
    var drawing = false;
    var lastSent = 0;

    function send(e) {
      if (!App.room || !App.room.code || !App.pushCursor) return;
      var now = Date.now();
      if (now - lastSent < 30) return; // local rate limit (pushCursor throttles too)
      lastSent = now;
      var a = App.buildCursorAnchor(e.target, e.clientX, e.clientY);
      a.drawing = drawing;
      a.tab = (App.state && App.state.activeTab) || null; // coarse "where am I"
      App.pushCursor(a);
    }

    document.addEventListener('mousemove', send);

    // right button held = drawing mode; suppress the browser context menu so it
    // doesn't interrupt the gesture
    document.addEventListener('mousedown', function (e) {
      if (e.button === 2) { drawing = true; send(e); }
    });
    document.addEventListener('mouseup', function (e) {
      if (e.button === 2) { drawing = false; send(e); }
    });
    document.addEventListener('contextmenu', function (e) {
      // only swallow the menu while actually in a room
      if (App.room && App.room.code) e.preventDefault();
    });

    // pull our cursor when the mouse leaves the window
    document.addEventListener('mouseleave', function () {
      drawing = false;
      if (App.clearCursor) App.clearCursor();
    });
  })();

  // ---------- unload guard ----------
  window.addEventListener('beforeunload', function (e) {
    if (App.dirty) {
      e.preventDefault();
      e.returnValue = 'Unsaved changes will be lost!';
      return e.returnValue;
    }
  });

  // ---------- boot ----------
  App.state.activeTab = 'Setup';
  App.render();

})(window.App);

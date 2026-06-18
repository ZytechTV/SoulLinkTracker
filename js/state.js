/* Central application state — single source of truth.
   No localStorage / no server. Persistence is JSON export/import only. */

window.App = window.App || {};

(function (App) {
  'use strict';

  var DEFAULT_COLORS = ['#e23b3b', '#3b6fe2', '#3bbf57', '#e2c63b'];

  function uuid() {
    return 'c-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function makePlayer(id) {
    return {
      id: id,
      name: 'Player ' + id,
      color: DEFAULT_COLORS[(id - 1) % DEFAULT_COLORS.length],
      deaths: 0,        // deaths blamed on this player in the CURRENT run
      carriedDeaths: 0  // deaths from previous runs (kept across restarts)
    };
  }

  function freshState() {
    return {
      game: 'HeartGold',
      generation: 4,
      players: [makePlayer(1), makePlayer(2)],
      badges: [false, false, false, false, false, false, false, false],
      catches: [],
      // chronological run log of important events (persisted + shared in a room)
      runLog: [],
      // config
      uncaughtBurnsAll: true,
      // attempt number for this save (incremented on a wipe restart)
      tryCount: 1,
      // true once a game has been started (new game) or loaded (import)
      started: false,
      // UI-only (not exported as gameplay but harmless to keep)
      activeTab: 'Setup'
    };
  }

  // The live state object.
  App.state = freshState();

  // Flag tracking unsaved changes for the beforeunload warning.
  App.dirty = false;

  // ---- mutation helpers ----
  App.markDirty = function () {
    App.dirty = true;
    // mirror local edits to the live room (no-op when not in a room)
    if (App.pushRoomState) App.pushRoomState();
  };

  App.resetState = function () {
    App.state = freshState();
    App.dirty = false;
  };

  // ---- undo snapshot (for "I made a mistake" after a wipe) ----
  // A single deep-cloned snapshot of the run, taken right before a death-causing
  // action. Restoring it reverts the death (and the wipe it triggered).
  App._undoSnap = null;
  App.snapshotForUndo = function () {
    try { App._undoSnap = JSON.parse(JSON.stringify(App.serializeState())); }
    catch (e) { App._undoSnap = null; }
  };
  App.canUndo = function () { return !!App._undoSnap; };
  App.undoLastDeath = function () {
    if (!App._undoSnap) return false;
    var snap = App._undoSnap;
    App._undoSnap = null;          // single-use
    App.applyState(snap, true);    // restore the pre-death state (keep current tab)
    App.markDirty();
    return true;
  };

  // Start a fresh game with chosen game key, player count, names, colors.
  App.startNewGame = function (gameKey, playerCount, playerMeta) {
    var s = freshState();
    var g = window.REGION_DATA.get(gameKey);
    if (g) { s.game = gameKey; s.generation = g.gen; }
    var n = Math.max(2, Math.min(4, playerCount | 0));
    s.players = [];
    for (var i = 1; i <= n; i++) {
      var p = makePlayer(i);
      var meta = playerMeta && playerMeta[i - 1];
      if (meta) {
        if (meta.name) p.name = meta.name;
        if (meta.color) p.color = meta.color;
      }
      s.players.push(p);
    }
    s.started = true;
    s.activeTab = 'Dashboard';
    s.tryCount = 1;
    App.state = s;
    App.markDirty();
  };

  // Restart after a wipe: same game + players/colors, empty run, tryCount + 1.
  App.restartSameSetup = function () {
    var prev = App.state;
    var s = freshState();
    s.game = prev.game;
    s.generation = prev.generation;
    s.players = prev.players.map(function (p) {
      // carry the finished run's deaths into the lifetime (run-spanning) total
      return {
        id: p.id, name: p.name, color: p.color,
        deaths: 0,
        carriedDeaths: (p.carriedDeaths || 0) + (p.deaths || 0)
      };
    });
    s.uncaughtBurnsAll = prev.uncaughtBurnsAll;
    s.started = true;
    s.activeTab = 'Dashboard';
    s.tryCount = (prev.tryCount || 1) + 1;
    s.runLog = (prev.runLog || []).slice(-300); // keep history across restarts
    App.state = s;
    App._undoSnap = null; // a new attempt invalidates any pending death-undo
    App.logRun('wipe', '☠ run wiped — restarting as Try #' + s.tryCount);
    App.markDirty();
  };

  // Count of a player's living team pokemon.
  App.aliveTeamCount = function (playerId) {
    return App.teamEntries(playerId).filter(function (x) {
      return x.entry.status === 'alive';
    }).length;
  };

  App.setPlayerCount = function (n) {
    n = Math.max(2, Math.min(4, n | 0));
    var players = App.state.players;
    while (players.length < n) players.push(makePlayer(players.length + 1));
    while (players.length > n) {
      var removed = players.pop();
      // drop entries belonging to removed players
      removeEntriesForPlayer(removed.id);
    }
    App.markDirty();
  };

  function removeEntriesForPlayer(playerId) {
    App.state.catches.forEach(function (c) {
      c.entries = c.entries.filter(function (e) { return e.playerId !== playerId; });
    });
    App.state.catches = App.state.catches.filter(function (c) { return c.entries.length > 0; });
  }

  App.setGame = function (gameKey) {
    var g = window.REGION_DATA.get(gameKey);
    if (!g) return;
    App.state.game = gameKey;
    App.state.generation = g.gen;
    // keep badges array length 8
    if (!App.state.badges || App.state.badges.length !== 8) {
      App.state.badges = [false, false, false, false, false, false, false, false];
    }
    App.markDirty();
  };

  // ---- derived data ----
  App.regionInfo = function () {
    var g = window.REGION_DATA.get(App.state.game);
    return g ? g.region : null;
  };

  App.playerById = function (id) {
    return App.state.players.find(function (p) { return p.id === id; }) || null;
  };

  // Recompute per-player kill-count (deaths the player is to blame for).
  // Each killed soul-link has exactly one blamed player (deathBlame).
  App.recomputeDeaths = function () {
    var counts = {};
    App.state.players.forEach(function (p) { counts[p.id] = 0; });
    App.state.catches.forEach(function (c) {
      var anyDead = c.entries.some(function (e) { return e.status === 'dead'; });
      if (anyDead && c.deathBlame != null && counts.hasOwnProperty(c.deathBlame)) {
        counts[c.deathBlame]++;
      }
    });
    App.state.players.forEach(function (p) {
      p.deaths = counts[p.id];                              // current run
      p.totalDeaths = (p.carriedDeaths || 0) + p.deaths;    // across all runs
    });
  };

  // Totals for the status bar.
  App.totals = function () {
    var caught = 0, dead = 0;
    App.state.catches.forEach(function (c) {
      c.entries.forEach(function (e) {
        if (e.status === 'alive') caught++;
        else if (e.status === 'dead') { caught++; dead++; }
      });
    });
    return { caught: caught, dead: dead };
  };

  // All entries flattened, with their parent catch reference.
  App.allEntries = function () {
    var out = [];
    App.state.catches.forEach(function (c) {
      c.entries.forEach(function (e) {
        out.push({ entry: e, route: c.route, catchId: c.id });
      });
    });
    return out;
  };

  // Team entries for a player (location team, status alive/dead).
  App.teamEntries = function (playerId) {
    var out = [];
    App.state.catches.forEach(function (c) {
      c.entries.forEach(function (e) {
        if (e.playerId === playerId && e.location === 'team' && e.status !== 'uncaught') {
          out.push({ entry: e, route: c.route, catchId: c.id });
        }
      });
    });
    return out;
  };

  // ---- export / import ----
  // Pure serializer: the savefile/room shape of the current run (no side effects
  // beyond recomputing derived death counts). Used by export AND live sync.
  App.serializeState = function () {
    App.recomputeDeaths();
    return {
      game: App.state.game,
      generation: App.state.generation,
      players: App.state.players,
      badges: App.state.badges,
      catches: App.state.catches,
      runLog: (App.state.runLog || []).slice(-300), // cap history size
      uncaughtBurnsAll: App.state.uncaughtBurnsAll,
      tryCount: App.state.tryCount || 1,
      started: true
    };
  };

  // ---- run log -------------------------------------------------------------
  // Append a run event to the shared, persisted log. `kind` groups events for
  // icons/filtering; `actor` is who did it (room name, or fallback). Mirrored to
  // the room and saved in JSON via serializeState. Does NOT mark dirty by itself
  // beyond the normal push (caller already mutates state).
  App.logRun = function (kind, text, actor) {
    if (!App.state.runLog) App.state.runLog = [];
    App.state.runLog.push({
      t: Date.now(),
      kind: kind || 'info',
      text: String(text || ''),
      actor: actor || App.currentActor(),
      try: App.state.tryCount || 1
    });
    if (App.state.runLog.length > 300) App.state.runLog = App.state.runLog.slice(-300);
    // share/persist immediately (mirrors to room, flags dirty)
    App.markDirty();
  };

  // Who is acting right now: the room display name if live, else first player.
  App.currentActor = function () {
    if (App.room && App.room.name) return App.room.name;
    var p = App.state.players && App.state.players[0];
    return (p && p.name) || 'You';
  };

  // ---- console log (local, ephemeral: sync status, joins/leaves, errors) ----
  App.consoleLog = App.consoleLog || [];
  App._logListeners = App._logListeners || [];
  App.onLogChange = function (fn) { App._logListeners.push(fn); };
  App.logConsole = function (level, text) {
    App.consoleLog.push({ t: Date.now(), level: level || 'info', text: String(text || '') });
    if (App.consoleLog.length > 200) App.consoleLog = App.consoleLog.slice(-200);
    App._logListeners.forEach(function (fn) { try { fn(); } catch (e) {} });
  };

  App.exportJSON = function () {
    var data = App.serializeState();
    var json = JSON.stringify(data, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    var stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    a.href = url;
    a.download = 'soullink-' + App.state.game.toLowerCase().replace(/\s+/g, '') + '-' + stamp + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    App.dirty = false;
  };

  App.importJSON = function (text) {
    var data = JSON.parse(text); // throws on bad JSON -> caller handles
    App.applyState(data);
  };

  // Firebase RTDB drops empty arrays (-> null/undefined) and turns sparse arrays
  // into objects keyed by index. Normalize any of those back into a plain array.
  function toArray(v) {
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object') {
      // object form {0:..,1:..} -> ordered array (numeric keys sorted)
      return Object.keys(v)
        .sort(function (a, b) { return (+a) - (+b); })
        .map(function (k) { return v[k]; });
    }
    return []; // null / undefined / scalar
  }

  // Replace App.state from a parsed save/room object (validates + normalizes).
  // keepTab: if true, the current activeTab is preserved (used by live sync so an
  // incoming update doesn't yank a remote user back to the Dashboard).
  App.applyState = function (data, keepTab) {
    // tolerate Firebase's array quirks: players/catches may arrive as objects
    // or be missing entirely (empty). Only a missing/empty players list is fatal.
    var players = toArray(data && data.players);
    var catches = toArray(data && data.catches);
    if (!data || !players.length) {
      throw new Error('Invalid data: required fields are missing.');
    }
    var prevTab = App.state && App.state.activeTab;
    var s = freshState();
    s.game = data.game || s.game;
    s.generation = data.generation || (window.REGION_DATA.get(s.game) || {}).gen || s.generation;
    s.players = players.map(function (p, i) {
      return {
        id: p.id != null ? p.id : i + 1,
        name: p.name || ('Player ' + (i + 1)),
        color: p.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length],
        deaths: p.deaths || 0,
        carriedDeaths: p.carriedDeaths || 0
      };
    });
    var badgesArr = toArray(data.badges);
    s.badges = (badgesArr.length === 8)
      ? badgesArr.map(Boolean)
      : [false, false, false, false, false, false, false, false];
    s.catches = catches.map(function (c) {
      return {
        id: c.id || uuid(),
        route: c.route || '',
        entries: toArray(c.entries).map(function (e) {
          return {
            playerId: e.playerId,
            pokemon: e.pokemon || '',
            nickname: e.nickname || '',
            status: ['alive', 'dead', 'uncaught'].indexOf(e.status) >= 0 ? e.status : 'alive',
            location: e.location === 'bank' ? 'bank' : 'team',
            shiny: !!e.shiny,
            reroll: !!e.reroll
          };
        }),
        catchType: c.catchType === 'static' ? 'static' : 'normal',
        outcome: ['success', 'intentional', 'fail'].indexOf(c.outcome) >= 0 ? c.outcome : 'success',
        reroll: !!c.reroll,
        deathBlame: c.deathBlame != null ? c.deathBlame : null
      };
    });
    s.runLog = toArray(data.runLog).map(function (e) {
      return {
        t: typeof e.t === 'number' ? e.t : Date.now(),
        kind: e.kind || 'info',
        text: String(e.text || ''),
        actor: e.actor || '',
        try: e.try || 1
      };
    });
    if (typeof data.uncaughtBurnsAll === 'boolean') s.uncaughtBurnsAll = data.uncaughtBurnsAll;
    s.tryCount = (typeof data.tryCount === 'number' && data.tryCount >= 1) ? data.tryCount : 1;
    s.started = true;
    s.activeTab = (keepTab && prevTab && prevTab !== 'Setup') ? prevTab : 'Dashboard';
    App.state = s;
    App.recomputeDeaths();
    App.dirty = false;
  };

  // expose helpers
  App.uuid = uuid;
  App.makePlayer = makePlayer;
  App.DEFAULT_COLORS = DEFAULT_COLORS;

})(window.App);

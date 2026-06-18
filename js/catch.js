/* Catch + Soul-Link logic.
   A catch = one route entry holding one pokemon per player.
   All pokemon in a catch share fate (soul-linked). */

window.App = window.App || {};

(function (App) {
  'use strict';

  // Create an encounter with one entry per current player.
  // catchType: 'normal' | 'static'
  // outcome: 'success'      -> all entries alive, placed in team
  //          'intentional'  -> faced but not caught on purpose: entries uncaught,
  //                            pokemon names are still recorded (kept in the bank/log).
  //          'fail'         -> catch happened but failed: entries created DEAD,
  //                            blameId player gets a kill-count.
  // entriesPayload keyed by playerId: { <playerId>: { pokemon, shiny, nickname, reroll } }
  //   plus optional entriesPayload.blameId for the 'fail' case.
  // Per-player "reroll": that player found only already-caught species -> placeholder
  //   (no pokemon, no dex claim). If ANY player rerolled, the whole link dies (DEAD,
  //   bank, NO blame/kill-count) regardless of the chosen outcome — other players keep
  //   their (now dead) recorded pokemon, which still claim their evolution line.
  App.createCatch = function (route, catchType, outcome, entriesPayload) {
    outcome = ['success', 'intentional', 'fail'].indexOf(outcome) >= 0 ? outcome : 'success';
    entriesPayload = entriesPayload || {};

    var anyReroll = App.state.players.some(function (p) {
      return entriesPayload[p.id] && entriesPayload[p.id].reroll;
    });

    // effective status of the catch
    var effOutcome = anyReroll ? 'fail' : outcome; // reroll forces a death
    var deadOutcome = effOutcome === 'fail';
    var status = effOutcome === 'success' ? 'alive' : (deadOutcome ? 'dead' : 'uncaught');

    // a failed/reroll encounter creates dead entries -> snapshot so it can be undone
    if (deadOutcome) App.snapshotForUndo();

    var c = {
      id: App.uuid(),
      route: route || '',
      catchType: catchType === 'static' ? 'static' : 'normal',
      outcome: effOutcome,
      reroll: anyReroll,
      entries: App.state.players.map(function (p) {
        var payload = entriesPayload[p.id] || {};
        var isReroll = !!payload.reroll;
        // Placement: success -> team (unless full), everything else -> bank
        var loc;
        if (status === 'alive') {
          loc = App.teamEntries(p.id).length < 6 ? 'team' : 'bank';
        } else {
          loc = 'bank';
        }
        return {
          playerId: p.id,
          // a rerolling player has no pokemon (placeholder) -> claims nothing
          pokemon: isReroll ? '' : (payload.pokemon || ''),
          nickname: isReroll ? '' : (payload.nickname || ''),
          status: status,
          location: loc,
          shiny: isReroll ? false : !!payload.shiny,
          reroll: isReroll
        };
      }),
      // a reroll death is bad luck -> nobody is to blame
      deathBlame: (deadOutcome && !anyReroll && entriesPayload.blameId != null)
        ? entriesPayload.blameId : null
    };
    App.state.catches.push(c);
    App.recomputeDeaths();

    // run-log entry describing the encounter outcome
    var mons = c.entries.filter(function (e) { return e.pokemon; })
      .map(function (e) {
        var pl = App.playerById(e.playerId);
        return (App.displayName ? App.displayName(e.pokemon) : e.pokemon) +
          (pl ? ' (' + pl.name + ')' : '');
      }).join(', ');
    var verb = status === 'alive' ? 'caught' : (status === 'dead' ? 'lost (dead)' : 'skipped');
    var typeLbl = c.catchType === 'static' ? 'static ' : '';
    App.logRun('catch', 'new ' + typeLbl + 'encounter on ' + (c.route || '?') +
      ' — ' + verb + (mons ? ': ' + mons : '') + (anyReroll ? ' [reroll death]' : ''));

    App.markDirty();
    return c;
  };

  // ----- Dex / species clause -----
  // A family counts as "claimed" once it was actually caught (status alive or dead)
  // in ANY encounter — normal OR static. (Static pokemon still occupy the dex slot.)
  // The asymmetry is enforced by the caller: a *static* encounter is allowed to reuse
  // a claimed family (it is exempt from the block), but a *normal* encounter is not.
  // So: Normal X then Static X = ok; Static X then Normal X = blocked (reroll needed).
  // Returns familyId -> { route, catchId, slug } for the first claim, excluding excludeCatchId.
  App.claimedFamilies = function (excludeCatchId) {
    var map = {};
    App.state.catches.forEach(function (c) {
      if (c.id === excludeCatchId) return;
      c.entries.forEach(function (e) {
        if (e.status !== 'alive' && e.status !== 'dead') return; // must have been caught
        var fam = App.familyOf(e.pokemon);
        if (fam == null) return;
        if (!map[fam]) map[fam] = { route: c.route, catchId: c.id, slug: e.pokemon, type: c.catchType };
      });
    });
    return map;
  };

  // Is this family already claimed somewhere else?
  // excludeCatchId lets two players in the SAME encounter share a species.
  App.isFamilyBlocked = function (slug, excludeCatchId) {
    var fam = App.familyOf(slug);
    if (fam == null) return null;
    var claimed = App.claimedFamilies(excludeCatchId);
    return claimed[fam] || null; // {route,catchId,slug,type} or null
  };

  // How many catches already exist on a route (by type).
  App.routeCatchCount = function (route, catchType) {
    return App.state.catches.filter(function (c) {
      return c.route === route && (!catchType || c.catchType === catchType);
    }).length;
  };

  // Whether a new normal catch is allowed on this route (max 1 normal; static unlimited).
  App.canAddCatch = function (route, catchType) {
    if (catchType === 'static') return true;
    return App.routeCatchCount(route, 'normal') === 0;
  };

  App.deleteCatch = function (catchId) {
    App.state.catches = App.state.catches.filter(function (c) { return c.id !== catchId; });
    App.recomputeDeaths();
    App.markDirty();
  };

  App.findCatch = function (catchId) {
    return App.state.catches.find(function (c) { return c.id === catchId; }) || null;
  };

  App.findEntry = function (catchId, playerId) {
    var c = App.findCatch(catchId);
    if (!c) return null;
    return c.entries.find(function (e) { return e.playerId === playerId; }) || null;
  };

  // Set a status on one entry; cascade soul-link death if needed.
  // Returns a result describing the cascade for the toast.
  App.setEntryStatus = function (catchId, playerId, newStatus, blameId) {
    var c = App.findCatch(catchId);
    if (!c) return null;
    var entry = c.entries.find(function (e) { return e.playerId === playerId; });
    if (!entry) return null;

    var result = { cascade: false, killed: [], blameId: null, route: c.route };

    if (newStatus === 'dead') {
      App.snapshotForUndo(); // allow undoing this death
      if (blameId != null) c.deathBlame = blameId;
      result.blameId = c.deathBlame;

      var newlyKilled = [];
      c.entries.forEach(function (e) {
        if (e.status !== 'dead' && e.status !== 'uncaught') {
          if (e.playerId !== playerId) {
            newlyKilled.push(e.playerId);
          }
          e.status = 'dead'; // dead pokemon stay where they are (team keeps gravestone)
        }
      });
      // ensure the triggering entry is dead
      entry.status = 'dead';

      result.cascade = newlyKilled.length > 0;
      result.killed = newlyKilled;
    } else if (newStatus === 'uncaught') {
      entry.status = 'uncaught';
      entry.pokemon = '';
      if (App.state.uncaughtBurnsAll) {
        // burned encounter for everyone on this route
        c.entries.forEach(function (e) {
          if (e.status === 'alive') {
            e.status = 'uncaught';
            e.pokemon = '';
          }
        });
        result.burnedAll = true;
      }
    } else {
      // alive (revive / un-mark)
      entry.status = 'alive';
      if (entry.location !== 'team' && entry.location !== 'bank') entry.location = 'bank';
      // if the whole catch had a blame and nothing is dead anymore, clear it
      var anyDead = c.entries.some(function (e) { return e.status === 'dead'; });
      if (!anyDead) c.deathBlame = null;
    }

    App.recomputeDeaths();
    App.markDirty();
    return result;
  };

  App.setEntryPokemon = function (catchId, playerId, slug, displayName) {
    var entry = App.findEntry(catchId, playerId);
    if (!entry) return;
    entry.pokemon = slug || '';
    if (entry.status === 'uncaught' && slug) entry.status = 'alive';
    App.markDirty();
  };

  App.setEntryField = function (catchId, playerId, field, value) {
    var entry = App.findEntry(catchId, playerId);
    if (!entry) return;
    if (field === 'nickname') {
      entry.nickname = value;
    } else if (field === 'shiny') {
      entry.shiny = !!value;
    }
    App.markDirty();
  };

  // "Gestorben" trigger from a team slot: the WHOLE soul-link dies; the
  // owner of the triggering pokemon takes the blame / kill-count.
  // Returns { killed: [playerIds of partners], route } for the toast.
  App.killLink = function (catchId, ownerPlayerId) {
    var c = App.findCatch(catchId);
    if (!c) return null;
    App.snapshotForUndo(); // allow undoing this death (e.g. misclick -> wipe)
    c.deathBlame = ownerPlayerId; // owner is to blame
    var killed = [];
    c.entries.forEach(function (e) {
      if (e.status !== 'dead' && e.status !== 'uncaught') {
        if (e.playerId !== ownerPlayerId) killed.push(e.playerId);
        e.status = 'dead'; // stay in place (team keeps gravestone)
      }
    });
    App.recomputeDeaths();

    var owner = App.playerById(ownerPlayerId);
    var lostMons = c.entries.filter(function (e) { return e.pokemon; })
      .map(function (e) {
        var pl = App.playerById(e.playerId);
        return (App.displayName ? App.displayName(e.pokemon) : e.pokemon) + (pl ? ' (' + pl.name + ')' : '');
      }).join(', ');
    App.logRun('death', '💀 link died on ' + (c.route || '?') +
      (owner ? ' — blamed on ' + owner.name : '') + (lostMons ? ': ' + lostMons : ''));

    App.markDirty();
    var wipe = App.checkWipe();
    return { killed: killed, route: c.route, ownerPlayerId: ownerPlayerId, wipe: wipe };
  };

  // After a death, the run is lost ("wipe") if ANY player has 0 living team
  // pokemon. Returns the list of wiped-out players (empty = no wipe).
  // Only meaningful to call right after a pokemon died.
  App.checkWipe = function () {
    var out = [];
    App.state.players.forEach(function (p) {
      if (App.aliveTeamCount(p.id) === 0) out.push(p.id);
    });
    return out;
  };

  // "Entwickeln": change the pokemon of a single entry (evolution / hatch / revive).
  App.evolveEntry = function (catchId, playerId, newSlug) {
    var entry = App.findEntry(catchId, playerId);
    if (!entry || !newSlug) return;
    var from = entry.pokemon;
    entry.pokemon = newSlug;
    var pl = App.playerById(playerId);
    var fromN = App.displayName ? App.displayName(from) : from;
    var toN = App.displayName ? App.displayName(newSlug) : newSlug;
    if (from && from !== newSlug) {
      App.logRun('evolve', 'evolved ' + fromN + ' → ' + toN + (pl ? ' (' + pl.name + ')' : ''));
    }
    App.markDirty();
  };

  // ----- Detail-edit helpers (correction tool) -----

  // Revive the WHOLE link: every dead member -> alive, blame cleared.
  App.reviveLink = function (catchId) {
    var c = App.findCatch(catchId);
    if (!c) return;
    c.entries.forEach(function (e) {
      if (e.status === 'dead') e.status = 'alive';
    });
    c.deathBlame = null;
    App.recomputeDeaths();
    App.markDirty();
  };

  // Set the route of the whole encounter (link-wide).
  App.setCatchRoute = function (catchId, route) {
    var c = App.findCatch(catchId);
    if (!c) return;
    c.route = route || '';
    App.markDirty();
  };

  // Whether picking `slug` for an entry in `catchId` is allowed by the dex clause,
  // given the encounter type. Returns null if ok, or the blocking claim {route,slug}.
  //  - static encounter: always allowed
  //  - same family as the entry already has: allowed (keep your own line)
  //  - otherwise: blocked if that family is claimed by some OTHER catch
  App.checkPickAllowed = function (catchId, playerId, slug) {
    var c = App.findCatch(catchId);
    if (!c) return null;
    if (c.catchType === 'static') return null;
    var fam = App.familyOf(slug);
    if (fam == null) return null;
    var entry = App.findEntry(catchId, playerId);
    if (entry && App.familyOf(entry.pokemon) === fam) return null; // same line as now
    var hit = App.isFamilyBlocked(slug, catchId); // exclude this catch
    return hit || null;
  };

  // Short label for a link: "Machop/Squirtle (Route 19)".
  function linkLabel(c) {
    var mons = c.entries.filter(function (e) { return e.pokemon; })
      .map(function (e) { return App.displayName ? App.displayName(e.pokemon) : e.pokemon; })
      .join('/');
    return (mons || 'link') + (c.route ? ' (' + c.route + ')' : '');
  }

  // Move a catch between team and bank. Soul-linked: the WHOLE catch moves
  // together (all partner entries). Uncaught entries are ignored.
  App.moveEntry = function (catchId, playerId, location) {
    var c = App.findCatch(catchId);
    if (!c) return false;
    var members = c.entries.filter(function (e) { return e.status !== 'uncaught'; });
    if (!members.length) return false;

    if (location === 'team') {
      // every member must fit into its owner's 6-slot team
      var ok = members.every(function (e) {
        if (e.location === 'team') return true;
        return App.teamEntries(e.playerId).length < 6;
      });
      if (!ok) return false;
    }
    members.forEach(function (e) { e.location = location; });
    App.logRun('move', 'moved link ' + linkLabel(c) + ' to the ' +
      (location === 'team' ? 'team' : 'bank'));
    App.markDirty();
    return true;
  };

  // Move a SINGLE pokemon between team and bank for one player only (used by the
  // per-player Bank drag & drop). The soul-link bond (shared death) is unaffected;
  // only the team/bank placement is changed for this one entry.
  App.moveSingleEntry = function (catchId, playerId, location) {
    var entry = App.findEntry(catchId, playerId);
    if (!entry) return false;
    if (entry.status === 'uncaught') return false; // never on a team
    if (location === 'team' && entry.location !== 'team') {
      if (App.teamEntries(playerId).length >= 6) return false; // team full
    }
    entry.location = (location === 'team') ? 'team' : 'bank';
    var pl = App.playerById(playerId);
    var nm = App.displayName ? App.displayName(entry.pokemon) : entry.pokemon;
    var c2 = App.findCatch(catchId);
    App.logRun('move', 'moved ' + (nm || 'a Pokémon') + (pl ? ' (' + pl.name + ')' : '') +
      (c2 ? ' [link ' + linkLabel(c2) + ']' : '') + ' to the ' + (location === 'team' ? 'team' : 'bank'));
    App.markDirty();
    return true;
  };

})(window.App);

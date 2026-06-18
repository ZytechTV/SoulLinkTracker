/* Live PokéAPI access for the Pokémon Info tab (with per-session caching). */

window.App = window.App || {};

(function (App) {
  'use strict';

  var BASE = 'https://pokeapi.co/api/v2/';
  var cache = {}; // url -> Promise(json)

  function getJSON(url) {
    if (!cache[url]) {
      cache[url] = fetch(url).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).catch(function (e) { delete cache[url]; throw e; });
    }
    return cache[url];
  }

  // version-group name -> national generation number (1..9). We only care about 1-5.
  var VG_GEN = {
    'red-blue': 1, 'yellow': 1,
    'gold-silver': 2, 'crystal': 2,
    'ruby-sapphire': 3, 'emerald': 3, 'firered-leafgreen': 3,
    'diamond-pearl': 4, 'platinum': 4, 'heartgold-soulsilver': 4,
    'black-white': 5, 'black-2-white-2': 5,
    'x-y': 6, 'omega-ruby-alpha-sapphire': 6,
    'sun-moon': 7, 'ultra-sun-ultra-moon': 7, 'lets-go-pikachu-lets-go-eevee': 7,
    'sword-shield': 8, 'brilliant-diamond-and-shining-pearl': 8, 'legends-arceus': 8,
    'scarlet-violet': 9
  };
  App.versionGroupGen = function (vg) { return VG_GEN[vg] || null; };

  function titleCase(s) {
    return String(s || '').split('-').map(function (w) {
      return w ? w.charAt(0).toUpperCase() + w.slice(1) : w;
    }).join(' ');
  }
  App.titleCase = titleCase;

  // Describe a single evolution_details object as a short human string.
  function describeEvo(d) {
    if (!d) return '';
    var parts = [];
    var trig = d.trigger && d.trigger.name;
    if (d.min_level) parts.push('Lv ' + d.min_level);
    if (d.item) parts.push('use ' + titleCase(d.item.name));
    if (trig === 'trade') parts.push('Trade' + (d.held_item ? ' holding ' + titleCase(d.held_item.name) : ''));
    if (d.held_item && trig !== 'trade') parts.push('hold ' + titleCase(d.held_item.name));
    if (d.min_happiness) parts.push('Happiness ' + d.min_happiness);
    if (d.min_affection) parts.push('Affection ' + d.min_affection);
    if (d.min_beauty) parts.push('Beauty ' + d.min_beauty);
    if (d.time_of_day) parts.push(titleCase(d.time_of_day));
    if (d.known_move_type) parts.push('knows ' + titleCase(d.known_move_type.name) + ' move');
    if (d.known_move) parts.push('knows ' + titleCase(d.known_move.name));
    if (d.location) parts.push('at ' + titleCase(d.location.name));
    if (d.needs_overworld_rain) parts.push('while raining');
    if (d.gender === 1) parts.push('(female)');
    if (d.gender === 2) parts.push('(male)');
    if (!parts.length && trig) parts.push(titleCase(trig));
    return parts.join(', ');
  }

  // Flatten an evolution chain into stages: [{from, to, how, fromSlug, toSlug}]
  function flattenChain(node, out) {
    (node.evolves_to || []).forEach(function (child) {
      out.push({
        from: node.species.name,
        to: child.species.name,
        how: describeEvo(child.evolution_details[0])
      });
      flattenChain(child, out);
    });
    return out;
  }

  // List the species names in a chain (for sprite display order).
  function chainSpecies(node, out) {
    out.push(node.species.name);
    (node.evolves_to || []).forEach(function (c) { chainSpecies(c, out); });
    return out;
  }

  // Build a tree node: { species, how (from parent), children: [...] }.
  function evoTree(node) {
    return {
      species: node.species.name,
      how: node.evolution_details && node.evolution_details[0] ? describeEvo(node.evolution_details[0]) : '',
      children: (node.evolves_to || []).map(evoTree)
    };
  }

  // Load everything the Info tab needs for one pokemon (by id).
  // Returns { id, name, stats, abilities, evoStages, evoSpecies, movesByGen }
  App.loadPokemonInfo = function (id) {
    return getJSON(BASE + 'pokemon/' + id).then(function (p) {
      var stats = p.stats.map(function (s) { return { name: s.stat.name, value: s.base_stat }; });
      var abilities = p.abilities.map(function (a) {
        return { name: titleCase(a.ability.name), raw: a.ability.name, hidden: a.is_hidden };
      });

      // level-up moves grouped by generation (1..5): { gen: [{name, level}] }
      var movesByGen = {};
      p.moves.forEach(function (mv) {
        mv.version_group_details.forEach(function (vgd) {
          if (vgd.move_learn_method.name !== 'level-up') return;
          var gen = VG_GEN[vgd.version_group.name];
          if (!gen || gen > 5) return;
          if (!movesByGen[gen]) movesByGen[gen] = {};
          var nm = titleCase(mv.move.name);
          var lvl = vgd.level_learned_at;
          // keep the lowest level seen for this move in this gen
          if (movesByGen[gen][nm] == null || lvl < movesByGen[gen][nm]) movesByGen[gen][nm] = lvl;
        });
      });
      // normalize to sorted arrays
      Object.keys(movesByGen).forEach(function (g) {
        var obj = movesByGen[g];
        movesByGen[g] = Object.keys(obj).map(function (nm) { return { name: nm, level: obj[nm] }; })
          .sort(function (a, b) { return (a.level - b.level) || a.name.localeCompare(b.name); });
      });

      return getJSON(p.species.url).then(function (sp) {
        return getJSON(sp.evolution_chain.url).then(function (ch) {
          return {
            id: p.id,
            name: titleCase(sp.name),
            stats: stats,
            abilities: abilities,
            evoStages: flattenChain(ch.chain, []),
            evoTree: evoTree(ch.chain),
            evoSpecies: chainSpecies(ch.chain, []),
            movesByGen: movesByGen
          };
        });
      });
    });
  };

  // Level-up moves of ONE form (species name or id), for a given generation.
  // Returns [{name, level}] sorted. Used for the per-evolution-stage move tabs.
  App.loadFormMoves = function (idOrName, gen) {
    return getJSON(BASE + 'pokemon/' + idOrName).then(function (p) {
      var by = {};
      p.moves.forEach(function (mv) {
        mv.version_group_details.forEach(function (vgd) {
          if (vgd.move_learn_method.name !== 'level-up') return;
          if (VG_GEN[vgd.version_group.name] !== gen) return;
          var nm = titleCase(mv.move.name);
          var raw = mv.move.name;
          var lvl = vgd.level_learned_at;
          if (by[nm] == null || lvl < by[nm].level) by[nm] = { name: nm, raw: raw, level: lvl };
        });
      });
      return Object.keys(by).map(function (k) { return by[k]; })
        .sort(function (a, b) { return (a.level - b.level) || a.name.localeCompare(b.name); });
    });
  };

  // Move details (cached), resolved for a target generation via past_values.
  // Returns {type, power, accuracy, pp, damageClass, effect}.
  App.loadMoveDetail = function (rawName, gen) {
    return getJSON(BASE + 'move/' + rawName).then(function (m) {
      var eff = (m.effect_entries || []).find(function (e) { return e.language.name === 'en'; });
      var fl = (m.flavor_text_entries || []).filter(function (e) { return e.language.name === 'en'; });
      var text = eff ? eff.short_effect : (fl[0] ? fl[0].flavor_text : '');

      // current values
      var out = {
        type: m.type ? m.type.name : null,
        power: m.power, accuracy: m.accuracy, pp: m.pp,
        damageClass: m.damage_class ? m.damage_class.name : null,
        effect: (text || '').replace(/[\n\f]/g, ' ')
          .replace(/\$effect_chance/g, (m.effect_chance != null ? m.effect_chance : '') + '')
      };

      // historical override: pick the earliest past_values entry whose generation
      // is >= the target gen; fields that are non-null on it applied up to that gen.
      if (gen && m.past_values && m.past_values.length) {
        var best = null;
        m.past_values.forEach(function (pv) {
          var g = VG_GEN[pv.version_group.name];
          if (g && g >= gen && (best === null || g < best.g)) best = { g: g, pv: pv };
        });
        if (best) {
          var pv = best.pv;
          if (pv.type) out.type = pv.type.name;
          if (pv.power != null) out.power = pv.power;
          if (pv.accuracy != null) out.accuracy = pv.accuracy;
          if (pv.pp != null) out.pp = pv.pp;
        }
      }
      return out;
    });
  };

  // Catch-rate inputs for one pokemon (by id): species capture_rate + base HP &
  // Speed (for ball conditions). capture_rate is stable across Gen 1–5, so the
  // single PokéAPI value is accurate for any selected run generation.
  // Returns { captureRate, baseHp, baseSpeed, types }.
  App.loadCatchData = function (id) {
    return getJSON(BASE + 'pokemon/' + id).then(function (p) {
      var baseHp = 0, baseSpeed = 0;
      p.stats.forEach(function (s) {
        if (s.stat.name === 'hp') baseHp = s.base_stat;
        if (s.stat.name === 'speed') baseSpeed = s.base_stat;
      });
      var types = p.types.map(function (t) { return t.type.name; });
      return getJSON(p.species.url).then(function (sp) {
        return {
          captureRate: sp.capture_rate,
          baseHp: baseHp,
          baseSpeed: baseSpeed,
          types: types
        };
      });
    });
  };

  // Ability details (cached). Returns {effect}.
  App.loadAbilityDetail = function (rawName) {
    return getJSON(BASE + 'ability/' + rawName).then(function (a) {
      var eff = (a.effect_entries || []).find(function (e) { return e.language.name === 'en'; });
      var fl = (a.flavor_text_entries || []).filter(function (e) { return e.language.name === 'en'; });
      var text = eff ? eff.short_effect : (fl[fl.length - 1] ? fl[fl.length - 1].flavor_text : '');
      return { effect: (text || '').replace(/[\n\f]/g, ' ') };
    });
  };

})(window.App);

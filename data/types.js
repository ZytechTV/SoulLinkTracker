/* Pokémon type effectiveness charts for Gen 1-5.
   No Fairy type exists in any of these charts.
   Each chart maps ATTACKING type -> { DEFENDING type: multiplier }.
   Only non-1x interactions are listed; everything else defaults to 1x.
   Multipliers: 0 = immune, 0.5 = not very effective, 2 = super effective. */

window.TYPE_DATA = (function () {
  // ---- Gen 1 ----
  // 15 types, no Dark/Steel/Fairy. Includes Gen 1 quirks:
  //  - Bug is super effective vs Poison (2x)
  //  - Poison is super effective vs Bug (2x)
  //  - Ghost does 0x to Psychic (the famous bug)
  //  - Ice is neutral (1x) vs Fire
  //  - Bug is 2x vs Psychic
  const GEN1_TYPES = [
    'normal','fighting','flying','poison','ground','rock','bug','ghost',
    'fire','water','grass','electric','psychic','ice','dragon'
  ];
  const GEN1 = {
    normal:   { rock:0.5, ghost:0 },
    fighting: { normal:2, rock:2, ice:2, flying:0.5, poison:0.5, bug:0.5, psychic:0.5, ghost:0 },
    flying:   { fighting:2, bug:2, grass:2, rock:0.5, electric:0.5 },
    poison:   { grass:2, bug:2, poison:0.5, ground:0.5, rock:0.5, ghost:0.5 },
    ground:   { poison:2, rock:2, fire:2, electric:2, flying:0, bug:0.5, grass:0.5 },
    rock:     { flying:2, bug:2, fire:2, ice:2, fighting:0.5, ground:0.5 },
    bug:      { grass:2, psychic:2, poison:2, fighting:0.5, flying:0.5, fire:0.5, ghost:0.5 },
    ghost:    { ghost:2, psychic:0, normal:0 },
    fire:     { bug:2, grass:2, ice:2, rock:0.5, fire:0.5, water:0.5, dragon:0.5 },
    water:    { ground:2, rock:2, fire:2, water:0.5, grass:0.5, dragon:0.5 },
    grass:    { ground:2, rock:2, water:2, flying:0.5, poison:0.5, bug:0.5, fire:0.5, grass:0.5, dragon:0.5 },
    electric: { flying:2, water:2, ground:0, grass:0.5, electric:0.5, dragon:0.5 },
    psychic:  { fighting:2, poison:2, psychic:0.5 },
    ice:      { flying:2, ground:2, grass:2, dragon:2, water:0.5, ice:0.5 },
    dragon:   { dragon:2 }
  };

  // ---- Gen 2-5 ----
  // 17 types: adds Dark + Steel. No Fairy.
  // Steel resists Ghost and Dark (pre-Gen 6).
  // Ghost/Dark do normal damage handled by chart below.
  const GEN2_TYPES = [
    'normal','fighting','flying','poison','ground','rock','bug','ghost',
    'steel','fire','water','grass','electric','psychic','ice','dragon','dark'
  ];
  const GEN2 = {
    normal:   { rock:0.5, ghost:0, steel:0.5 },
    fighting: { normal:2, rock:2, steel:2, ice:2, dark:2, flying:0.5, poison:0.5, bug:0.5, psychic:0.5, ghost:0 },
    flying:   { fighting:2, bug:2, grass:2, rock:0.5, steel:0.5, electric:0.5 },
    poison:   { grass:2, poison:0.5, ground:0.5, rock:0.5, ghost:0.5, steel:0 },
    ground:   { poison:2, rock:2, steel:2, fire:2, electric:2, flying:0, bug:0.5, grass:0.5 },
    rock:     { flying:2, bug:2, fire:2, ice:2, fighting:0.5, ground:0.5, steel:0.5 },
    bug:      { grass:2, psychic:2, dark:2, fighting:0.5, flying:0.5, poison:0.5, ghost:0.5, steel:0.5, fire:0.5 },
    ghost:    { ghost:2, psychic:2, dark:0.5, steel:0.5, normal:0 },
    steel:    { rock:2, ice:2, steel:0.5, fire:0.5, water:0.5, electric:0.5 },
    fire:     { bug:2, grass:2, ice:2, steel:2, rock:0.5, fire:0.5, water:0.5, dragon:0.5 },
    water:    { ground:2, rock:2, fire:2, water:0.5, grass:0.5, dragon:0.5 },
    grass:    { ground:2, rock:2, water:2, flying:0.5, poison:0.5, bug:0.5, steel:0.5, fire:0.5, grass:0.5, dragon:0.5 },
    electric: { flying:2, water:2, ground:0, grass:0.5, electric:0.5, dragon:0.5 },
    psychic:  { fighting:2, poison:2, steel:0.5, psychic:0.5, dark:0 },
    ice:      { flying:2, ground:2, grass:2, dragon:2, steel:0.5, fire:0.5, water:0.5, ice:0.5 },
    dragon:   { dragon:2, steel:0.5 },
    dark:     { ghost:2, psychic:2, fighting:0.5, dark:0.5, steel:0.5 }
  };

  function getMult(chart, atk, def) {
    var row = chart[atk];
    if (!row) return 1;
    var v = row[def];
    return (v === undefined) ? 1 : v;
  }

  return {
    GEN1: { types: GEN1_TYPES, chart: GEN1 },
    GEN2PLUS: { types: GEN2_TYPES, chart: GEN2 },
    // returns {types, chart} for a given generation number (1-5)
    forGen: function (gen) {
      return gen === 1 ? this.GEN1 : this.GEN2PLUS;
    },
    getMult: getMult
  };
})();

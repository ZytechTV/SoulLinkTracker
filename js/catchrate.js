/* Catch-rate maths, generation-accurate (Gen 1–5).

   The in-battle catch probability depends on:
     - the species' base catch rate C (PokéAPI capture_rate; stable across Gen 1–5)
     - the opponent's remaining HP, expressed as a fraction hp ∈ (0,1]
     - the status condition
     - the ball used (some balls are situational multipliers)

   IMPORTANT — why we only need HP as a percentage:
   every modern-formula uses the term (3·HPmax − 2·HPcur) / (3·HPmax).
   Substituting HPcur = hp·HPmax makes HPmax cancel out:
       (3 − 2·hp) / 3
   so the absolute HP / level is irrelevant. The slider's % is mathematically
   sufficient. Gen 1 is the one exception (it floors absolute HP values) — there
   we approximate with a representative HP using a fixed level so the ratio holds.

   References: Bulbapedia "Catch rate" + dragonflycave capturing guides. */

window.App = window.App || {};

(function (App) {
  'use strict';

  // ---------------------------------------------------------------------------
  // Status multipliers / bonuses per generation.
  // Gen 1/2 use flat additive bonuses; Gen 3+ use multipliers.
  // ---------------------------------------------------------------------------
  var STATUS = {
    none:     { label: 'None',      icon: '—'  },
    sleep:    { label: 'Asleep',    icon: '💤' },
    freeze:   { label: 'Frozen',    icon: '❄'  },
    paralyze: { label: 'Paralyzed', icon: '⚡' },
    poison:   { label: 'Poisoned',  icon: '☠'  },
    burn:     { label: 'Burned',    icon: '🔥' }
  };
  App.CATCH_STATUS = STATUS;

  function statusMult(gen, status) {
    var sleepFreeze = (status === 'sleep' || status === 'freeze');
    var other = (status === 'paralyze' || status === 'poison' || status === 'burn');
    if (gen >= 5) {
      if (sleepFreeze) return 2.5;
      if (other) return 1.5;
      return 1;
    }
    // Gen 3–4
    if (sleepFreeze) return 2;
    if (other) return 1.5;
    return 1;
  }

  // ---------------------------------------------------------------------------
  // Inputs that situational balls can consume. Rendered at the top only when a
  // ball in the current generation declares it in `needs`. Each has a default
  // that reflects the BEST CASE, so an untouched calculator shows best-case math.
  //   kind: 'number' (numeric field) | 'toggle' (checkbox)
  //   def:  best-case default value
  // ---------------------------------------------------------------------------
  var INPUTS = {
    turn:     { kind: 'number', label: 'Battle turn',  def: 30, min: 1,  max: 99, hint: 'Timer/Quick Ball' },
    enemyLvl: { kind: 'number', label: 'Enemy level',  def: 1,  min: 1,  max: 100, hint: 'Nest/Level Ball' },
    yourLvl:  { kind: 'number', label: 'Your level',   def: 100, min: 1, max: 100, hint: 'Level Ball' },
    weight:   { kind: 'number', label: 'Enemy weight (kg)', def: 300, min: 0, max: 1000, hint: 'Heavy Ball' },
    fishing:  { kind: 'toggle', label: 'Fishing / surfing / underwater', def: true,  hint: 'Dive/Lure Ball' },
    night:    { kind: 'toggle', label: 'Night or in a cave',  def: true,  hint: 'Dusk Ball' },
    caught:   { kind: 'toggle', label: 'Already in Pokédex',  def: true,  hint: 'Repeat Ball' },
    asleep:   { kind: 'toggle', label: 'Target is asleep',    def: true,  hint: 'Dream Ball' },
    moonLine: { kind: 'toggle', label: 'Moon Stone family',   def: true,  hint: 'Moon Ball' },
    loveOk:   { kind: 'toggle', label: 'Same species, opposite gender', def: true, hint: 'Love Ball' }
  };
  App.CATCH_INPUTS = INPUTS;

  // default context (best case) — merged under any user-provided context.
  function withDefaults(ctx) {
    var out = {};
    Object.keys(INPUTS).forEach(function (k) {
      out[k] = (ctx && ctx[k] != null) ? ctx[k] : INPUTS[k].def;
    });
    out.gen = ctx && ctx.gen;
    out.baseSpeed = ctx && ctx.baseSpeed;
    out.types = ctx && ctx.types;
    return out;
  }

  // ---------------------------------------------------------------------------
  // Ball catalogue. Each entry knows which generations it exists in, which user
  // inputs it consumes (`needs`), and how to compute its multiplier.
  //   gens:    generations this ball is selectable in
  //   primary: always shown by default (Poké/Great/Ultra)
  //   needs:   list of INPUT keys this ball reads (drives which inputs render)
  //   mult(c): {value, add?, applies?, note} — c already has defaults merged in
  // `applies` true/false means a condition we can evaluate flipped the bonus on/off.
  // ---------------------------------------------------------------------------
  function flat(v) { return function () { return { value: v }; }; }

  var BALLS = [
    { id: 'poke',   name: 'Poké Ball',   gens: [1, 2, 3, 4, 5], primary: true,  mult: flat(1) },
    { id: 'great',  name: 'Great Ball',  gens: [1, 2, 3, 4, 5], primary: true,  mult: flat(1.5) },
    { id: 'ultra',  name: 'Ultra Ball',  gens: [1, 2, 3, 4, 5], primary: true,  mult: flat(2) },
    { id: 'safari', name: 'Safari Ball', gens: [1, 2, 3, 4], mult: function () {
        // Gen 1 Safari behaves like a Great Ball (G=8, B=151); Gen 2-4: x1.5
        return { value: 1.5 };
      } },

    // ---- Gen 2 Apricorn / special balls ----
    { id: 'fast', name: 'Fast Ball', gens: [2], mult: function (c) {
        var fast = (c.baseSpeed || 0) >= 100;
        return { value: fast ? 4 : 1, applies: fast, note: '×4 if base Speed ≥ 100' };
      } },
    { id: 'level', name: 'Level Ball', gens: [2], needs: ['yourLvl', 'enemyLvl'], mult: function (c) {
        var ratio = c.yourLvl / Math.max(1, c.enemyLvl);
        var v = ratio >= 4 ? 8 : ratio >= 2 ? 4 : ratio > 1 ? 2 : 1;
        return { value: v, note: 'your Lv ' + c.yourLvl + ' vs enemy Lv ' + c.enemyLvl + ' → ×' + v };
      } },
    { id: 'lure', name: 'Lure Ball', gens: [2], needs: ['fishing'], mult: function (c) {
        return { value: c.fishing ? 3 : 1, applies: !!c.fishing, note: '×3 while fishing' };
      } },
    { id: 'heavy', name: 'Heavy Ball', gens: [2], needs: ['weight'], mult: function (c) {
        var w = c.weight;
        var add = w < 102.4 ? -20 : w < 204.8 ? 0 : w < 307.2 ? 20 : 30;
        return { value: 1, add: add, note: (add >= 0 ? '+' : '') + add + ' catch rate at ' + w + ' kg' };
      } },
    { id: 'love', name: 'Love Ball', gens: [2], needs: ['loveOk'], mult: function (c) {
        return { value: c.loveOk ? 8 : 1, applies: !!c.loveOk, note: '×8 vs same species, opposite gender' };
      } },
    { id: 'moon', name: 'Moon Ball', gens: [2], needs: ['moonLine'], mult: function (c) {
        return { value: c.moonLine ? 4 : 1, applies: !!c.moonLine, note: '×4 on Moon Stone evolution lines' };
      } },

    // ---- Gen 3+ situational balls ----
    { id: 'net', name: 'Net Ball', gens: [3, 4, 5], mult: function (c) {
        var hit = (c.types || []).some(function (t) { return t === 'water' || t === 'bug'; });
        return { value: hit ? 3 : 1, applies: hit, note: '×3 on Water/Bug types' };
      } },
    { id: 'dive', name: 'Dive Ball', gens: [3, 4, 5], needs: ['fishing'], mult: function (c) {
        return { value: c.fishing ? 3.5 : 1, applies: !!c.fishing, note: '×3.5 while surfing/fishing/underwater' };
      } },
    { id: 'nest', name: 'Nest Ball', gens: [3, 4, 5], needs: ['enemyLvl'], mult: function (c) {
        // Gen3-4: (40 − level)/10 ; Gen5: (41 − level)/10. Min ×1.
        var base = (c.gen >= 5 ? 41 : 40);
        var v = Math.max(1, (base - c.enemyLvl) / 10);
        v = Math.round(v * 100) / 100;
        return { value: v, note: '(' + base + ' − Lv ' + c.enemyLvl + ')/10 → ×' + v };
      } },
    { id: 'repeat', name: 'Repeat Ball', gens: [3, 4, 5], needs: ['caught'], mult: function (c) {
        return { value: c.caught ? 3 : 1, applies: !!c.caught, note: '×3 if already in the Pokédex' };
      } },
    { id: 'timer', name: 'Timer Ball', gens: [3, 4, 5], needs: ['turn'], mult: function (c) {
        var v = Math.min(4, (c.turn + 10) / 10);
        v = Math.round(v * 100) / 100;
        return { value: v, note: '(turn ' + c.turn + ' + 10)/10, max ×4 → ×' + v };
      } },
    { id: 'dusk', name: 'Dusk Ball', gens: [4, 5], needs: ['night'], mult: function (c) {
        return { value: c.night ? 3.5 : 1, applies: !!c.night, note: '×3.5 at night or in caves' };
      } },
    { id: 'quick', name: 'Quick Ball', gens: [4, 5], needs: ['turn'], mult: function (c) {
        var first = c.turn <= 1;
        var v = first ? (c.gen >= 5 ? 5 : 4) : 1;
        return { value: v, applies: first, note: '×' + (c.gen >= 5 ? 5 : 4) + ' on the first turn' };
      } },
    { id: 'dream', name: 'Dream Ball', gens: [5], needs: ['asleep'], mult: function (c) {
        return { value: c.asleep ? 4 : 1, applies: !!c.asleep, note: '×4 on sleeping Pokémon' };
      } }
  ];

  // Balls selectable in a given generation, primaries first then situational.
  App.ballsForGen = function (gen) {
    return BALLS.filter(function (b) { return b.gens.indexOf(gen) >= 0; });
  };
  App.ballById = function (id) {
    return BALLS.find(function (b) { return b.id === id; }) || null;
  };

  // Distinct input keys needed by any ball in this generation (ordered as in INPUTS).
  App.inputsForGen = function (gen) {
    return App.inputsForBalls(App.ballsForGen(gen));
  };

  // Distinct input keys needed by a given list of balls (ordered as in INPUTS).
  App.inputsForBalls = function (balls) {
    var need = {};
    (balls || []).forEach(function (b) {
      (b.needs || []).forEach(function (k) { need[k] = true; });
    });
    return Object.keys(INPUTS).filter(function (k) { return need[k]; });
  };

  // Balls (in a generation) that consume a given input key. Used to render the
  // ball sprites next to each situational modifier.
  App.ballsForInput = function (inputKey, gen) {
    return App.ballsForGen(gen).filter(function (b) {
      return (b.needs || []).indexOf(inputKey) >= 0;
    });
  };

  // Resolve a ball's multiplier with user context (defaults merged for best case).
  App.ballMult = function (ball, ctx) {
    return ball.mult(withDefaults(ctx));
  };

  // ---------------------------------------------------------------------------
  // HP ratio term used by every modern formula: (3 − 2·hp)/3, hp∈(0,1].
  // ---------------------------------------------------------------------------
  function hpTerm(hp) {
    hp = Math.max(0.001, Math.min(1, hp));
    return (3 - 2 * hp) / 3;
  }
  App.catchHpTerm = hpTerm;

  // clamp helper
  function clamp01(x) { return Math.max(0, Math.min(1, x)); }

  // ---------------------------------------------------------------------------
  // Per-generation success probability for ONE throw.
  // ctx: { gen, captureRate C, hp (0..1), status, ball (multiplier value),
  //        ballAdd (flat add, Gen2 Heavy) }
  // Returns { chance (0..1), a, b, parts }  — parts feeds the breakdown UI.
  // ---------------------------------------------------------------------------

  // Gen 3 & 4 — the canonical modern formula.
  // a = (3·HPmax−2·HPcur)/(3·HPmax) · C · ball · status.
  // Shake probability b = 1048560 / √(√(16711680 / a)); success = (b/65536)^4,
  // which reduces exactly to a/255 — so we use that closed form.
  function calcGen34(C, hp, status, ballMult) {
    var term = hpTerm(hp);
    var bonusStatus = statusMult(4, status);
    var a = term * C * ballMult * bonusStatus;       // modified catch rate
    if (a >= 255) return { chance: 1, a: a, shake: 1 };
    var b = Math.floor(1048560 / Math.sqrt(Math.sqrt(16711680 / a)));
    var shake = b / 65536;
    return { chance: Math.min(1, a / 255), a: a, b: b, shake: shake };
  }

  // Gen 5 — 4096-scaled, three shakes.
  function calcGen5(C, hp, status, ballMult) {
    var term = hpTerm(hp);
    var bonusStatus = statusMult(5, status);
    // a = floor( term * 4096 * C * ball ) * status, capped at 1044480
    var a = Math.floor(term * 4096 * C * ballMult) * bonusStatus;
    a = Math.min(a, 1044480);
    if (a >= 1044480) return { chance: 1, a: a, shake: 1 };
    var b = Math.floor(65536 * Math.pow(a / 1044480, 0.25)); // 65536 * (a/1044480)^(1/4)
    var shake = b / 65536;
    return { chance: Math.min(1, Math.pow(shake, 3)), a: a, b: b, shake: shake };
  }

  // Gen 2 — additive status bonus, lookup-table-ish; we use the continuous form.
  function calcGen2(C, hp, status, ballMult, ballAdd) {
    // rate modified by ball first (multiplier), then HP term, then +status bonus
    var rate = C * ballMult + (ballAdd || 0);
    var hpScaled = Math.max(1, Math.floor((3 - 2 * hp) / 3 * 3 / 3 * rate)); // see note
    // Bulbapedia: a = max(floor((3·HPmax−2·HPcur)·rate/(3·HPmax)),1) + statusBonus
    var a = Math.max(Math.floor(hpTerm(hp) * rate), 1);
    var bonus = (status === 'sleep' || status === 'freeze') ? 10
              : 0; // para/poison/burn bonus was bugged to 0 in Gen 2
    a = a + bonus;
    if (a >= 255) return { chance: 1, a: a };
    // shake probability b ≈ 1048560 / sqrt(sqrt(16711680 / a))  → normalise
    var b = Math.floor(1048560 / Math.sqrt(Math.sqrt(Math.floor(16711680 / a))));
    var shake = b / 65536;
    return { chance: Math.min(1, Math.pow(shake, 4)), a: a, b: b, shake: shake };
  }

  // Gen 1 — the infamous one. Uses absolute HP, so we instantiate a representative
  // battle HP from a fixed level/IV to keep the ratio realistic. Ball factor G and
  // R1 range differ per ball; status is a flat success threshold.
  // P = (S + min(C+1, B−S) · (F+1)/256) / B
  function calcGen1(C, hp, status, ballId) {
    // Ball params: range B and HP-factor divisor G
    var B = 256, G = 12;                 // Poké / Ultra default
    if (ballId === 'great') { B = 201; G = 8; }
    else if (ballId === 'ultra') { B = 151; G = 12; }
    else if (ballId === 'safari') { B = 151; G = 8; } // Safari ≈ Great-ish range
    // Status flat threshold S (Gen 1 had no Great/Ultra distinction here)
    var S = (status === 'sleep' || status === 'freeze') ? 25
          : (status === 'paralyze' || status === 'poison' || status === 'burn') ? 12 : 0;

    // Representative HP at Lv 50 from a typical base HP (~50) so the ratio holds.
    // The catch chance is dominated by the C/B ratio; HP factor F mostly gates
    // the upper bound. We use a midrange max HP and scale current HP by hp%.
    var maxHP = 120;                          // representative Lv50 HP
    var curHP = Math.max(1, Math.round(maxHP * clamp01(hp)));
    var F = Math.min(255, Math.floor(Math.floor(maxHP * 255 / G) / Math.max(1, Math.floor(curHP / 4))));

    var chance = (S + Math.min(C + 1, B - S) * (F + 1) / 256) / B;
    return { chance: clamp01(chance), F: F, S: S, B: B };
  }

  // Public: compute one ball's chance for the current selection.
  // sel = { gen, captureRate, hp, status }
  // ballValue is the resolved multiplier; ballAdd optional flat add (Gen2 Heavy).
  App.catchChance = function (sel, ballId, ballValue, ballAdd) {
    var gen = sel.gen;
    var C = sel.captureRate;
    if (C == null) return null;
    if (ballValue === Infinity) return { chance: 1, master: true };

    if (gen <= 1) return calcGen1(C, sel.hp, sel.status, ballId);
    if (gen === 2) return calcGen2(C, sel.hp, sel.status, ballValue, ballAdd);
    if (gen <= 4) return calcGen34(C, sel.hp, sel.status, ballValue);
    return calcGen5(C, sel.hp, sel.status, ballValue);
  };

  // Expose the status multiplier resolver for the breakdown UI.
  App.catchStatusMult = statusMult;

  // Break the catch chance into additive contributions that sum to the total.
  // Built up cumulatively so each step is the EXTRA probability that factor adds:
  //   base  = chance at full HP, no status, Poké Ball
  //   +hp   = chance with current HP − base
  //   +stat = chance with HP+status − previous
  //   +ball = chance with HP+status+ball − previous (omitted for a ×1 ball)
  // ballId/ballMult/ballAdd describe the selected ball (default Poké Ball ×1).
  // Returns { total, parts:[{key,label,pct}] } with pct as 0..1 contributions.
  App.catchBreakdownParts = function (sel, ballId, ballMult, ballAdd) {
    if (sel.captureRate == null) return null;
    ballId = ballId || 'poke';
    if (ballMult == null) ballMult = 1;

    function mk(hp, status) {
      return { gen: sel.gen, captureRate: sel.captureRate, hp: hp, status: status };
    }
    function cPoke(s) { var r = App.catchChance(s, 'poke', 1); return r ? r.chance : 0; }

    var pBase = cPoke(mk(1, 'none'));
    var pHp = cPoke(mk(sel.hp, 'none'));
    var pAll = cPoke(mk(sel.hp, sel.status));
    // chance with the chosen ball applied on top of HP + status
    var withBall = App.catchChance(mk(sel.hp, sel.status), ballId, ballMult, ballAdd);
    var pBall = withBall ? withBall.chance : pAll;

    var parts = [
      { key: 'base', label: 'Base rate', pct: pBase },
      { key: 'hp', label: 'HP', pct: pHp - pBase }
    ];
    if (sel.status !== 'none') {
      parts.push({ key: 'status', label: 'Status', pct: pAll - pHp });
    }
    if (ballId !== 'poke' && Math.abs(pBall - pAll) > 1e-6) {
      parts.push({ key: 'ball', label: 'Ball', pct: pBall - pAll });
    }
    return { total: pBall, parts: parts };
  };

})(window.App);

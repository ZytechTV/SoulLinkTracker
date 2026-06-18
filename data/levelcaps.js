/* Hardcore-Nuzlocke level caps per game: the level of the highest-level Pokémon
   of each gym leader / Elite Four member / major boss, in story order, INCLUDING
   post-game content (rematches, Kanto gyms, Red, Steven, …).
   Source: Nuzlocke University "Hardcore Nuzlocke Level Caps by Generation".
   https://nuzlockeuniversity.ca/2022/01/18/hardcore-nuzlocke-level-caps-by-generation/

   Each entry: { kind: 'gym'|'e4'|'champion'|'boss', label, level }.
   `gymIndex` (0-based) on the FIRST 8 gym entries links a cap to the matching
   badge so the currently-relevant cap can be derived from how many badges are
   earned. Post-game gyms (Kanto) are tagged 'boss' so they don't consume badges. */

window.LEVEL_CAPS = (function () {
  function gyms(levels) {
    return levels.map(function (lv, i) {
      return { kind: 'gym', label: 'Gym ' + (i + 1), level: lv, gymIndex: i };
    });
  }
  function e4(levels) {
    return levels.map(function (lv, i) {
      return { kind: 'e4', label: 'Elite Four ' + (i + 1), level: lv };
    });
  }
  function champ(lv) { return { kind: 'champion', label: 'Champion', level: lv }; }
  function boss(label, lv) { return { kind: 'boss', label: label, level: lv }; }

  // main game: 8 gyms + 4 E4 + champion, plus optional post-game extras.
  function build(gymLevels, e4Levels, champLevel, extras) {
    var out = gyms(gymLevels).concat(e4(e4Levels));
    out.push(champ(champLevel));
    (extras || []).forEach(function (e) { out.push(e); });
    return out;
  }

  // Johto post-game: 8 Kanto gyms then Red. levels in Kanto-gym order.
  function kantoGyms(levels) {
    return levels.map(function (lv, i) {
      return boss('Kanto Gym ' + (i + 1), lv);
    });
  }

  // ---- Generation 1 ----
  var RB  = build([14, 21, 24, 29, 43, 43, 47, 50], [56, 58, 60, 62], 65);
  var YEL = build([12, 21, 28, 32, 50, 50, 54, 55], [56, 58, 60, 62], 65);

  // ---- Generation 2 ----
  // GS & Crystal: identical; post-game Kanto gyms + Red.
  var GSC = build([9, 16, 20, 25, 30, 35, 31, 40], [42, 44, 46, 47], 50,
    kantoGyms([44, 47, 45, 46, 39, 48, 50, 58]).concat([boss('Red', 81)]));

  // ---- Generation 3 ----
  var RS  = build([15, 18, 23, 28, 31, 33, 42, 43], [49, 51, 53, 55], 58);
  var EM  = build([15, 19, 24, 29, 31, 33, 42, 46], [49, 51, 53, 55], 58,
    [boss('Steven (Meteor Falls)', 78)]);
  var FRLG = build([14, 21, 24, 29, 43, 43, 47, 50], [54, 56, 58, 60], 63);

  // ---- Generation 4 ----
  var DP  = build([14, 22, 30, 30, 36, 39, 42, 49], [57, 59, 61, 63], 66);
  var PT  = build([14, 22, 26, 32, 37, 41, 44, 50], [53, 55, 57, 59], 62);
  var HGSS = build([13, 17, 19, 25, 31, 35, 34, 41], [42, 44, 46, 47], 50,
    kantoGyms([54, 54, 53, 56, 50, 55, 59, 60]).concat([boss('Red', 88)]));

  // ---- Generation 5 ----
  // BW: gyms -> League (50) -> N (52) -> Ghetsis (54); post-game E4 + Champion rematch.
  var BW = gyms([14, 20, 23, 27, 31, 35, 39, 43]).concat([
    boss('Pokémon League', 50),
    boss('N', 52),
    boss('Ghetsis', 54),
    boss('Elite Four Rematch', 73),
    boss('Champion Rematch (Alder)', 77)
  ]);
  // B2W2: gyms -> League (58) -> Champion (59); post-game rematches.
  var B2W2 = gyms([13, 18, 24, 30, 33, 39, 48, 51]).concat([
    boss('Pokémon League', 58),
    champ(59),
    boss('Elite Four Rematch', 74),
    boss('Champion Rematch', 78)
  ]);

  // English game key (state.game) -> cap list
  var GAMES = {
    'Red': RB, 'Blue': RB, 'Yellow': YEL,
    'Gold': GSC, 'Silver': GSC, 'Crystal': GSC,
    'Ruby': RS, 'Sapphire': RS, 'Emerald': EM,
    'FireRed': FRLG, 'LeafGreen': FRLG,
    'Diamond': DP, 'Pearl': DP, 'Platinum': PT,
    'HeartGold': HGSS, 'SoulSilver': HGSS,
    'Black': BW, 'White': BW,
    'Black 2': B2W2, 'White 2': B2W2
  };

  return {
    get: function (gameKey) { return GAMES[gameKey] || null; }
  };
})();

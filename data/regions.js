/* Region data per game: generation, region label, 8 badge names, and
   an ordered list of catch locations (routes/towns/dungeons).
   Games that share a region reuse the same region definition. */

window.REGION_DATA = (function () {
  // ---------- Region definitions ----------
  var KANTO = {
    region: 'Kanto',
    badges: ['Boulder', 'Cascade', 'Thunder', 'Rainbow', 'Soul', 'Marsh', 'Volcano', 'Earth'],
    locations: [
      'Pallet Town', 'Route 1', 'Viridian City', 'Route 22', 'Route 2', 'Viridian Forest',
      'Pewter City', 'Route 3', 'Mt. Moon', 'Route 4', 'Cerulean City', 'Route 24', 'Route 25',
      'Route 5', 'Route 6', 'Vermilion City', 'S.S. Anne', 'Route 11', 'Diglett\'s Cave',
      'Route 9', 'Route 10', 'Rock Tunnel', 'Lavender Town', 'Route 8', 'Route 7',
      'Celadon City', 'Route 16', 'Route 17', 'Route 18', 'Fuchsia City', 'Safari Zone',
      'Route 12', 'Route 13', 'Route 14', 'Route 15', 'Saffron City', 'Route 19', 'Route 20',
      'Seafoam Islands', 'Cinnabar Island', 'Pokémon Mansion', 'Route 21', 'Route 23',
      'Victory Road', 'Indigo Plateau', 'Cerulean Cave', 'Power Plant'
    ]
  };

  var JOHTO = {
    region: 'Johto',
    badges: ['Zephyr', 'Hive', 'Plain', 'Fog', 'Storm', 'Mineral', 'Glacier', 'Rising'],
    locations: [
      'New Bark Town', 'Route 29', 'Cherrygrove City', 'Route 30', 'Route 31', 'Dark Cave',
      'Violet City', 'Sprout Tower', 'Ruins of Alph', 'Route 32', 'Union Cave', 'Route 33',
      'Azalea Town', 'Slowpoke Well', 'Ilex Forest', 'Route 34', 'Goldenrod City',
      'Route 35', 'National Park', 'Route 36', 'Route 37', 'Ecruteak City', 'Burned Tower',
      'Route 38', 'Route 39', 'Olivine City', 'Lighthouse', 'Route 40', 'Route 41',
      'Cianwood City', 'Route 42', 'Mt. Mortar', 'Mahogany Town', 'Route 43', 'Lake of Rage',
      'Route 44', 'Ice Path', 'Blackthorn City', 'Dragon\'s Den', 'Route 45', 'Route 46',
      'Route 27', 'Tohjo Falls', 'Route 26', 'Victory Road', 'Mt. Silver'
    ]
  };

  var HOENN = {
    region: 'Hoenn',
    badges: ['Stone', 'Knuckle', 'Dynamo', 'Heat', 'Balance', 'Feather', 'Mind', 'Rain'],
    locations: [
      'Littleroot Town', 'Route 101', 'Oldale Town', 'Route 103', 'Route 102', 'Petalburg City',
      'Route 104', 'Petalburg Woods', 'Rustboro City', 'Route 116', 'Rusturf Tunnel',
      'Dewford Town', 'Granite Cave', 'Route 109', 'Slateport City', 'Route 110',
      'Mauville City', 'Route 117', 'Route 111', 'Route 112', 'Fiery Path', 'Route 113',
      'Fallarbor Town', 'Route 114', 'Meteor Falls', 'Mt. Chimney', 'Route 115',
      'Verdanturf Town', 'Route 118', 'Route 119', 'Weather Institute', 'Fortree City',
      'Route 120', 'Route 121', 'Safari Zone', 'Lilycove City', 'Mt. Pyre', 'Route 122',
      'Route 123', 'Magma/Aqua Hideout', 'Route 124', 'Mossdeep City', 'Route 125',
      'Shoal Cave', 'Route 126', 'Sootopolis City', 'Cave of Origin', 'Route 127',
      'Route 128', 'Seafloor Cavern', 'Route 129', 'Route 130', 'Pacifidlog Town',
      'Route 131', 'Sky Pillar', 'Route 132', 'Route 133', 'Route 134', 'Ever Grande City',
      'Victory Road'
    ]
  };

  var SINNOH = {
    region: 'Sinnoh',
    badges: ['Coal', 'Forest', 'Cobble', 'Fen', 'Relic', 'Mine', 'Icicle', 'Beacon'],
    locations: [
      'Twinleaf Town', 'Route 201', 'Lake Verity', 'Sandgem Town', 'Route 202', 'Jubilife City',
      'Route 203', 'Oreburgh Gate', 'Oreburgh City', 'Oreburgh Mine', 'Route 204',
      'Ravaged Path', 'Floaroma Town', 'Route 205', 'Valley Windworks', 'Eterna Forest',
      'Eterna City', 'Route 211', 'Route 206', 'Wayward Cave', 'Route 207', 'Mt. Coronet',
      'Route 208', 'Hearthome City', 'Route 209', 'Lost Tower', 'Solaceon Town', 'Route 210',
      'Route 215', 'Veilstone City', 'Route 214', 'Valor Lakefront', 'Lake Valor',
      'Route 213', 'Pastoria City', 'Great Marsh', 'Route 212', 'Route 218', 'Canalave City',
      'Iron Island', 'Lake Acuity', 'Route 216', 'Route 217', 'Acuity Lakefront',
      'Snowpoint City', 'Route 219', 'Route 220', 'Route 221', 'Route 222', 'Sunyshore City',
      'Route 223', 'Route 224', 'Victory Road', 'Pokémon League', 'Stark Mountain'
    ]
  };

  var UNOVA = {
    region: 'Unova',
    badges: ['Trio', 'Basic', 'Insect', 'Bolt', 'Quake', 'Jet', 'Freeze', 'Legend'],
    locations: [
      'Nuvema Town', 'Route 1', 'Accumula Town', 'Route 2', 'Striaton City', 'Dreamyard',
      'Route 3', 'Wellspring Cave', 'Nacrene City', 'Pinwheel Forest', 'Skyarrow Bridge',
      'Castelia City', 'Route 4', 'Desert Resort', 'Relic Castle', 'Nimbasa City',
      'Route 5', 'Driftveil Drawbridge', 'Driftveil City', 'Cold Storage', 'Route 6',
      'Chargestone Cave', 'Mistralton City', 'Route 7', 'Celestial Tower', 'Twist Mountain',
      'Icirrus City', 'Dragonspiral Tower', 'Route 8', 'Moor of Icirrus', 'Tubeline Bridge',
      'Route 9', 'Opelucid City', 'Route 10', 'Victory Road', 'Pokémon League',
      'Route 11', 'Village Bridge', 'Route 12', 'Lacunosa Town', 'Route 13', 'Giant Chasm',
      'Undella Town', 'Route 14', 'Abundant Shrine', 'Black City', 'White Forest'
    ]
  };

  // Unova BW2 has a somewhat different route layout; provide a tailored list.
  var UNOVA_B2W2 = {
    region: 'Unova (B2W2)',
    badges: ['Basic', 'Toxic', 'Insect', 'Bolt', 'Quake', 'Jet', 'Legend', 'Wave'],
    locations: [
      'Aspertia City', 'Route 19', 'Floccesy Town', 'Route 20', 'Floccesy Ranch',
      'Virbank City', 'Virbank Complex', 'Castelia City', 'Castelia Sewers', 'Route 4',
      'Desert Resort', 'Relic Castle', 'Nimbasa City', 'Route 16', 'Lostlorn Forest',
      'Route 5', 'Driftveil City', 'Pokémon World Tournament', 'Relic Passage', 'Route 6',
      'Mistralton Cave', 'Chargestone Cave', 'Mistralton City', 'Route 7', 'Celestial Tower',
      'Lentimas Town', 'Reversal Mountain', 'Undella Town', 'Route 14', 'Abundant Shrine',
      'Undella Bay', 'Route 13', 'Lacunosa Town', 'Route 12', 'Village Bridge', 'Route 11',
      'Opelucid City', 'Route 9', 'Marine Tube', 'Humilau City', 'Route 22', 'Route 21',
      'Seaside Cave', 'Giant Chasm', 'Route 23', 'Victory Road', 'Pokémon League',
      'Twist Mountain', 'Icirrus City', 'Dragonspiral Tower'
    ]
  };

  // ---------- Game -> region mapping ----------
  // game key matches the value stored in state.game
  var GAMES = {
    // Gen 1
    'Red':        { gen: 1, region: KANTO },
    'Blue':       { gen: 1, region: KANTO },
    'Yellow':     { gen: 1, region: KANTO },
    // Gen 2
    'Gold':       { gen: 2, region: JOHTO },
    'Silver':     { gen: 2, region: JOHTO },
    'Crystal':    { gen: 2, region: JOHTO },
    // Gen 3 (FireRed/LeafGreen are Gen-3 Kanto remakes)
    'Ruby':       { gen: 3, region: HOENN },
    'Sapphire':   { gen: 3, region: HOENN },
    'Emerald':    { gen: 3, region: HOENN },
    'FireRed':    { gen: 3, region: KANTO },
    'LeafGreen':  { gen: 3, region: KANTO },
    // Gen 4 (HeartGold/SoulSilver are Gen-4 Johto remakes)
    'HeartGold':  { gen: 4, region: JOHTO },
    'SoulSilver': { gen: 4, region: JOHTO },
    'Diamond':    { gen: 4, region: SINNOH },
    'Pearl':      { gen: 4, region: SINNOH },
    'Platinum':   { gen: 4, region: SINNOH },
    // Gen 5
    'Black':      { gen: 5, region: UNOVA },
    'White':      { gen: 5, region: UNOVA },
    'Black 2':    { gen: 5, region: UNOVA_B2W2 },
    'White 2':    { gen: 5, region: UNOVA_B2W2 }
  };

  // Grouped list for the Setup dropdown
  var GAME_GROUPS = [
    { label: 'Gen 1', games: ['Red', 'Blue', 'Yellow'] },
    { label: 'Gen 2', games: ['Gold', 'Silver', 'Crystal'] },
    { label: 'Gen 3', games: ['Ruby', 'Sapphire', 'Emerald', 'FireRed', 'LeafGreen'] },
    { label: 'Gen 4', games: ['Diamond', 'Pearl', 'Platinum', 'HeartGold', 'SoulSilver'] },
    { label: 'Gen 5', games: ['Black', 'White', 'Black 2', 'White 2'] }
  ];

  // Real gym-badge images (Bulbagarden archives); fallback handled in UI.
  var BADGE_IMAGES = {"Boulder":"https://archives.bulbagarden.net/media/upload/d/dd/Boulder_Badge.png","Cascade":"https://archives.bulbagarden.net/media/upload/9/9c/Cascade_Badge.png","Thunder":"https://archives.bulbagarden.net/media/upload/a/a6/Thunder_Badge.png","Rainbow":"https://archives.bulbagarden.net/media/upload/b/b5/Rainbow_Badge.png","Soul":"https://archives.bulbagarden.net/media/upload/7/7d/Soul_Badge.png","Marsh":"https://archives.bulbagarden.net/media/upload/6/6b/Marsh_Badge.png","Volcano":"https://archives.bulbagarden.net/media/upload/1/12/Volcano_Badge.png","Earth":"https://archives.bulbagarden.net/media/upload/7/78/Earth_Badge.png","Zephyr":"https://archives.bulbagarden.net/media/upload/4/4a/Zephyr_Badge.png","Hive":"https://archives.bulbagarden.net/media/upload/0/08/Hive_Badge.png","Plain":"https://archives.bulbagarden.net/media/upload/a/a7/Plain_Badge.png","Fog":"https://archives.bulbagarden.net/media/upload/4/48/Fog_Badge.png","Storm":"https://archives.bulbagarden.net/media/upload/b/b9/Storm_Badge.png","Mineral":"https://archives.bulbagarden.net/media/upload/7/7b/Mineral_Badge.png","Glacier":"https://archives.bulbagarden.net/media/upload/e/e6/Glacier_Badge.png","Rising":"https://archives.bulbagarden.net/media/upload/5/58/Rising_Badge.png","Stone":"https://archives.bulbagarden.net/media/upload/6/63/Stone_Badge.png","Knuckle":"https://archives.bulbagarden.net/media/upload/9/97/Knuckle_Badge.png","Dynamo":"https://archives.bulbagarden.net/media/upload/3/34/Dynamo_Badge.png","Heat":"https://archives.bulbagarden.net/media/upload/c/c4/Heat_Badge.png","Balance":"https://archives.bulbagarden.net/media/upload/6/63/Balance_Badge.png","Feather":"https://archives.bulbagarden.net/media/upload/6/62/Feather_Badge.png","Mind":"https://archives.bulbagarden.net/media/upload/c/cc/Mind_Badge.png","Rain":"https://archives.bulbagarden.net/media/upload/9/9b/Rain_Badge.png","Coal":"https://archives.bulbagarden.net/media/upload/0/0b/Coal_Badge.png","Forest":"https://archives.bulbagarden.net/media/upload/8/8c/Forest_Badge.png","Cobble":"https://archives.bulbagarden.net/media/upload/2/27/Cobble_Badge.png","Fen":"https://archives.bulbagarden.net/media/upload/1/13/Fen_Badge.png","Relic":"https://archives.bulbagarden.net/media/upload/2/28/Relic_Badge.png","Mine":"https://archives.bulbagarden.net/media/upload/f/fe/Mine_Badge.png","Icicle":"https://archives.bulbagarden.net/media/upload/0/09/Icicle_Badge.png","Beacon":"https://archives.bulbagarden.net/media/upload/0/0c/Beacon_Badge.png","Trio":"https://archives.bulbagarden.net/media/upload/7/74/Trio_Badge.png","Basic":"https://archives.bulbagarden.net/media/upload/8/85/Basic_Badge.png","Insect":"https://archives.bulbagarden.net/media/upload/8/8a/Insect_Badge.png","Bolt":"https://archives.bulbagarden.net/media/upload/5/5b/Bolt_Badge.png","Quake":"https://archives.bulbagarden.net/media/upload/2/29/Quake_Badge.png","Jet":"https://archives.bulbagarden.net/media/upload/9/9c/Jet_Badge.png","Freeze":"https://archives.bulbagarden.net/media/upload/a/ac/Freeze_Badge.png","Legend":"https://archives.bulbagarden.net/media/upload/c/c0/Legend_Badge.png","Toxic":"https://archives.bulbagarden.net/media/upload/3/3e/Toxic_Badge.png","Wave":"https://archives.bulbagarden.net/media/upload/0/00/Wave_Badge.png"};

  return {
    games: GAMES,
    groups: GAME_GROUPS,
    get: function (gameKey) { return GAMES[gameKey] || null; },
    badgeImage: function (name) { return BADGE_IMAGES[name] || null; }
  };
})();

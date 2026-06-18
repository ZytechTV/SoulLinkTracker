/* Rendering: builds UI from App.state. Re-render on any change. */

window.App = window.App || {};

(function (App) {
	"use strict";

	var SHOWDOWN = "https://play.pokemonshowdown.com/sprites/ani/";
	var SHOWDOWN_SHINY = "https://play.pokemonshowdown.com/sprites/ani-shiny/";
	var FALLBACK =
		"data:image/svg+xml;utf8," +
		encodeURIComponent(
			'<svg xmlns="http://www.w3.org/2000/svg" width="72" height="64">' +
				'<rect width="72" height="64" fill="#100e1a"/>' +
				'<text x="36" y="38" font-size="28" text-anchor="middle" fill="#6c648a">?</text></svg>',
		);

	// inline placeholder sprites for Egg / Fossil (no Showdown gif for these)
	var EGG_SPRITE =
		"data:image/svg+xml;utf8," +
		encodeURIComponent(
			'<svg xmlns="http://www.w3.org/2000/svg" width="72" height="64">' +
				'<ellipse cx="36" cy="36" rx="20" ry="26" fill="#f6e7b8" stroke="#b9a96a" stroke-width="3"/>' +
				'<path d="M22 30 l6 6 6-6 6 6 6-6" fill="none" stroke="#9ec98f" stroke-width="3"/>' +
				'<circle cx="30" cy="48" r="3" fill="#9ec98f"/><circle cx="42" cy="50" r="3" fill="#9ec98f"/></svg>',
		);
	var FOSSIL_SPRITE =
		"data:image/svg+xml;utf8," +
		encodeURIComponent(
			'<svg xmlns="http://www.w3.org/2000/svg" width="72" height="64">' +
				'<rect x="14" y="14" width="44" height="40" rx="6" fill="#8d7b6a" stroke="#5a4d40" stroke-width="3"/>' +
				'<path d="M24 44 q6 -18 12 -10 q4 6 -2 12" fill="none" stroke="#3a3026" stroke-width="3"/>' +
				'<circle cx="44" cy="26" r="3" fill="#3a3026"/></svg>',
		);

	// special placeholder "pokemon" the user can pick before they hatch/revive
	var PLACEHOLDERS = [
		{ id: 9001, name: "Ei", slug: "egg", types: [], placeholder: true },
		{ id: 9002, name: "Fossil", slug: "fossil", types: [], placeholder: true },
	];

	// --- pokemon lookup helpers ---
	var BY_SLUG = {};
	PLACEHOLDERS.concat(window.POKEMON || []).forEach(function (p) {
		BY_SLUG[p.slug] = p;
	});
	App.pokeBySlug = function (slug) {
		return BY_SLUG[slug] || null;
	};
	App.isPlaceholder = function (slug) {
		return slug === "egg" || slug === "fossil";
	};

	// Evolution family id for a slug (whole line shares one id). Placeholders/unknown
	// return null (never blocked). Used for the dex/species clause.
	App.familyOf = function (slug) {
		if (!slug || slug === "egg" || slug === "fossil") return null;
		var p = BY_SLUG[slug];
		return p && p.family != null ? p.family : null;
	};

	// name (display) or raw slug -> canonical slug. Includes Egg/Fossil placeholders.
	var BY_NAME = {};
	PLACEHOLDERS.concat(window.POKEMON || []).forEach(function (p) {
		BY_NAME[p.name.toLowerCase()] = p.slug;
	});
	App.nameToSlug = function (name) {
		if (!name) return "";
		var n = String(name).trim().toLowerCase();
		if (BY_NAME[n]) return BY_NAME[n];
		var raw = n.replace(/[^a-z0-9]/g, "");
		return BY_SLUG[raw] ? raw : "";
	};

	function spriteUrl(slug, shiny) {
		if (!slug) return FALLBACK;
		if (slug === "egg") return EGG_SPRITE;
		if (slug === "fossil") return FOSSIL_SPRITE;
		return (shiny ? SHOWDOWN_SHINY : SHOWDOWN) + slug + ".gif";
	}
	App.spriteUrl = spriteUrl;

	// Type colors (incl. fairy for display, even though Gen 1-5 charts have no fairy).
	var TYPE_COLORS = {
		normal: "#9099a1",
		fire: "#ff9d55",
		water: "#4d90d5",
		electric: "#f3d23b",
		grass: "#63bb5b",
		ice: "#73cec0",
		fighting: "#ce4069",
		poison: "#ab6ac8",
		ground: "#d97746",
		flying: "#8fa9de",
		psychic: "#fa7179",
		bug: "#90c12c",
		rock: "#c7b78b",
		ghost: "#5269ac",
		dragon: "#0a6dc4",
		dark: "#5a5366",
		steel: "#5a8ea1",
		fairy: "#ec8fe6",
	};
	// Types valid for the currently selected game's generation (no Fairy in Gen 1-5).
	App.typesForCurrentGen = function (slug) {
		var p = App.pokeBySlug(slug);
		if (!p) return [];
		var gen = App.state.generation || 5;
		if (p.typesByGen && p.typesByGen[gen]) return p.typesByGen[gen];
		return p.types || [];
	};
	// Build the type chips for a pokemon slug, generation-correct. '' if none/placeholder.
	// playerId (optional) tags each chip so hovering a team weakness/resistance chip can
	// highlight the responsible type-chips of that player's pokemon.
	function typeChips(slug, playerId) {
		var types = App.typesForCurrentGen(slug);
		if (!types || !types.length) return "";
		var attr = playerId != null ? ' data-pcplayer="' + playerId + '"' : "";
		return (
			'<div class="type-chips">' +
			types
				.map(function (t) {
					return (
						'<span class="tchip pctype" style="background:' +
						(TYPE_COLORS[t] || "#777") +
						'"' +
						attr +
						' data-pctype="' +
						t +
						'">' +
						esc(t.toUpperCase()) +
						"</span>"
					);
				})
				.join("") +
			"</div>"
		);
	}
	App.typeChips = typeChips;
	App.typeColor = function (t) {
		return TYPE_COLORS[t] || "#777";
	};

	// Highest national-dex id available in each generation (for filtering by era).
	var GEN_MAX_ID = { 1: 151, 2: 251, 3: 386, 4: 493, 5: 649 };
	// Does a species (by slug) exist as of the given generation?
	App.existsInGen = function (slug, gen) {
		var p = App.pokeBySlug(slug);
		if (!p || p.id == null) return false;
		var cap = GEN_MAX_ID[gen] || 649;
		return p.id <= cap;
	};

	// Defensive multiplier of attacking type `atk` against a pokemon with `defTypes`.
	function defMultiplier(chart, getMult, atk, defTypes) {
		var m = 1;
		defTypes.forEach(function (dt) {
			m *= getMult(chart, atk, dt);
		});
		return m;
	}

	// Team type analysis for one player's living team (generation-correct).
	// Each affected member adds to that attacking type's bar; the EXTREME cases
	// count double so the chart is symmetric:
	//  weaknesses: >1x adds +1, ≥4x (double weakness) adds +2
	//  resistances: <1x adds +1, ≤0.25x (incl. 0x immunity) adds +2
	//  offense: per defending type, how many team members can hit it super-effectively
	App.teamTypeAnalysis = function (playerId) {
		var data = window.TYPE_DATA.forGen(App.state.generation);
		var types = data.types,
			chart = data.chart,
			getMult = window.TYPE_DATA.getMult;

		var members = App.teamEntries(playerId)
			.filter(function (x) {
				return x.entry.status === "alive" && x.entry.pokemon;
			})
			.map(function (x) {
				return App.typesForCurrentGen(x.entry.pokemon).filter(function (t) {
					return types.indexOf(t) >= 0; // ignore types not in this gen's chart (e.g. fairy)
				});
			})
			.filter(function (ts) {
				return ts.length;
			});

		var weak = {},
			resist = {};
		types.forEach(function (t) {
			weak[t] = 0;
			resist[t] = 0;
		});

		members.forEach(function (defTypes) {
			types.forEach(function (atk) {
				var m = defMultiplier(chart, getMult, atk, defTypes);
				if (m > 1) weak[atk] += m >= 4 ? 2 : 1;
				else if (m < 1) resist[atk] += m <= 0.25 ? 2 : 1;
			});
		});

		// list a type when at least one member is affected (count >= 1).
		// dir: 'desc' = highest first (weaknesses), 'asc' = highest last (resists,
		// so the tallest bars sit on the right, right-aligned).
		function toSorted(obj, dir) {
			return Object.keys(obj)
				.filter(function (t) {
					return obj[t] >= 1;
				})
				.map(function (t) {
					return { type: t, count: obj[t] };
				})
				.sort(function (a, b) {
					return dir === "asc" ? a.count - b.count : b.count - a.count;
				});
		}
		return {
			weak: toSorted(weak, "desc"),
			resist: toSorted(resist, "asc"),
			size: members.length,
		};
	};

	// Per-pokemon breakdown of how a player's team is weak/resistant to one
	// attacking type. Returns [{ name, types, mult }] for the members that are
	// affected in the requested direction (weak: >1x, resist: <1x), so the hover
	// tooltip can show exactly which pokemon contribute and by how much.
	App.typeBreakdown = function (playerId, atk, kind) {
		var data = window.TYPE_DATA.forGen(App.state.generation);
		var chart = data.chart,
			validTypes = data.types,
			getMult = window.TYPE_DATA.getMult;
		var out = [];
		App.teamEntries(playerId).forEach(function (x) {
			var e = x.entry;
			if (e.status !== "alive" || !e.pokemon) return;
			var defTypes = App.typesForCurrentGen(e.pokemon).filter(function (t) {
				return validTypes.indexOf(t) >= 0;
			});
			if (!defTypes.length) return;
			var m = defMultiplier(chart, getMult, atk, defTypes);
			var hit = kind === "weak" ? m > 1 : m < 1;
			if (!hit) return;
			var p = App.pokeBySlug(e.pokemon);
			out.push({
				name: e.nickname || (p ? p.name : e.pokemon),
				types: defTypes,
				mult: m
			});
		});
		// strongest effect first
		return out.sort(function (a, b) {
			return kind === "weak" ? b.mult - a.mult : a.mult - b.mult;
		});
	};

	// kind: 'weak' | 'resist' — vertical bar chart, one column per type. Bar height
	// scales to `maxCount` so weaknesses and resistances share the same scale.
	// Hovering a column still highlights the responsible type-chips (data-ana*).
	function analysisBars(list, kind, playerId, maxCount) {
		if (!list.length) return '<div class="ta-empty hint">—</div>';
		var max = Math.max(1, maxCount || 1);
		return (
			'<div class="ta-bars">' +
			list
				.map(function (o) {
					var pct = Math.round((o.count / max) * 100);
					var col = TYPE_COLORS[o.type] || "#777";
					return (
						'<div class="ta-bar" ' +
						'data-anatype="' +
						o.type +
						'" data-anakind="' +
						kind +
						'" data-anaplayer="' +
						playerId +
						'">' +
						'<div class="ta-bar-track">' +
						'<div class="ta-bar-fill" style="height:' +
						pct +
						"%;background:" +
						col +
						'"><span class="ta-bar-val">' +
						o.count +
						"</span></div></div>" +
						'<span class="ta-bar-lbl" style="color:' +
						col +
						'">' +
						esc(o.type.slice(0, 3).toUpperCase()) +
						"</span></div>"
					);
				})
				.join("") +
			"</div>"
		);
	}
	App.analysisBars = analysisBars;

	function esc(s) {
		return String(s == null ? "" : s)
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;");
	}
	App.esc = esc;

	function el(id) {
		return document.getElementById(id);
	}

	// pokemon <option> string for select fallback (we use datalist mostly)
	function displayName(slug) {
		var p = BY_SLUG[slug];
		return p ? p.name : slug || "";
	}
	App.displayName = displayName;

	// ---------- Top-level render ----------
	App.render = function () {
		App.recomputeDeaths();
		// gate: before a game is started, force the Setup start screen
		if (!App.state.started) App.state.activeTab = "Setup";
		// only Dashboard + Bank exist as tabs now; fall back to Dashboard
		else if (["Dashboard", "Bank", "Info", "Catch", "Caps", "Room"].indexOf(App.state.activeTab) < 0)
			App.state.activeTab = "Dashboard";
		renderTabsActive();
		renderTabActions();
		var t = App.state.activeTab;
		if (t === "Setup") renderSetup();
		else if (t === "Dashboard") renderDashboard();
		else if (t === "Bank") renderBank();
		else if (t === "Info") renderPokemonInfo();
		else if (t === "Catch") renderCatchRate();
		else if (t === "Caps") renderLevelCaps();
		else if (t === "Room") renderRoom();
		populateDatalist();
		if (App._refreshLog) App._refreshLog();
	};

	var datalistDone = false;
	function populateDatalist() {
		if (datalistDone) return;
		var dl = el("pokedex");
		if (!dl) return;
		var html = PLACEHOLDERS.concat(window.POKEMON || [])
			.map(function (p) {
				return (
					'<option value="' +
					esc(p.name) +
					'" data-slug="' +
					esc(p.slug) +
					'"></option>'
				);
			})
			.join("");
		dl.innerHTML = html;
		datalistDone = true;
	}

	function renderTabsActive() {
		// The tab bar only appears once a game has been started/loaded.
		var nav = document.getElementById("tabnav");
		if (nav) nav.style.display = App.state.started ? "" : "none";
		document.querySelectorAll(".tabbtn").forEach(function (b) {
			var tab = b.getAttribute("data-tab");
			b.classList.toggle("active", tab === App.state.activeTab);
		});
		document.querySelectorAll(".tabpanel").forEach(function (p) {
			p.classList.toggle("active", p.id === "tab-" + App.state.activeTab);
		});
	}

	// Right-aligned global actions inside the tab bar: LIVE/offline status pill
	// (click -> Room view), square save (💾) and quit (✕). Only while running.
	function renderTabActions() {
		var host = el("tabActions");
		if (!host) return;
		if (!App.state.started) { host.innerHTML = ""; return; }

		var live = "";
		if (App.syncAvailable && App.syncAvailable()) {
			live = (App.room && App.room.code)
				? '<span class="room-pill" data-tab="Room" title="Live — click for room code, password & members">🔴 LIVE</span>'
				: '<span class="room-pill off" data-tab="Room" title="Not in a live room — click to open the room view">⚪ offline</span>';
		}
		host.innerHTML =
			live +
			'<button class="btn ok ta-btn ta-square" id="taExportBtn" title="Save / download as JSON">💾</button>' +
			'<button class="btn danger ta-btn ta-square" id="taResetBtn" title="Quit to start screen (export first!)">✕</button>';
	}

	// Current hardcore level cap for the active game, derived from earned badges.
	// Returns { caps, currentIdx, current } or null if no data for this game.
	// `current` is the next not-yet-cleared boss (the cap to play under); null
	// once everything is cleared.
	App.levelCapInfo = function () {
		var caps = window.LEVEL_CAPS ? window.LEVEL_CAPS.get(App.state.game) : null;
		if (!caps) return null;
		var earned = (App.state.badges || []).filter(Boolean).length;
		var currentIdx = caps.length; // default: all cleared
		for (var i = 0; i < caps.length; i++) {
			var cleared = caps[i].kind === "gym" ? caps[i].gymIndex < earned : false;
			if (!cleared) { currentIdx = i; break; }
		}
		return {
			caps: caps,
			currentIdx: currentIdx,
			current: currentIdx < caps.length ? caps[currentIdx] : null
		};
	};

	// ---------- Status block (badges + counters) — lives in the Dashboard ----------
	function statusBlockHtml() {
		var region = App.regionInfo();
		var badgeNames = region
			? region.badges
			: ["1", "2", "3", "4", "5", "6", "7", "8"];
		var badges = badgeNames
			.map(function (name, i) {
				var earned = !!App.state.badges[i];
				var img = window.REGION_DATA.badgeImage
					? window.REGION_DATA.badgeImage(name)
					: null;
				var inner;
				if (img) {
					// real badge sprite; if it fails to load, fall back to the lettered circle
					inner =
						'<img class="badge-img" src="' +
						esc(img) +
						'" alt="' +
						esc(name) +
						'" ' +
						"onerror=\"this.parentNode.classList.add('nobimg');this.remove();\" />" +
						'<span class="badge-fallback">' +
						esc(name.slice(0, 3)) +
						"</span>";
				} else {
					inner =
						'<span class="badge-fallback">' + esc(name.slice(0, 3)) + "</span>";
				}
				return (
					'<div class="badge has-img ' +
					(earned ? "earned" : "") +
					'" data-badge="' +
					i +
					'" title="' +
					esc(name) +
					' Badge">' +
					inner +
					"</div>"
				);
			})
			.join("");

		// per-player lifetime (run-spanning) death counter
		var graves = App.state.players
			.map(function (p) {
				return (
					'<span class="grave-counter" style="border-color:' +
					esc(p.color) +
					'" ' +
					'title="' +
					esc(p.name) +
					' — total deaths across all runs">' +
					'🪦 <b style="color:' +
					esc(p.color) +
					'">' +
					(p.totalDeaths != null ? p.totalDeaths : p.deaths || 0) +
					"</b></span>"
				);
			})
			.join("");

		// current level cap (next uncleared boss), shown next to the badges
		var capInfo = App.levelCapInfo();
		var capChip = "";
		if (capInfo) {
			capChip = capInfo.current
				? '<div class="cap-chip" title="Hardcore level cap — ' +
					esc(capInfo.current.label) +
					'. See the Level Caps tab.">' +
					'<span class="cap-chip-label">Lv Cap</span>' +
					'<b>' +
					capInfo.current.level +
					"</b></div>"
				: '<div class="cap-chip done" title="All bosses cleared — no level cap.">' +
					'<span class="cap-chip-label">Lv Cap</span><b>—</b></div>';
		}

		return (
			'<div class="status-block">' +
			'<div class="badgebar" id="badgebar">' +
			badges +
			"</div>" +
			capChip +
			'<div class="counters">' +
			graves +
			"</div>" +
			"</div>"
		);
	}

	// Start-screen card: join a friend's live room without creating a game first.
	function joinRoomCardHtml() {
		if (!App.syncAvailable || !App.syncAvailable()) return "";
		return (
			'<div class="card"><h2>🔴 Join Live Room</h2>' +
			'<p class="hint">A friend opened a room? Enter the code + password to jump ' +
			"straight into their run — no need to create a game.</p>" +
			'<div class="field" style="margin-top:10px"><label>Room code</label>' +
			'<input type="text" id="joinRoomCode" placeholder="e.g. black2-torben" autocomplete="off" /></div>' +
			'<div class="field" style="margin-top:8px"><label>Password</label>' +
			'<input type="password" id="joinRoomPw" placeholder="room password" autocomplete="off" /></div>' +
			'<button class="btn ok" id="joinRoomCardBtn" style="margin-top:12px;width:100%">Join room</button>' +
			"</div>"
		);
	}

	// ---------- Setup ----------
	function gameOptions(selected) {
		return window.REGION_DATA.groups
			.map(function (g) {
				var opts = g.games
					.map(function (gm) {
						return (
							'<option value="' +
							esc(gm) +
							'"' +
							(gm === selected ? " selected" : "") +
							">" +
							esc(gm) +
							"</option>"
						);
					})
					.join("");
				return '<optgroup label="' + esc(g.label) + '">' + opts + "</optgroup>";
			})
			.join("");
	}

	function renderSetup() {
		if (!App.state.started) renderStartScreen();
		else renderSettings();
	}

	// --- Start screen (no game running yet) ---
	function renderStartScreen() {
		var def = window.REGION_DATA.get("HeartGold") ? "HeartGold" : "Red";
		var playerCountOpts = [2, 3, 4]
			.map(function (n) {
				return (
					'<option value="' +
					n +
					'"' +
					(n === 2 ? " selected" : "") +
					">" +
					n +
					" players</option>"
				);
			})
			.join("");

		el("tab-Setup").innerHTML =
			'<div class="card start-hero"><h1 class="hero-title">SOUL&nbsp;LINK</h1>' +
			'<p class="hint">Start a new challenge or load a save.</p></div>' +
			'<div class="setup-cols">' +
			'<div class="card"><h2>▶ New Game</h2>' +
			'<div class="field"><label>Pokémon game</label>' +
			'<select id="newGameSelect">' +
			gameOptions(def) +
			"</select></div>" +
			'<div class="field" style="margin-top:8px"><label>Number of players</label>' +
			'<select id="newPlayerCount">' +
			playerCountOpts +
			"</select></div>" +
			'<div id="newPlayerFields" style="margin-top:10px"></div>' +
			'<button class="btn ok" id="startGameBtn" style="margin-top:12px;width:100%">Start game</button>' +
			"</div>" +
			'<div class="card"><h2>⬆ Load Save</h2>' +
			'<p class="hint">Load a previously exported <b>.json</b> file to continue right where you left off.</p>' +
			'<button class="btn" id="importBtn" style="margin-top:12px;width:100%">Choose JSON file</button>' +
			"</div>" +
			joinRoomCardHtml() +
			"</div>";

		renderNewPlayerFields(2);
	}

	// Player name/color inputs for the new-game form (kept in a temp buffer)
	App._newGameMeta = App._newGameMeta || [];
	function renderNewPlayerFields(n) {
		var host = el("newPlayerFields");
		if (!host) return;
		var meta = App._newGameMeta;
		var html = "";
		for (var i = 0; i < n; i++) {
			if (!meta[i])
				meta[i] = {
					name: "Player " + (i + 1),
					color: App.DEFAULT_COLORS[i % App.DEFAULT_COLORS.length],
				};
			html +=
				'<div class="player-setup" style="--pc:' +
				esc(meta[i].color) +
				'">' +
				'<div class="field"><label>Name (Player ' +
				(i + 1) +
				")</label>" +
				'<input type="text" data-newpname="' +
				i +
				'" value="' +
				esc(meta[i].name) +
				'" /></div>' +
				'<div class="field"><label>Color</label>' +
				'<input type="color" data-newpcolor="' +
				i +
				'" value="' +
				esc(meta[i].color) +
				'" /></div>' +
				"</div>";
		}
		meta.length = n; // trim
		host.innerHTML = html;
	}
	App._renderNewPlayerFields = renderNewPlayerFields;

	// --- Settings (game running): edit names/colors/rules + save/reset ---
	function renderSettings() {
		var s = App.state;
		var playersHtml = s.players
			.map(function (p) {
				return (
					'<div class="player-setup" style="--pc:' +
					esc(p.color) +
					'">' +
					'<div class="field"><label>Name (Player ' +
					p.id +
					")</label>" +
					'<input type="text" data-pname="' +
					p.id +
					'" value="' +
					esc(p.name) +
					'" /></div>' +
					'<div class="field"><label>Color</label>' +
					'<input type="color" data-pcolor="' +
					p.id +
					'" value="' +
					esc(p.color) +
					'" /></div>' +
					"</div>"
				);
			})
			.join("");

		el("tab-Setup").innerHTML =
			'<div class="card"><h2>Current Game</h2>' +
			'<p class="hint">Game: <b>' +
			esc(s.game) +
			"</b> · Region: " +
			esc(App.regionInfo() ? App.regionInfo().region : "?") +
			" · Generation " +
			s.generation +
			" · <b>Try #" +
			(s.tryCount || 1) +
			"</b>" +
			"<br>Game &amp; player count are fixed after start (otherwise catches become inconsistent). For a different game: reset.</p>" +
			"</div>" +
			'<div class="card"><h2>Players</h2>' +
			playersHtml +
			'<p class="hint">Names &amp; colors can be changed at any time.</p></div>' +
			'<div class="card"><h2>Rules</h2>' +
			'<label><input type="checkbox" id="burnAll"' +
			(s.uncaughtBurnsAll ? " checked" : "") +
			'/> "Not caught" burns the encounter for all players on that route</label>' +
			"</div>" +
			'<div class="card"><h2>Save (JSON)</h2>' +
			'<p class="hint">No auto-save. Export regularly! The browser warns about unsaved changes when closing.</p>' +
			'<div class="row">' +
			'<button class="btn ok" id="exportBtn">Export JSON</button>' +
			'<button class="btn" id="importBtn">Load another save</button>' +
			'<div class="spacer"></div>' +
			'<button class="btn danger" id="resetBtn">New game / Reset</button>' +
			"</div>" +
			"</div>";
	}

	// ---------- Catch ----------
	function statusPills(catchId, playerId, status) {
		function p(val, cls, label) {
			var sel = status === val ? " sel-" + val : "";
			return (
				'<div class="pill' +
				sel +
				'" data-setstatus="' +
				val +
				'" data-catch="' +
				catchId +
				'" data-player="' +
				playerId +
				'">' +
				label +
				"</div>"
			);
		}
		return (
			'<div class="status-pills">' +
			p("alive", "", "Alive") +
			p("dead", "", "Dead") +
			p("uncaught", "", "n/c") +
			"</div>"
		);
	}

	function entryCard(c, entry) {
		var player = App.playerById(entry.playerId);
		if (!player) return "";
		var poke = App.pokeBySlug(entry.pokemon);
		var nameVal = poke ? poke.name : "";
		var dead = entry.status === "dead";
		var src = spriteUrl(entry.pokemon, entry.shiny);
		return (
			'<div class="entry-card' +
			(dead ? " dead" : "") +
			'" style="--pc:' +
			esc(player.color) +
			'">' +
			'<div class="ec-top">' +
			'<img class="ec-sprite" src="' +
			esc(src) +
			'" alt="" ' +
			"onerror=\"this.onerror=null;this.src='" +
			FALLBACK +
			"'\" />" +
			'<div style="flex:1"><b style="color:' +
			esc(player.color) +
			';font-size:9px">' +
			esc(player.name) +
			"</b>" +
			'<input type="text" list="pokedex" placeholder="Pokémon…" ' +
			'data-pokeinput data-catch="' +
			c.id +
			'" data-player="' +
			entry.playerId +
			'" ' +
			'value="' +
			esc(nameVal) +
			'" />' +
			"</div>" +
			"</div>" +
			'<input type="text" placeholder="Nickname" data-field="nickname" ' +
			'data-catch="' +
			c.id +
			'" data-player="' +
			entry.playerId +
			'" value="' +
			esc(entry.nickname) +
			'" />' +
			'<div class="row" style="margin-top:4px;gap:6px">' +
			'<label style="margin:0;display:flex;gap:4px;align-items:center;font-size:8px">' +
			'<input type="checkbox" data-field="shiny" data-catch="' +
			c.id +
			'" data-player="' +
			entry.playerId +
			'"' +
			(entry.shiny ? " checked" : "") +
			"/> Shiny</label>" +
			"</div>" +
			statusPills(c.id, entry.playerId, entry.status) +
			"</div>"
		);
	}

	function renderCatch() {
		var s = App.state;

		var blameSel = function (c) {
			var opts =
				'<option value="">— who is to blame? —</option>' +
				s.players
					.map(function (p) {
						var sel = c.deathBlame === p.id ? " selected" : "";
						return (
							'<option value="' +
							p.id +
							'"' +
							sel +
							">" +
							esc(p.name) +
							"</option>"
						);
					})
					.join("");
			var anyDead = c.entries.some(function (e) {
				return e.status === "dead";
			});
			return (
				'<select data-blame="' +
				c.id +
				'"' +
				(anyDead ? "" : " disabled") +
				">" +
				opts +
				"</select>"
			);
		};

		var catchesHtml = s.catches
			.slice()
			.reverse()
			.map(function (c) {
				var cards = c.entries
					.map(function (e) {
						return entryCard(c, e);
					})
					.join("");
				var typeTag =
					c.catchType === "static"
						? '<span class="ctype static">★ Static</span>'
						: '<span class="ctype normal">Normal</span>';
				return (
					'<div class="catch-entry" id="catch-' +
					c.id +
					'">' +
					'<div class="catch-head">' +
					'<span class="route-name">📍 ' +
					esc(c.route || "(no route)") +
					"</span>" +
					typeTag +
					'<div class="spacer"></div>' +
					'<label style="margin:0;font-size:8px">Blame:</label>' +
					blameSel(c) +
					'<button class="btn danger small" data-delcatch="' +
					c.id +
					'">Delete</button>' +
					"</div>" +
					'<div class="catch-players">' +
					cards +
					"</div>" +
					"</div>"
				);
			})
			.join("");

		el("tab-Catch").innerHTML =
			'<div class="card"><h2>Encounters (' +
			s.catches.length +
			")</h2>" +
			'<p class="hint">Edit existing encounters here. Add new ones via <b>Dashboard → New Encounter</b>.</p>' +
			'<button class="btn ok" id="dashNewCatch" style="margin-bottom:12px">New Encounter</button>' +
			(catchesHtml || '<p class="hint">No encounters yet.</p>') +
			"</div>";
	}

	// ---------- Dashboard (teams side-by-side) ----------
	function slotHtml(player, item) {
		if (!item) {
			return (
				'<div class="slot empty" style="--pc:' +
				esc(player.color) +
				'" ' +
				'data-bankpick="' +
				player.id +
				'" title="Bring a pokémon from the bank">+</div>'
			);
		}
		var e = item.entry;
		var poke = App.pokeBySlug(e.pokemon);
		var dead = e.status === "dead";
		var src = spriteUrl(e.pokemon, e.shiny);
		var atk =
			'data-catch="' + item.catchId + '" data-player="' + player.id + '"';
		var actions;
		if (dead) {
			actions =
				'<button class="btn ghost small" data-tobank ' +
				atk +
				">To bank</button>";
		} else {
			actions =
				'<button class="btn ghost small" data-evolve ' +
				atk +
				' title="Evolve / hatch egg / revive fossil">Evolve</button>' +
				'<button class="btn danger small" data-killlink ' +
				atk +
				' title="Kills the entire soul-link">Died</button>' +
				'<button class="btn ghost small" data-tobank ' +
				atk +
				' title="Move the whole link to the bank">To bank</button>';
		}
		var hl = e.pokemon
			? ' data-typehl="' +
				esc(e.pokemon) +
				'" title="Click to highlight types in the chart"'
			: "";
		var lupe = e.pokemon
			? '<button class="corner-icon info-lupe" data-infolookup="' +
				esc(e.pokemon) +
				'" title="Open Pokémon Info">🔍</button>'
			: "";
		return (
			'<div class="slot' +
			(dead ? " dead" : "") +
			'" style="--pc:' +
			esc(player.color) +
			'">' +
			'<span class="route-tag">' +
			esc(item.route) +
			"</span>" +
			'<div class="corner-icons">' +
			lupe +
			'<button class="corner-icon edit-pencil" data-edit-catch="' +
			item.catchId +
			'" data-edit-player="' +
			player.id +
			'" title="Pokémon details / edit">✏️</button>' +
			"</div>" +
			(dead ? '<span class="grave">🪦</span>' : "") +
			'<div class="slot-poke"' +
			hl +
			">" +
			'<img class="sprite" src="' +
			esc(src) +
			'" alt="" ' +
			"onerror=\"this.onerror=null;this.src='" +
			FALLBACK +
			"'\" />" +
			'<div class="pkmn-name">' +
			esc(poke ? poke.name : e.pokemon) +
			"</div>" +
			(e.nickname
				? '<div class="pkmn-nick">"' + esc(e.nickname) + '"</div>'
				: "") +
			"</div>" +
			typeChips(e.pokemon, player.id) +
			'<div class="slot-actions">' +
			actions +
			"</div>" +
			"</div>"
		);
	}

	function renderDashboard() {
		var s = App.state;
		var cols = s.players
			.map(function (p) {
				var team = App.teamEntries(p.id); // alive + dead in team
				var slots = [];
				for (var i = 0; i < 6; i++) slots.push(slotHtml(p, team[i] || null));

				var an = App.teamTypeAnalysis(p.id);
				// shared vertical scale across both charts for this player
				var anaMax = 1;
				an.weak.concat(an.resist).forEach(function (o) {
					if (o.count > anaMax) anaMax = o.count;
				});
				var analysis =
					'<div class="team-analysis">' +
					'<div class="ta-col ta-weak">' +
					'<div class="ta-title">+ Weaknesses</div>' +
					analysisBars(an.weak, "weak", p.id, anaMax) +
					"</div>" +
					'<div class="ta-col ta-resist">' +
					'<div class="ta-title">Resistances −</div>' +
					analysisBars(an.resist, "resist", p.id, anaMax) +
					"</div>" +
					"</div>";

				return (
					'<div class="dash-col">' +
					'<div class="player-header" style="--pc:' +
					esc(p.color) +
					'">' +
					'<span class="pname" style="color:' +
					esc(p.color) +
					'">' +
					esc(p.name) +
					"</span>" +
					'<span class="pdeaths" title="Deaths this run (Try #' +
					(App.state.tryCount || 1) +
					')">🪦 ' +
					p.deaths +
					"</span>" +
					"</div>" +
					'<div class="hint" style="margin-bottom:6px">' +
					team.length +
					"/6 in team</div>" +
					'<div class="dash-slots">' +
					slots.join("") +
					"</div>" +
					analysis +
					"</div>"
				);
			})
			.join("");

		el("tab-Dashboard").innerHTML =
			'<div class="card status-card">' +
			'<div class="status-card-head">' +
			'<span class="sb-title">SOUL&nbsp;LINK</span>' +
			'<span class="try-badge" title="Attempt / Try">Try #' +
			(s.tryCount || 1) +
			"</span>" +
			'<span class="hint">' +
			esc(s.game) +
			" · " +
			esc(App.regionInfo() ? App.regionInfo().region : "?") +
			"</span>" +
			"</div>" +
			statusBlockHtml() +
			"</div>" +
			'<div class="card">' +
			'<div class="dash-titlebar">' +
			'<h2 style="margin:0">Dashboard</h2>' +
			'<button class="btn ok" id="dashNewCatch">New Encounter</button>' +
			"</div>" +
			'<div class="dash-cols">' +
			cols +
			"</div>" +
			"</div>" +
			'<div class="type-row">' +
			'<div class="card type-chart-card"><h2>Type Chart — Gen ' +
			s.generation +
			"</h2>" +
			typeTableHtml() +
			"</div>" +
			'<div class="card type-matchup-card"><h2>Type Matchup</h2>' +
			matchupHtml() +
			"</div>" +
			"</div>";
	}

	// ---------- Type matchup module (two pickers, both directions) ----------
	function matchupSlotBtn(side) {
		var slug = App._matchup && App._matchup[side];
		var poke = slug ? App.pokeBySlug(slug) : null;
		return (
			'<button type="button" class="poke-pick' +
			(poke ? " chosen" : "") +
			'" data-matchupbtn="' +
			side +
			'" data-mslug="' +
			(poke ? esc(poke.slug) : "") +
			'">' +
			'<img class="pp-sprite" src="' +
			(poke ? esc(spriteUrl(poke.slug, false)) : FALLBACK) +
			'" />' +
			'<span class="pp-label">' +
			(poke ? esc(poke.name) : "Choose…") +
			"</span></button>"
		);
	}

	// One direction: how effective is an attack of EACH type against the defender's
	// type combo, when used by `atkSlug`. A pokemon can carry a move of any type, so
	// we test all 17 attack types. If a move type matches one of the attacker's own
	// types it gets STAB (×1.5) and is flagged. Only non-neutral effective values shown.
	function matchupDirection(atkSlug, defSlug) {
		var data = window.TYPE_DATA.forGen(App.state.generation);
		var chart = data.chart,
			getMult = window.TYPE_DATA.getMult,
			types = data.types;
		var defTypes = App.typesForCurrentGen(defSlug).filter(function (t) {
			return types.indexOf(t) >= 0;
		});
		var atkTypes = App.typesForCurrentGen(atkSlug).filter(function (t) {
			return types.indexOf(t) >= 0;
		});
		var out = [];
		types.forEach(function (atk) {
			var eff = 1;
			defTypes.forEach(function (dt) {
				eff *= getMult(chart, atk, dt);
			});
			var stab = atkTypes.indexOf(atk) >= 0;
			var total = stab ? eff * 1.5 : eff;
			if (total !== 1) out.push({ type: atk, mult: eff, stab: stab, total: total });
		});
		// strongest first (by total damage multiplier)
		out.sort(function (a, b) { return b.total - a.total; });
		return out;
	}

	function fmtMult(v) {
		var map = { 0: "0", 0.25: "¼", 0.5: "½", 0.75: "¾", 1.5: "1½", 3: "3", 6: "6" };
		if (map[v] != null) return map[v];
		// strip trailing .0
		return (Math.round(v * 100) / 100 + "").replace(/\.0+$/, "");
	}
	function multChip(o) {
		// the multiplier value is colored by the total damage multiplier
		var t = o.total;
		var valCls =
			t === 0
				? "mv-0"
				: t < 1
					? t <= 0.25
						? "mv-25"
						: "mv-50"
					: t > 1
						? t >= 3
							? "mv-4"
							: "mv-2"
						: "mv-1";
		// STAB attacks are underlined instead of badged
		return (
			'<span class="mu-chip' +
			(o.stab ? " mu-stab-on" : "") +
			'" title="' +
			(o.stab ? "STAB (×1.5 included)" : "type effectiveness") +
			'"><span class="tchip" style="background:' +
			App.typeColor(o.type) +
			'">' +
			esc(o.type.toUpperCase()) +
			'</span> <span class="mu-val ' +
			valCls +
			'">×' +
			fmtMult(o.total) +
			"</span></span>"
		);
	}

	function matchupHtml() {
		var mu = App._matchup || {};
		var lp = mu.left ? App.pokeBySlug(mu.left) : null;
		var rp = mu.right ? App.pokeBySlug(mu.right) : null;

		// type chips for a chosen pokemon (gen-correct), or empty
		function muTypes(slug) {
			return slug ? typeChips(slug) || "" : "";
		}
		// the attack box that belongs UNDER a side = how that side attacks the other
		function attackBox(atkSlug, atkPoke, defPoke) {
			if (!atkSlug || !defPoke) return "";
			var list = matchupDirection(atkSlug, defPoke.slug);
			return (
				'<div class="mu-dir"><div class="mu-dir-title">' +
				esc(atkPoke.name) +
				"'s attacks → " +
				esc(defPoke.name) +
				'</div><div class="mu-chips">' +
				(list.map(multChip).join("") ||
					'<span class="hint">all neutral (×1)</span>') +
				"</div></div>"
			);
		}

		function sideHtml(side, label) {
			var slug = mu[side];
			var poke = slug ? App.pokeBySlug(slug) : null;
			var other = side === "left" ? rp : lp;
			return (
				'<div class="mu-col">' +
				"<label>" +
				label +
				"</label>" +
				matchupSlotBtn(side) +
				'<div class="mu-types">' +
				muTypes(slug) +
				"</div>" +
				(poke && other ? attackBox(slug, poke, other) : "") +
				"</div>"
			);
		}

		return (
			'<div class="matchup">' +
			(lp && rp
				? ""
				: '<p class="hint" style="margin:0 0 8px">Pick two Pokémon to see which attack types are effective against each (STAB included, only non-neutral shown).</p>') +
			'<div class="mu-cols">' +
			sideHtml("left", "Your side") +
			'<div class="mu-vs">VS</div>' +
			sideHtml("right", "Opponent") +
			"</div>" +
			"</div>"
		);
	}

	// ---------- Bank (per-player columns: Team zone + Bank zone, drag & drop) ----------
	// A draggable pokemon card.
	function bankCard(x, color) {
		var e = x.entry;
		var poke = App.pokeBySlug(e.pokemon);
		var dead = e.status === "dead";
		var placeholder = !e.pokemon; // reroll entry: no species
		var src = spriteUrl(e.pokemon, e.shiny);
		var label = placeholder
			? e.reroll
				? "🔁 rerolled"
				: "(empty)"
			: poke
				? poke.name
				: e.pokemon;
		return (
			'<div class="bcard' +
			(dead ? " dead" : "") +
			(placeholder ? " placeholder" : "") +
			'" draggable="true" ' +
			'data-dragcatch="' +
			x.catchId +
			'" data-dragplayer="' +
			e.playerId +
			'" ' +
			'style="--pc:' +
			esc(color) +
			'">' +
			'<span class="route-tag">' +
			esc(x.route) +
			"</span>" +
			'<div class="corner-icons">' +
			(e.pokemon
				? '<button class="corner-icon info-lupe" data-infolookup="' +
					esc(e.pokemon) +
					'" title="Open Pokémon Info">🔍</button>'
				: "") +
			'<button class="corner-icon edit-pencil" data-edit-catch="' +
			x.catchId +
			'" data-edit-player="' +
			e.playerId +
			'" title="Pokémon details / edit">✏️</button>' +
			"</div>" +
			(dead ? '<span class="grave">🪦</span>' : "") +
			'<img class="sprite" src="' +
			esc(src) +
			'" draggable="false" ' +
			"onerror=\"this.onerror=null;this.src='" +
			FALLBACK +
			"'\" />" +
			'<div class="pkmn-name">' +
			esc(label) +
			"</div>" +
			(e.nickname
				? '<div class="pkmn-nick">"' + esc(e.nickname) + '"</div>'
				: "") +
			typeChips(e.pokemon) +
			"</div>"
		);
	}

	function renderBank() {
		var s = App.state;

		var cols = s.players
			.map(function (p) {
				// team = location team (alive + dead); bank = location bank (alive + dead); skip uncaught
				var team = [],
					bank = [];
				App.state.catches.forEach(function (c) {
					c.entries.forEach(function (e) {
						if (e.playerId !== p.id || e.status === "uncaught") return;
						var item = { entry: e, route: c.route, catchId: c.id };
						if (e.location === "team") team.push(item);
						else bank.push(item);
					});
				});

				var teamCards = team
					.map(function (x) {
						return bankCard(x, p.color);
					})
					.join("");
				var bankCards = bank
					.map(function (x) {
						return bankCard(x, p.color);
					})
					.join("");

				return (
					'<div class="bank-col" style="--pc:' +
					esc(p.color) +
					'">' +
					'<div class="player-header" style="--pc:' +
					esc(p.color) +
					'">' +
					'<span class="pname" style="color:' +
					esc(p.color) +
					'">' +
					esc(p.name) +
					"</span>" +
					'<span class="pdeaths">🪦 ' +
					p.deaths +
					"</span>" +
					"</div>" +
					'<div class="bank-zone team-zone" data-zone="team" data-zoneplayer="' +
					p.id +
					'">' +
					'<div class="zone-label">TEAM (' +
					team.length +
					"/6)</div>" +
					'<div class="zone-cards">' +
					(teamCards || '<div class="zone-empty">drop here</div>') +
					"</div>" +
					"</div>" +
					'<div class="bank-zone box-zone" data-zone="bank" data-zoneplayer="' +
					p.id +
					'">' +
					'<div class="zone-label">BANK (' +
					bank.length +
					")</div>" +
					'<div class="zone-cards">' +
					(bankCards || '<div class="zone-empty">drop here</div>') +
					"</div>" +
					"</div>" +
					"</div>"
				);
			})
			.join("");

		el("tab-Bank").innerHTML =
			'<div class="card"><h2>Bank &amp; Teams</h2>' +
			'<p class="hint">Drag pokémon between <b>Team</b> and <b>Bank</b> — per player. ' +
			"The soul-link bond (shared death) stays intact; you just choose who is in the active team. Max 6 in a team.</p>" +
			'<div class="bank-cols">' +
			cols +
			"</div>" +
			"</div>";
	}

	// ---------- Types ----------
	var TYPE_LABEL = {
		normal: "Normal",
		fighting: "Fighting",
		flying: "Flying",
		poison: "Poison",
		ground: "Ground",
		rock: "Rock",
		bug: "Bug",
		ghost: "Ghost",
		steel: "Steel",
		fire: "Fire",
		water: "Water",
		grass: "Grass",
		electric: "Electric",
		psychic: "Psychic",
		ice: "Ice",
		dragon: "Dragon",
		dark: "Dark",
	};
	function effClass(v) {
		if (v === 0) return "eff-0";
		if (v === 0.25) return "eff-25";
		if (v === 0.5) return "eff-50";
		if (v === 2) return "eff-2";
		if (v === 4) return "eff-4";
		return "eff-1";
	}
	function effText(v) {
		if (v === 0) return "0";
		if (v === 0.25) return "¼";
		if (v === 0.5) return "½";
		if (v === 1) return "";
		return v + "";
	}

	// Reusable type-chart markup (header hover + data-col/data-row for highlighting).
	function typeTableHtml() {
		var data = window.TYPE_DATA.forGen(App.state.generation);
		var types = data.types,
			chart = data.chart;
		var getMult = window.TYPE_DATA.getMult;

		var head =
			'<tr><th class="corner">ATK \\ DEF</th>' +
			types
				.map(function (d) {
					return (
						'<th class="type-th col-th" data-col="' +
						d +
						'" title="' +
						d +
						'">' +
						'<span class="th-rot">' +
						(TYPE_LABEL[d] || d) +
						"</span></th>"
					);
				})
				.join("") +
			"</tr>";

		var rows = types
			.map(function (atk) {
				var cells = types
					.map(function (def) {
						var v = getMult(chart, atk, def);
						return (
							'<td data-col="' +
							def +
							'" data-row="' +
							atk +
							'"><span class="t-cell ' +
							effClass(v) +
							'">' +
							effText(v) +
							"</span></td>"
						);
					})
					.join("");
				return (
					'<tr><th class="type-th row-th" data-row="' +
					atk +
					'" title="' +
					atk +
					'">' +
					(TYPE_LABEL[atk] || atk) +
					"</th>" +
					cells +
					"</tr>"
				);
			})
			.join("");

		return (
			'<div class="types-wrap"><table class="typechart">' +
			head +
			rows +
			"</table></div>" +
			'<div class="type-legend">' +
			'<span class="eff-0">0×</span><span class="eff-25">¼×</span><span class="eff-50">½×</span>' +
			'<span class="eff-1">1×</span><span class="eff-2">2×</span><span class="eff-4">4× (dual)</span>' +
			"</div>"
		);
	}
	App.typeTableHtml = typeTableHtml;

	function renderTypes() {
		el("tab-Types").innerHTML =
			'<div class="card"><h2>Type Chart — Gen ' +
			App.state.generation +
			"</h2>" +
			'<p class="hint">Row = attacker, column = defender. Click a type header to highlight. (No Fairy type in Gen 1–5.)</p>' +
			typeTableHtml() +
			"</div>";
	}

	// ---------- Map ----------
	function routeStatus(route) {
		// aggregate status of catches on this route
		var found = false,
			anyAlive = false,
			anyDead = false,
			anyUncaught = false;
		App.state.catches.forEach(function (c) {
			if (c.route !== route) return;
			found = true;
			c.entries.forEach(function (e) {
				if (e.status === "alive") anyAlive = true;
				else if (e.status === "dead") anyDead = true;
				else if (e.status === "uncaught") anyUncaught = true;
			});
		});
		if (!found) return "open";
		if (anyDead) return "dead";
		if (anyAlive) return "alive";
		if (anyUncaught) return "uncaught";
		return "open";
	}

	function renderMap() {
		var region = App.regionInfo();
		var locs = region ? region.locations : [];
		var spots = locs
			.map(function (l) {
				var st = routeStatus(l);
				var label =
					st === "open"
						? "open"
						: st === "alive"
							? "alive"
							: st === "dead"
								? "dead"
								: "not caught";
				return (
					'<div class="hotspot hs-' +
					st +
					'" data-mroute="' +
					esc(l) +
					'">' +
					"<span>" +
					esc(l) +
					"</span>" +
					'<span class="dot" title="' +
					label +
					'"></span>' +
					"</div>"
				);
			})
			.join("");

		el("tab-Map").innerHTML =
			'<div class="card"><h2>Map — ' +
			esc(region ? region.region : "?") +
			"</h2>" +
			'<div class="map-legend">' +
			'<span><span class="dot" style="background:#6c648a"></span>open</span>' +
			'<span><span class="dot" style="background:#3bbf57"></span>caught/alive</span>' +
			'<span><span class="dot" style="background:#e23b3b"></span>dead</span>' +
			'<span><span class="dot" style="background:#3a3450"></span>not caught</span>' +
			"</div>" +
			'<p class="hint">Click a location to jump to its encounter.</p>' +
			'<div class="map-grid">' +
			spots +
			"</div>" +
			"</div>";
	}

	// ---------- New Catch modal ----------
	// One shared outcome for the whole catch (no per-player status).
	App.openCatchModal = function () {
		var s = App.state;
		var region = App.regionInfo();
		var locs = region ? region.locations : [];

		var routeOpts =
			'<option value="">— choose route —</option>' +
			locs
				.map(function (l) {
					var hasNormal = App.routeCatchCount(l, "normal") > 0;
					return (
						'<option value="' +
						esc(l) +
						'"' +
						">" +
						esc(l) +
						(hasNormal ? "  ✓" : "") +
						"</option>"
					);
				})
				.join("");

		var playerRows = s.players
			.map(function (p) {
				return (
					'<div class="modal-player" style="--pc:' +
					esc(p.color) +
					'">' +
					'<div class="mp-name" style="color:' +
					esc(p.color) +
					'">' +
					esc(p.name) +
					"</div>" +
					'<div class="mp-fields">' +
					'<button type="button" class="poke-pick" data-mpokebtn="' +
					p.id +
					'" data-mslug="">' +
					'<img class="pp-sprite" src="' +
					FALLBACK +
					'" />' +
					'<span class="pp-label">Choose Pokémon…</span>' +
					"</button>" +
					'<input type="text" placeholder="Nickname" data-mnick="' +
					p.id +
					'" />' +
					'<label class="mp-shiny"><input type="checkbox" data-mshiny="' +
					p.id +
					'"/>✨ Shiny</label>' +
					'<label class="mp-reroll"><input type="checkbox" data-mreroll="' +
					p.id +
					'"/>🔁 Too many rerolls (no valid pokémon)</label>' +
					"</div>" +
					"</div>"
				);
			})
			.join("");

		var blameOpts =
			'<option value="">— who is to blame? —</option>' +
			s.players
				.map(function (p) {
					return '<option value="' + p.id + '">' + esc(p.name) + "</option>";
				})
				.join("");

		var root = document.getElementById("modalRoot");
		root.innerHTML =
			'<div class="modal-backdrop" data-modalclose="1"></div>' +
			'<div class="modal">' +
			'<div class="modal-head"><h2>New Encounter</h2>' +
			'<button class="btn ghost small" data-modalclose="1">✕</button></div>' +
			'<div class="modal-body">' +
			'<div class="row">' +
			'<div class="field" style="flex:1"><label>Route / Location</label>' +
			'<select id="modalRoute">' +
			routeOpts +
			"</select></div>" +
			'<div class="field"><label>Type</label>' +
			'<select id="modalType">' +
			'<option value="normal">Normal encounter</option>' +
			'<option value="static">Static (gift/legendary/fossil)</option>' +
			"</select></div>" +
			"</div>" +
			'<p class="hint" id="modalRouteHint"></p>' +
			'<div class="field" id="modalPlayersWrap"><label>Pokémon faced (one per player)</label>' +
			'<div class="modal-players" id="modalPlayers">' +
			playerRows +
			"</div>" +
			"</div>" +
			'<div class="field" id="modalOutcomeWrap" style="margin-top:8px"><label>Catch successful?</label>' +
			'<div class="outcome-pills" id="modalOutcome">' +
			'<div class="pill sel-alive" data-moutcome="success">✓ Yes (caught)</div>' +
			'<div class="pill" data-moutcome="intentional">✕ No (on purpose)</div>' +
			'<div class="pill" data-moutcome="fail">💀 No (fail)</div>' +
			"</div>" +
			"</div>" +
			'<p class="hint" id="modalRerollHint" style="display:none;margin-top:8px">' +
			'🔁 A player has "too many rerolls" — the whole link dies (placeholder for that player). No death is blamed.</p>' +
			'<div class="field" id="modalBlameWrap" style="display:none;margin-top:8px">' +
			"<label>Who is to blame? (+1 death)</label>" +
			'<select id="modalBlame">' +
			blameOpts +
			"</select></div>" +
			"</div>" +
			'<div class="modal-foot">' +
			'<button class="btn ghost" data-modalclose="1">Cancel</button>' +
			'<div class="spacer"></div>' +
			'<button class="btn ok" id="modalSave">Save encounter</button>' +
			"</div>" +
			"</div>";
		App._modalOutcome = "success";
		root.style.display = "block";
		populateDatalist();
	};

	// ---------- Bank-pick modal (fill an empty team slot) ----------
	App.openBankPickModal = function (playerId) {
		var p = App.playerById(playerId);
		if (!p) return;
		// alive bank pokemon of this player
		var items = App.allEntries().filter(function (x) {
			return (
				x.entry.playerId === playerId &&
				x.entry.location === "bank" &&
				x.entry.status === "alive"
			);
		});

		var grid = items
			.map(function (x) {
				var e = x.entry;
				var poke = App.pokeBySlug(e.pokemon);
				return (
					'<div class="bankpick-item" data-bpcatch="' +
					x.catchId +
					'" data-bpplayer="' +
					playerId +
					'">' +
					'<img class="sprite" src="' +
					esc(spriteUrl(e.pokemon, e.shiny)) +
					'" ' +
					"onerror=\"this.onerror=null;this.src='" +
					FALLBACK +
					"'\" />" +
					'<div class="pkmn-name">' +
					esc(poke ? poke.name : e.pokemon) +
					"</div>" +
					(e.nickname
						? '<div class="pkmn-nick">"' + esc(e.nickname) + '"</div>'
						: "") +
					'<div class="hint">' +
					esc(x.route) +
					"</div>" +
					"</div>"
				);
			})
			.join("");

		var root = document.getElementById("modalRoot");
		root.innerHTML =
			'<div class="modal-backdrop" data-modalclose="1"></div>' +
			'<div class="modal">' +
			'<div class="modal-head"><h2 style="color:' +
			esc(p.color) +
			'">Bank → Team: ' +
			esc(p.name) +
			"</h2>" +
			'<button class="btn ghost small" data-modalclose="1">✕</button></div>' +
			'<div class="modal-body">' +
			(grid
				? '<p class="hint">Pick a living pokémon from the bank to bring it to the team (the whole link moves).</p>' +
					'<div class="bankpick-grid">' +
					grid +
					"</div>"
				: '<p class="hint">No living pokémon in the bank for ' +
					esc(p.name) +
					'. Add new pokémon via "New Encounter".</p>' +
					'<button class="btn ok" id="bankPickNewCatch" style="margin-top:10px">New Encounter</button>') +
			"</div>" +
			"</div>";
		root.style.display = "block";
	};

	App.closeModal = function () {
		var root = document.getElementById("modalRoot");
		root.style.display = "none";
		root.innerHTML = "";
	};

	// ---------- Pokémon picker (search + sprite grid, gen tabs) ----------
	// National-dex ranges per generation.
	var GEN_RANGES = [
		{ label: "Gen 1", min: 1, max: 151 },
		{ label: "Gen 2", min: 152, max: 251 },
		{ label: "Gen 3", min: 252, max: 386 },
		{ label: "Gen 4", min: 387, max: 493 },
		{ label: "Gen 5", min: 494, max: 649 },
	];

	// claimed: optional map familyId -> {route,slug} (from App.claimedFamilies).
	// When provided, items of a claimed family are marked blocked (disabled).
	function pickerCard(p, claimed) {
		var blockInfo = null;
		if (claimed && p.family != null && claimed[p.family])
			blockInfo = claimed[p.family];
		var cls = "pick-item" + (blockInfo ? " blocked" : "");
		var tip = blockInfo
			? App.displayName(blockInfo.slug) +
				" line already caught on " +
				blockInfo.route
			: p.name;
		return (
			'<div class="' +
			cls +
			'" data-pickslug="' +
			esc(p.slug) +
			'" ' +
			'data-pickname="' +
			esc(p.name.toLowerCase()) +
			'" data-pickid="' +
			p.id +
			'" ' +
			(blockInfo ? 'data-blocked="1" ' : "") +
			'title="' +
			esc(tip) +
			'">' +
			(blockInfo ? '<span class="pick-lock">🔒</span>' : "") +
			'<img class="sprite" src="' +
			esc(spriteUrl(p.slug, false)) +
			'" loading="lazy" ' +
			"onerror=\"this.onerror=null;this.src='" +
			FALLBACK +
			"'\" />" +
			'<div class="pick-name">' +
			esc(p.name) +
			"</div>" +
			"</div>"
		);
	}

	// App._pickerCb is set by the caller; receives the chosen slug ('' = cleared).
	// opts.blockMode: true -> grey out already-claimed families (normal encounter).
	//                 false/absent -> nothing blocked (static encounter, evolve).
	App.openPokePicker = function (opts) {
		opts = opts || {};
		App._pickerCb = opts.onPick || function () {};

		// blockMode greys out already-claimed families. opts.excludeCatchId lets an
		// edit-picker ignore the entry's own catch (so its current line isn't blocked),
		// and opts.allowFamily keeps a specific family always selectable.
		var claimed = opts.blockMode
			? App.claimedFamilies(opts.excludeCatchId || null)
			: null;
		if (claimed && opts.allowFamily != null) {
			delete claimed[opts.allowFamily];
		}

		var tabs =
			'<div class="pick-tab active" data-picktab="all">All</div>' +
			GEN_RANGES.map(function (g, i) {
				return (
					'<div class="pick-tab" data-picktab="' +
					(i + 1) +
					'">' +
					g.label +
					"</div>"
				);
			}).join("") +
			'<div class="pick-tab" data-picktab="special">Special</div>';

		// build all cards once; filtering toggles a hidden class
		var pokeCards = (window.POKEMON || [])
			.map(function (p) {
				return pickerCard(p, claimed);
			})
			.join("");
		var specialCards = PLACEHOLDERS.map(function (p) {
			return pickerCard(p, claimed);
		}).join("");

		// optional "suggested" row (e.g. team pokemon), shown above the grid
		var suggestedHtml = "";
		if (opts.suggested && opts.suggested.length) {
			var seen = {};
			var cards = opts.suggested
				.filter(function (s) {
					if (!s || seen[s]) return false;
					seen[s] = 1;
					return App.pokeBySlug(s);
				})
				.map(function (s) {
					return pickerCard(App.pokeBySlug(s), claimed);
				})
				.join("");
			if (cards)
				suggestedHtml =
					'<div class="pick-suggested"><div class="pick-sug-label">' +
					esc(opts.suggestedLabel || "Suggested") +
					'</div><div class="pick-grid pick-sug-grid">' +
					cards +
					"</div></div>";
		}

		var root = document.getElementById("pickerRoot");
		root.innerHTML =
			'<div class="picker-backdrop" data-pickclose="1"></div>' +
			'<div class="picker">' +
			'<div class="modal-head">' +
			"<h2>" +
			esc(opts.title || "Choose Pokémon") +
			"</h2>" +
			'<button class="btn ghost small" data-pickclose="1">✕</button>' +
			"</div>" +
			'<div class="picker-controls">' +
			'<input type="text" id="pickSearch" placeholder="Search…" autocomplete="off" />' +
			(opts.allowClear
				? '<button class="btn ghost small" data-pickslug="" id="pickClear">Clear</button>'
				: "") +
			"</div>" +
			suggestedHtml +
			'<div class="pick-tabs" id="pickTabs">' +
			tabs +
			"</div>" +
			'<div class="pick-grid" id="pickGrid">' +
			pokeCards +
			specialCards +
			"</div>" +
			"</div>";
		root.style.display = "block";
		var search = document.getElementById("pickSearch");
		if (search) search.focus();
		App._applyPickerFilter();
	};

	App.closePokePicker = function () {
		var root = document.getElementById("pickerRoot");
		root.style.display = "none";
		root.innerHTML = "";
		App._pickerCb = null;
		App._pickerTab = "all";
		App._pickerQuery = "";
	};

	App._pickerTab = "all";
	App._pickerQuery = "";
	// Show/hide cards based on active tab + search query.
	App._applyPickerFilter = function () {
		var grid = document.getElementById("pickGrid");
		if (!grid) return;
		var tab = App._pickerTab,
			q = (App._pickerQuery || "").trim().toLowerCase();
		var range = null;
		if (tab !== "all" && tab !== "special")
			range = GEN_RANGES[parseInt(tab, 10) - 1];
		var items = grid.querySelectorAll(".pick-item");
		items.forEach(function (it) {
			var id = parseInt(it.getAttribute("data-pickid"), 10);
			var name = it.getAttribute("data-pickname");
			var isSpecial = id >= 9000;
			var show = true;
			if (tab === "special") show = isSpecial;
			else if (tab === "all") show = true;
			else show = range && !isSpecial && id >= range.min && id <= range.max;
			if (show && q) show = name.indexOf(q) >= 0;
			it.style.display = show ? "" : "none";
		});
	};

	// ---------- Game Over modal ----------
	App.openGameOverModal = function (wipedPlayerIds) {
		var names = (wipedPlayerIds || [])
			.map(function (id) {
				var p = App.playerById(id);
				return p ? p.name : "?";
			})
			.join(", ");
		var nextTry = (App.state.tryCount || 1) + 1;
		var root = document.getElementById("modalRoot");
		root.innerHTML =
			'<div class="modal-backdrop"></div>' +
			'<div class="modal gameover">' +
			'<div class="modal-head"><h2>💀 GAME OVER</h2></div>' +
			'<div class="modal-body" style="text-align:center">' +
			'<p class="go-big">The run is over.</p>' +
			'<p class="hint">Wiped out: <b>' +
			esc(names) +
			"</b> (no living pokémon left in team).</p>" +
			'<p class="hint">Start a new attempt with the same setup (same game &amp; players). Catches reset; this will be <b>Try #' +
			nextTry +
			"</b>.</p>" +
			"</div>" +
			'<div class="modal-foot">' +
			'<div class="spacer"></div>' +
			'<button class="btn ok big" id="restartRun">New attempt (Try #' +
			nextTry +
			")</button>" +
			"</div>" +
			"</div>";
		root.style.display = "block";
	};

	// ---------- Pokémon Details modal (edit/correct one entry) ----------
	App.openDetailModal = function (catchId, playerId) {
		var c = App.findCatch(catchId);
		if (!c) return;
		var entry = c.entries.find(function (e) {
			return e.playerId === playerId;
		});
		if (!entry) return;
		var player = App.playerById(playerId);
		var poke = App.pokeBySlug(entry.pokemon);

		var region = App.regionInfo();
		var locs = region ? region.locations : [];
		var routeOpts = locs
			.map(function (l) {
				return (
					'<option value="' +
					esc(l) +
					'"' +
					(l === c.route ? " selected" : "") +
					">" +
					esc(l) +
					"</option>"
				);
			})
			.join("");
		if (locs.indexOf(c.route) < 0 && c.route) {
			routeOpts =
				'<option value="' +
				esc(c.route) +
				'" selected>' +
				esc(c.route) +
				"</option>" +
				routeOpts;
		}

		function statusPill(val, label) {
			return (
				'<div class="pill' +
				(entry.status === val ? " sel-" + val : "") +
				'" ' +
				'data-dstatus="' +
				val +
				'">' +
				label +
				"</div>"
			);
		}

		// partners (other players in this encounter), info only
		var partners = c.entries
			.filter(function (e) {
				return e.playerId !== playerId;
			})
			.map(function (e) {
				var pl = App.playerById(e.playerId);
				var pk = App.pokeBySlug(e.pokemon);
				var dead = e.status === "dead";
				return (
					'<div class="dp-partner' +
					(dead ? " dead" : "") +
					'" style="--pc:' +
					esc(pl ? pl.color : "#888") +
					'">' +
					'<img class="sprite" src="' +
					esc(spriteUrl(e.pokemon, e.shiny)) +
					'" ' +
					"onerror=\"this.onerror=null;this.src='" +
					FALLBACK +
					"'\" />" +
					'<div><b style="color:' +
					esc(pl ? pl.color : "#888") +
					'">' +
					esc(pl ? pl.name : "?") +
					"</b>" +
					'<div class="hint">' +
					esc(pk ? pk.name : e.pokemon || "—") +
					" · " +
					esc(e.status) +
					"</div></div>" +
					"</div>"
				);
			})
			.join("");

		var typeTag = c.catchType === "static" ? "★ Static" : "Normal";

		var root = document.getElementById("modalRoot");
		root.innerHTML =
			'<div class="modal-backdrop" data-modalclose="1"></div>' +
			'<div class="modal detail-modal" data-detailcatch="' +
			c.id +
			'" data-detailplayer="' +
			playerId +
			'">' +
			'<div class="modal-head"><h2 style="color:' +
			esc(player ? player.color : "#fff") +
			'">' +
			"✏️ " +
			esc(player ? player.name : "") +
			"’s Pokémon</h2>" +
			'<button class="btn ghost small" data-modalclose="1">✕</button></div>' +
			'<div class="modal-body">' +
			'<div class="dp-main">' +
			'<button type="button" class="poke-pick chosen" id="detailPokeBtn" data-mslug="' +
			esc(entry.pokemon) +
			'">' +
			'<img class="pp-sprite" src="' +
			esc(spriteUrl(entry.pokemon, entry.shiny)) +
			'" />' +
			'<span class="pp-label">' +
			esc(poke ? poke.name : entry.pokemon || "Choose Pokémon…") +
			"</span>" +
			"</button>" +
			"</div>" +
			'<div class="field" style="margin-top:8px"><label>Nickname</label>' +
			'<input type="text" id="detailNick" value="' +
			esc(entry.nickname) +
			'" /></div>' +
			'<label class="mp-shiny" style="margin-top:6px"><input type="checkbox" id="detailShiny"' +
			(entry.shiny ? " checked" : "") +
			"/>✨ Shiny</label>" +
			'<div class="field" style="margin-top:10px"><label>Route (whole link)</label>' +
			'<select id="detailRoute">' +
			routeOpts +
			"</select></div>" +
			'<div class="field" style="margin-top:10px"><label>Status (whole link)</label>' +
			'<div class="status-pills" id="detailStatus">' +
			statusPill("alive", "Alive") +
			statusPill("dead", "Dead") +
			"</div></div>" +
			'<div class="dp-meta hint" style="margin-top:10px">Encounter type: <b>' +
			typeTag +
			"</b>" +
			(c.deathBlame != null
				? " · blame: <b>" +
					esc((App.playerById(c.deathBlame) || {}).name || "?") +
					"</b>"
				: "") +
			"</div>" +
			(partners
				? '<div class="field" style="margin-top:12px"><label>Soul-linked partners</label>' +
					'<div class="dp-partners">' +
					partners +
					"</div></div>"
				: "") +
			"</div>" +
			'<div class="modal-foot">' +
			'<button class="btn ghost" data-modalclose="1">Cancel</button>' +
			'<div class="spacer"></div>' +
			'<button class="btn ok" id="detailSave">Save changes</button>' +
			"</div>" +
			"</div>";
		root.style.display = "block";
	};

	// ---------- Pokémon Info tab (current game generation only) ----------
	// App._infoSel = { slug }
	function renderPokemonInfo() {
		var sel = App._infoSel || {};
		var poke = sel.slug ? App.pokeBySlug(sel.slug) : null;
		var gen = App.state.generation || 5;

		var pickBtn =
			'<button type="button" class="poke-pick' +
			(poke ? " chosen" : "") +
			'" id="infoPokeBtn" data-mslug="' +
			(poke ? esc(poke.slug) : "") +
			'">' +
			'<img class="pp-sprite" src="' +
			(poke ? esc(spriteUrl(poke.slug, false)) : FALLBACK) +
			'" />' +
			'<span class="pp-label">' +
			(poke ? esc(poke.name) : "Choose a Pokémon…") +
			"</span>" +
			"</button>";

		// types inline, right of the picker (no box)
		var typesInline = poke
			? '<div class="info-types"><span class="info-types-label">Type (Gen ' +
				gen +
				")</span>" +
				(typeChips(poke.slug) || '<span class="hint">—</span>') +
				"</div>"
			: "";

		el("tab-Info").innerHTML =
			'<div class="card"><h2>Pokémon Info — ' +
			esc(App.state.game) +
			" (Gen " +
			gen +
			")</h2>" +
			'<div class="info-head">' +
			'<div class="field" style="flex:0 0 auto"><label>Pokémon</label>' +
			pickBtn +
			"</div>" +
			typesInline +
			"</div>" +
			'<div id="infoBody">' +
			(poke
				? '<p class="hint" style="margin-top:12px">Loading data for ' +
					esc(poke.name) +
					"…</p>"
				: '<p class="hint" style="margin-top:12px">Pick a Pokémon to see its type, evolutions, level-up moves, base stats and abilities for this game (Gen ' +
					gen +
					").</p>") +
			"</div>" +
			"</div>";

		if (poke) loadInfoBody(poke, gen);
	}

	// Render the data section once the live PokéAPI data is in.
	function loadInfoBody(poke, gen) {
		var body = el("infoBody");
		var token = poke.slug + "#" + gen;
		App._infoToken = token; // guard against stale async
		App.loadPokemonInfo(poke.id)
			.then(function (info) {
				if (App._infoToken !== token) return; // selection changed meanwhile
				body.innerHTML = infoBodyHtml(poke, gen, info);
				// load the moves for the initially selected stage
				App.renderStageMoves(App._infoStage || poke.slug, gen);
				// auto-load the first ability's text (Gen 3+)
				if (App._infoFirstAbility)
					App.renderAbilityContent(App._infoFirstAbility);
			})
			.catch(function (err) {
				if (App._infoToken !== token) return;
				body.innerHTML =
					'<p class="hint" style="margin-top:12px;color:var(--danger)">Could not load data (offline?). ' +
					esc(err.message) +
					"</p>";
			});
	}

	function infoBodyHtml(poke, gen, info) {
		// evolutions — render the chain as a tree (each pokemon once); branches stack.
		var slugOf = function (n) {
			return (n || "").toLowerCase().replace(/[^a-z0-9]/g, "");
		};
		// Prune the tree to species that exist in this generation. Returns an ARRAY
		// of gen-valid roots: when a node doesn't exist in this gen (e.g. Pichu, a
		// Gen-2 pre-evolution of a Gen-1 line), its gen-valid descendants are pulled
		// up to take its place instead of dropping the whole subtree.
		function pruneForest(node) {
			if (!node) return [];
			var kids = (node.children || []).reduce(function (acc, c) {
				return acc.concat(pruneForest(c));
			}, []);
			if (!App.existsInGen(slugOf(node.species), gen)) return kids;
			return [{ species: node.species, how: node.how, children: kids }];
		}
		// render a node and its (gen-existing) children; linear chains stay one row
		function renderNode(node) {
			var mon = evoMon(bySpeciesName(node.species), node.species);
			if (!node.children.length) return '<span class="evo-node">' + mon + "</span>";
			var branches = node.children
				.map(function (child) {
					return (
						'<span class="evo-step">' +
						'<span class="evo-arrow">▶<span class="evo-how">' +
						esc(child.how || "?") +
						"</span></span>" +
						renderNode(child) +
						"</span>"
					);
				})
				.join("");
			var multi = node.children.length > 1;
			return (
				'<span class="evo-node">' +
				mon +
				'<span class="evo-branches' +
				(multi ? " evo-multi" : "") +
				'">' +
				branches +
				"</span></span>"
			);
		}
		var roots = info.evoTree ? pruneForest(info.evoTree) : [];
		// an evolution exists only if some gen-valid root actually has children
		var hasEvolution = roots.some(function (r) {
			return r.children.length;
		});
		var evo;
		if (!hasEvolution) {
			evo =
				'<span class="hint">Does not evolve' +
				(info.evoStages && info.evoStages.length ? " in Gen " + gen : "") +
				".</span>";
		} else {
			evo =
				'<div class="evo-tree">' +
				roots.map(renderNode).join("") +
				"</div>";
		}

		// stats (compact)
		var maxStat = 200;
		var statsHtml =
			'<div class="stat-list">' +
			info.stats
				.map(function (s) {
					var pct = Math.min(100, Math.round((s.value / maxStat) * 100));
					return (
						'<div class="stat-row"><span class="stat-name">' +
						esc(statLabel(s.name)) +
						"</span>" +
						'<span class="stat-bar"><span style="width:' +
						pct +
						'%"></span></span>' +
						'<span class="stat-val">' +
						s.value +
						"</span></div>"
					);
				})
				.join("") +
			"</div>";

		// abilities — only Gen 3+; rendered as tabs with text content
		var abilitiesBox = "";
		if (gen >= 3 && info.abilities.length) {
			var atabs = info.abilities
				.map(function (a, i) {
					return (
						'<button class="btn small ability-tab' +
						(i === 0 ? " on" : "") +
						'" data-abilitytab="' +
						esc(a.raw) +
						'">' +
						esc(a.name) +
						(a.hidden ? " (H)" : "") +
						"</button>"
					);
				})
				.join("");
			abilitiesBox =
				'<div class="info-box"><h3>Abilities</h3>' +
				'<div class="ability-tabs">' +
				atabs +
				"</div>" +
				'<div class="ability-content" id="infoAbilityContent"><span class="hint">…</span></div>' +
				"</div>";
			// remember to auto-load the first ability
			App._infoFirstAbility = info.abilities[0].raw;
		} else {
			App._infoFirstAbility = null;
		}

		// stage tabs (each unique form in the line that exists in this gen)
		var rawForms =
			info.evoSpecies && info.evoSpecies.length ? info.evoSpecies : [poke.slug];
		var forms = rawForms.filter(function (sp) {
			return App.existsInGen(slugOf(sp), gen);
		});
		if (!forms.length) forms = [poke.slug]; // safety
		App._infoForms = forms;
		var curForm =
			forms.indexOf(poke.slug.replace(/[^a-z0-9]/g, "")) >= 0
				? poke.slug.replace(/[^a-z0-9]/g, "")
				: forms[0];
		App._infoStage = curForm;
		var stageTabs = forms
			.map(function (sp) {
				var slug = sp.replace(/[^a-z0-9]/g, "");
				var nm =
					(App.pokeBySlug(slug) || {}).name ||
					(App.titleCase ? App.titleCase(sp) : sp);
				return (
					'<button class="btn small stage-tab' +
					(slug === curForm ? " on" : "") +
					'" ' +
					'data-stage="' +
					esc(slug) +
					'">' +
					esc(nm) +
					"</button>"
				);
			})
			.join("");

		return (
			'<div class="info-split">' +
			'<div class="info-left">' +
			abilitiesBox +
			'<div class="info-box"><h3>Evolutions</h3>' +
			evo +
			"</div>" +
			'<div class="info-box"><h3>Base Stats</h3>' +
			statsHtml +
			"</div>" +
			"</div>" +
			'<div class="info-right">' +
			'<div class="info-box info-moves"><h3>Level-Up Moves (Gen ' +
			gen +
			")</h3>" +
			(forms.length > 1
				? '<div class="stage-tabs">' + stageTabs + "</div>"
				: "") +
			'<div class="move-scroll" id="infoMoves"><p class="hint">Loading…</p></div>' +
			"</div>" +
			'<div class="info-box info-moveinfo"><h3>Move Info</h3>' +
			'<div id="infoMoveDetail"><span class="hint">Click a move above to see its details.</span></div>' +
			"</div>" +
			"</div>" +
			"</div>"
		);
	}

	// Load + render the level-up moves of one form (stage) into #infoMoves.
	App.renderStageMoves = function (formSlug, gen) {
		var box = el("infoMoves");
		if (!box) return;
		App._infoStage = formSlug;
		var token = formSlug + "#" + gen;
		App._infoMovesToken = token;
		App.loadFormMoves(formSlug, gen)
			.then(function (moves) {
				if (App._infoMovesToken !== token) return;
				if (!moves.length) {
					box.innerHTML =
						'<p class="hint">No level-up moves in Gen ' + gen + ".</p>";
					return;
				}
				box.innerHTML = moves
					.map(function (m) {
						return (
							'<div class="move-row" data-move="' +
							esc(m.raw) +
							'" data-movename="' +
							esc(m.name) +
							'">' +
							'<span class="move-lvl">' +
							(m.level ? "Lv " + m.level : "—") +
							"</span>" +
							'<span class="move-name">' +
							esc(m.name) +
							"</span>" +
							"</div>"
						);
					})
					.join("");
				// reset the detail box when the stage/list changes
				var det = el("infoMoveDetail");
				if (det)
					det.innerHTML =
						'<span class="hint">Click a move above to see its details.</span>';
			})
			.catch(function () {
				if (App._infoMovesToken !== token) return;
				box.innerHTML =
					'<p class="hint" style="color:var(--danger)">Could not load moves.</p>';
			});
	};

	// Load + render one ability's description into the ability content box.
	App.renderAbilityContent = function (rawName) {
		var box = el("infoAbilityContent");
		if (!box) return;
		box.innerHTML = '<span class="hint">…</span>';
		App._abilityToken = rawName;
		App.loadAbilityDetail(rawName)
			.then(function (a) {
				if (App._abilityToken !== rawName) return;
				box.textContent = a.effect || "—";
			})
			.catch(function () {
				if (App._abilityToken !== rawName) return;
				box.innerHTML =
					'<span class="hint" style="color:var(--danger)">Could not load ability.</span>';
			});
	};

	// Load + render a move's details into the separate Move Info box (gen-correct).
	App.renderMoveDetail = function (rawName, displayName) {
		var box = el("infoMoveDetail");
		if (!box) return;
		var gen = App.state.generation || 5;
		box.innerHTML =
			'<span class="hint">Loading ' + esc(displayName || rawName) + "…</span>";
		App._moveToken = rawName;
		App.loadMoveDetail(rawName, gen)
			.then(function (m) {
				if (App._moveToken !== rawName) return;
				var bits = [];
				if (m.type)
					bits.push(
						'<span class="tchip" style="background:' +
							App.typeColor(m.type) +
							'">' +
							esc(m.type.toUpperCase()) +
							"</span>",
					);
				if (m.damageClass)
					bits.push('<span class="mi-tag">' + esc(m.damageClass) + "</span>");
				bits.push("Power: <b>" + (m.power != null ? m.power : "—") + "</b>");
				bits.push(
					"Acc: <b>" + (m.accuracy != null ? m.accuracy : "—") + "</b>",
				);
				bits.push("PP: <b>" + (m.pp != null ? m.pp : "—") + "</b>");
				box.innerHTML =
					'<div class="mi-title">' +
					esc(displayName || rawName) +
					"</div>" +
					'<div class="mi-meta">' +
					bits.join(" · ") +
					"</div>" +
					'<div class="mi-text">' +
					esc(m.effect || "") +
					"</div>";
			})
			.catch(function () {
				if (App._moveToken !== rawName) return;
				box.innerHTML =
					'<span class="hint" style="color:var(--danger)">Could not load move.</span>';
			});
	};

	function bySpeciesName(name) {
		return App.pokeBySlug((name || "").toLowerCase().replace(/[^a-z0-9]/g, ""));
	}
	function evoMon(p, fallbackName) {
		var slug = p ? p.slug : (fallbackName || "").replace(/[^a-z0-9]/g, "");
		var nm = p
			? p.name
			: App.titleCase
				? App.titleCase(fallbackName)
				: fallbackName;
		return (
			'<span class="evo-mon">' +
			'<img src="' +
			esc(spriteUrl(slug, false)) +
			'" onerror="this.onerror=null;this.src=\'' +
			FALLBACK +
			"'\" />" +
			"<span>" +
			esc(nm) +
			"</span></span>"
		);
	}
	function statLabel(n) {
		return (
			{
				hp: "HP",
				attack: "Atk",
				defense: "Def",
				"special-attack": "SpA",
				"special-defense": "SpD",
				speed: "Spe",
			}[n] || n
		);
	}

	App._renderPokemonInfo = renderPokemonInfo;

	// ====================================================================
	// Catchrate Calculator
	// State: App._catchSel = { slug, hp (0..1), status, captureRate?, baseHp?,
	//                          baseSpeed?, types? }
	// ====================================================================
	function catchSel() {
		if (!App._catchSel) App._catchSel = { slug: "", hp: 1, status: "none" };
		return App._catchSel;
	}
	App._catchSel = App._catchSel || { slug: "", hp: 1, status: "none" };

	// Hidden-ball set (map id->true). Kept OUTSIDE _catchSel so the ball menu
	// selection survives switching the chosen Pokémon.
	App.catchHidden = function () {
		if (!App._catchHidden) App._catchHidden = {};
		return App._catchHidden;
	};

	// Pokémon-game HP bar colour: green > 50%, yellow > 20%, red otherwise.
	function hpColor(frac) {
		if (frac > 0.5) return "#5cd664";
		if (frac > 0.2) return "#f6c043";
		return "#e25555";
	}
	// smooth colour for catch-chance % (high = green, low = red)
	function chanceColor(frac) {
		var h = Math.round(120 * Math.max(0, Math.min(1, frac)));
		return "hsl(" + h + ", 70%, 48%)";
	}

	function fmtPct(x) {
		if (x == null) return "—";
		if (x >= 0.9995) return "100%";
		if (x <= 0) return "0%";
		var p = x * 100;
		return (p < 10 ? p.toFixed(1) : p.toFixed(0)) + "%";
	}

	// Status picker buttons
	function statusButtons(gen, cur) {
		var keys = ["none", "sleep", "freeze", "paralyze", "poison", "burn"];
		return keys
			.map(function (k) {
				var st = App.CATCH_STATUS[k];
				return (
					'<button type="button" class="cr-status' +
					(k === cur ? " on" : "") +
					'" data-crstatus="' +
					k +
					'">' +
					'<span class="cr-st-ico">' +
					st.icon +
					"</span>" +
					esc(st.label) +
					"</button>"
				);
			})
			.join("");
	}

	// Horizontal breakdown: how the SELECTED ball's catch chance adds up. Each chip
	// is an additive contribution (base + HP + status + ball) that sums to total.
	function catchBreakdown(sel) {
		var ballId = sel.ball || "poke";
		var ballObj = App.ballById(ballId) || App.ballById("poke");
		var m = App.ballMult(ballObj, ballCtx(sel));
		var bd = App.catchBreakdownParts(sel, ballId, m.value, m.add);
		if (!bd) return "";
		var stLabel = App.CATCH_STATUS[sel.status].label;

		var ICON = {
			base: '<span class="cr-chip-ico">●</span>',
			hp: '<span class="cr-chip-ico">♥</span>',
			status: '<span class="cr-chip-ico">' + App.CATCH_STATUS[sel.status].icon + "</span>",
			ball: '<img class="cr-chip-ball" src="' + esc(ballSprite(ballId)) +
				'" alt="" onerror="this.style.visibility=\'hidden\'" />',
		};
		var SUB = {
			base: "Base rate (" + sel.captureRate + "/255)",
			hp: Math.round(sel.hp * 100) + "% HP",
			status: stLabel,
			ball: ballObj.name,
		};

		var chips = bd.parts
			.map(function (p, i) {
				var sign = i === 0 ? "" : '<span class="cr-chip-plus">+</span>';
				var val = Math.round(p.pct * 100);
				return (
					sign +
					'<span class="cr-chip">' +
					(ICON[p.key] || "") +
					'<span class="cr-chip-body"><b>' +
					(val < 1 && p.pct > 0 ? "<1" : val) +
					"%</b><small>" +
					esc(SUB[p.key] || p.label) +
					"</small></span></span>"
				);
			})
			.join("");

		var total = Math.round(bd.total * 100);
		return (
			'<div class="cr-breakdown">' +
			// total on its own centered row above the component chips
			'<div class="cr-total-row">' +
			'<span class="cr-chip total"><span class="cr-chip-body"><b>' +
			(total < 1 && bd.total > 0 ? "<1" : total) +
			"%</b><small>Total</small></span></span>" +
			"</div>" +
			'<div class="cr-chips">' +
			chips +
			"</div></div>"
		);
	}

	// Build the ball-context (gen, pokemon facts + user-entered situational inputs).
	function ballCtx(sel) {
		var c = { gen: sel.gen, baseSpeed: sel.baseSpeed, types: sel.types };
		var inp = sel.inputs || {};
		Object.keys(App.CATCH_INPUTS).forEach(function (k) {
			if (inp[k] != null) c[k] = inp[k];
		});
		return c;
	}

	// Resolve a ball's chance + metadata for the current selection.
	function ballResult(ball, sel) {
		var m = App.ballMult(ball, ballCtx(sel));
		var res = App.catchChance(sel, ball.id, m.value, m.add);
		return {
			ball: ball,
			id: ball.id,
			name: ball.name,
			pct: res ? res.chance : 0,
			mult: m.value,
			note: m.note || "",
			applies: m.applies, // true/false/undefined
			best: !!m.best,
		};
	}

	// Interactive ball scale: min = worst ball, max = best ball; each ball sits at
	// its chance position with its % + name anchored beneath it. The thumb snaps
	// to balls; the picked ball drives the breakdown. `results` is sorted ascending.
	function ballScale(results, selectedId) {
		var lo = results[0].pct;
		var hi = results[results.length - 1].pct;
		var span = hi - lo;
		function posOf(pct) {
			return span > 1e-9 ? ((pct - lo) / span) * 100 : 50;
		}

		// Assign each marker a stack level: when several balls land at (nearly) the
		// same position, stack them downward so neither the sprites nor their
		// labels overlap. Walk left→right; markers within COLLIDE% of the running
		// cluster anchor get the next free level below it.
		var COLLIDE = 6; // percent of track width considered "the same spot"
		var STACK_PX = 78; // vertical distance between stacked markers (marker + label)
		var clusterAnchor = -Infinity;
		var clusterLevel = 0;
		var maxLevel = 0;
		results.forEach(function (r) {
			r._pos = posOf(r.pct);
			if (r._pos - clusterAnchor <= COLLIDE) {
				clusterLevel += 1; // same cluster -> stack down
			} else {
				clusterAnchor = r._pos; // start a new cluster
				clusterLevel = 0;
			}
			r._level = clusterLevel;
			if (clusterLevel > maxLevel) maxLevel = clusterLevel;
		});

		var markers = results
			.map(function (r) {
				var on = r.id === selectedId;
				var topPx = r._level * STACK_PX;
				return (
					'<button type="button" class="cr-scale-mark' +
					(on ? " on" : "") +
					(r.applies === false ? " dim" : "") +
					'" style="left:' +
					r._pos.toFixed(2) +
					"%;top:calc(50% + " +
					topPx +
					'px)" data-crball="' +
					esc(r.id) +
					'" title="' +
					esc(r.name + " — " + fmtPct(r.pct)) +
					'">' +
					'<img class="cr-scale-img" src="' +
					esc(ballSprite(r.id)) +
					'" alt="" onerror="this.style.visibility=\'hidden\'" />' +
					'<span class="cr-scale-lbl"><b style="color:' +
					pctColor(r.pct) +
					'">' +
					fmtPct(r.pct) +
					"</b><small>" +
					esc(r.name.replace(/ Ball$/, "")) +
					"</small></span>" +
					"</button>"
				);
			})
			.join("");

		var sel = results.find(function (r) { return r.id === selectedId; }) || results[0];
		var fillW = posOf(sel.pct);
		// reserve room below the track for the deepest stack + its label
		var padBottom = 64 + maxLevel * STACK_PX;

		return (
			'<div class="cr-scale-wrap">' +
			'<div class="cr-scale-track" id="crScale" style="margin-bottom:' +
			padBottom +
			'px">' +
			'<div class="cr-scale-fill" style="width:' +
			fillW.toFixed(2) +
			"%;background:" +
			pctColor(sel.pct) +
			'"></div>' +
			markers +
			"</div></div>"
		);
	}

	// Poké Ball item sprites (PokéAPI sprite CDN). Maps our ids to the API names.
	var BALL_SPRITE_NAME = {
		poke: "poke-ball", great: "great-ball", ultra: "ultra-ball",
		safari: "safari-ball", net: "net-ball", dive: "dive-ball",
		nest: "nest-ball", repeat: "repeat-ball", timer: "timer-ball",
		dusk: "dusk-ball", quick: "quick-ball", dream: "dream-ball",
		fast: "fast-ball", level: "level-ball", lure: "lure-ball",
		heavy: "heavy-ball", love: "love-ball", moon: "moon-ball",
	};
	function ballSprite(id) {
		var nm = BALL_SPRITE_NAME[id] || "poke-ball";
		return (
			"https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/" +
			nm +
			".png"
		);
	}

	function pctColor(p) {
		if (p == null) return "var(--muted)";
		return chanceColor(p);
	}

	// Vertical ball menu shown to the LEFT of the calculator card. One ball per
	// row (sprite only); the name slides out on hover. Clicking toggles the ball
	// on/off (off = greyed out + removed from the scale). The hidden set lives in
	// App.catchHidden() so it persists across Pokémon changes.
	function ballMenu(gen) {
		var hidden = App.catchHidden();
		var rows = App.ballsForGen(gen)
			.map(function (b) {
				var on = !hidden[b.id];
				return (
					'<button type="button" class="cr-menu-item' +
					(on ? "" : " off") +
					'" data-crballtoggle="' +
					esc(b.id) +
					'" title="' +
					esc(b.name) +
					'">' +
					'<img class="cr-menu-img" src="' +
					esc(ballSprite(b.id)) +
					'" alt="" onerror="this.style.visibility=\'hidden\'" />' +
					'<span class="cr-menu-name">' +
					esc(b.name) +
					"</span></button>"
				);
			})
			.join("");
		return '<div class="cr-menu" id="crMenu">' + rows + "</div>";
	}

	// Situational inputs (turn, levels, weight, toggles) — only those needed by a
	// currently VISIBLE ball (per the ball menu) are rendered. Values live on
	// sel.inputs and default to the best-case values from catchrate.js.
	function situationalInputs(sel, gen) {
		var hidden = App.catchHidden();
		var visible = App.ballsForGen(gen).filter(function (b) { return !hidden[b.id]; });
		var keys = App.inputsForBalls(visible);
		if (!keys.length) return '<div class="cr-sit" id="crSit"></div>';
		sel.inputs = sel.inputs || {};

		var fields = keys
			.map(function (k) {
				var spec = App.CATCH_INPUTS[k];
				var val = sel.inputs[k] != null ? sel.inputs[k] : spec.def;

				// balls (visible) that use this input -> sprites; highlight if the
				// currently selected ball is one of them.
				var users = App.ballsForInput(k, gen).filter(function (b) {
					return !hidden[b.id];
				});
				var active = users.some(function (b) { return b.id === sel.ball; });
				var sprites = users
					.map(function (b) {
						return (
							'<img class="cr-sit-ball' +
							(b.id === sel.ball ? " on" : "") +
							'" src="' +
							esc(ballSprite(b.id)) +
							'" alt="" title="' +
							esc(b.name) +
							"\" onerror=\"this.style.visibility='hidden'\" />"
						);
					})
					.join("");
				var spriteBox = '<span class="cr-sit-balls">' + sprites + "</span>";

				if (spec.kind === "number") {
					return (
						'<div class="cr-sit-item' +
						(active ? " active" : "") +
						'">' +
						spriteBox +
						'<div class="cr-sit-ctrl"><label>' +
						esc(spec.label) +
						"</label>" +
						'<input type="number" class="cr-sit-num" data-crinput="' +
						k +
						'" value="' +
						val +
						'" min="' +
						spec.min +
						'" max="' +
						spec.max +
						'" /></div></div>'
					);
				}
				// toggle
				return (
					'<label class="cr-sit-item cr-sit-toggle' +
					(active ? " active" : "") +
					'">' +
					spriteBox +
					'<input type="checkbox" data-crinput="' +
					k +
					'"' +
					(val ? " checked" : "") +
					" />" +
					'<span class="cr-sit-tlabel">' +
					esc(spec.label) +
					"</span></label>"
				);
			})
			.join("");

		return (
			'<div class="cr-sit" id="crSit"><div class="cr-sit-head">Situational modifiers ' +
			'<small>— defaults assume best case</small></div>' +
			'<div class="cr-sit-grid">' +
			fields +
			"</div></div>"
		);
	}

	function renderCatchRate() {
		var sel = catchSel();
		var gen = App.state.generation || 5;
		sel.gen = gen;
		var poke = sel.slug ? App.pokeBySlug(sel.slug) : null;

		var pickBtn =
			'<button type="button" class="poke-pick' +
			(poke ? " chosen" : "") +
			'" id="catchPokeBtn">' +
			'<img class="pp-sprite" src="' +
			(poke ? esc(spriteUrl(poke.slug, false)) : FALLBACK) +
			'" />' +
			'<span class="pp-label">' +
			(poke ? esc(poke.name) : "Choose a Pokémon…") +
			"</span></button>";

		var hpPct = Math.round(sel.hp * 100);

		var head =
			'<div class="cr-layout">' +
			// vertical ball menu to the left of the card
			ballMenu(gen) +
			'<div class="card cr-card"><h2>Catchrate Calculator — ' +
			esc(App.state.game) +
			" (Gen " +
			gen +
			")</h2>" +
			'<div class="cr-controls">' +
			// Pokémon picker
			'<div class="field cr-field"><label>Pokémon</label>' +
			pickBtn +
			"</div>" +
			// HP bar (Pokémon-game style: fill up to % with stepped colour)
			'<div class="field cr-field cr-hpfield"><label>Enemy HP: <b id="crHpVal" style="color:' +
			hpColor(sel.hp) +
			'">' +
			hpPct +
			"%</b></label>" +
			'<div class="cr-hp-wrap">' +
			'<div class="cr-hp-track"><div class="cr-hp-fill" id="crHpFill" style="width:' +
			hpPct +
			"%;background:" +
			hpColor(sel.hp) +
			'"></div></div>' +
			'<input type="range" id="crHp" class="cr-hp-range" min="1" max="100" value="' +
			hpPct +
			'" />' +
			"</div>" +
			'<div class="cr-hp-hint">Estimate the HP by eye — you never see exact numbers in battle anyway.</div>' +
			"</div>" +
			// Status
			'<div class="field cr-field"><label>Status</label>' +
			'<div class="cr-status-row">' +
			statusButtons(gen, sel.status) +
			"</div></div>" +
			"</div>" + // /cr-controls
			situationalInputs(sel, gen);

		var body;
		if (!poke) {
			body =
				'<p class="hint" style="margin-top:12px">Pick a Pokémon to calculate the ' +
				"catch chances for this generation.</p>";
		} else if (sel.captureRate == null) {
			body =
				'<p class="hint" id="crBody" style="margin-top:12px">Loading catch rate for ' +
				esc(poke.name) +
				"…</p>";
		} else {
			body = catchResultHtml(sel);
		}

		el("tab-Catch").innerHTML = head + '<div id="crBody">' + body + "</div></div></div>";

		// fetch capture data if missing for the current selection
		if (poke && sel.captureRate == null) {
			var token = poke.slug;
			App._catchToken = token;
			App.loadCatchData(poke.id)
				.then(function (data) {
					if (App._catchToken !== token) return;
					sel.captureRate = data.captureRate;
					sel.baseHp = data.baseHp;
					sel.baseSpeed = data.baseSpeed;
					sel.types = data.types;
					el("crBody").innerHTML = catchResultHtml(sel);
				})
				.catch(function (err) {
					if (App._catchToken !== token) return;
					el("crBody").innerHTML =
						'<p class="hint" style="color:var(--danger)">Could not load catch rate (offline?). ' +
						esc(err.message) +
						"</p>";
				});
		}
	}

	// Breakdown + interactive ball scale (rebuilt on every change).
	function catchResultHtml(sel) {
		var hidden = App.catchHidden();
		var balls = App.ballsForGen(sel.gen).filter(function (b) { return !hidden[b.id]; });
		if (!balls.length) balls = App.ballsForGen(sel.gen); // never show an empty scale

		// resolve every ball's chance once, then sort ascending by chance
		var sorted = balls
			.map(function (b) { return ballResult(b, sel); })
			.sort(function (a, b) { return a.pct - b.pct; });

		// make sure a valid (visible) ball is selected
		var ids = {};
		sorted.forEach(function (r) { ids[r.id] = true; });
		if (!sel.ball || !ids[sel.ball]) sel.ball = sorted[0].id;

		var selRes = sorted.find(function (r) { return r.id === sel.ball; }) || sorted[0];

		return (
			catchBreakdown(sel) +
			'<div class="cr-balls-section">' +
			ballScale(sorted, sel.ball) +
			ballInfoBox(selRes) +
			"</div>"
		);
	}

	// Info box for the currently selected ball (shown below the slider).
	function ballInfoBox(r) {
		if (!r) return "";
		var multLabel = r.mult === Infinity ? "always catches" : "×" + (Math.round(r.mult * 10) / 10);

		// status line describing whether a conditional bonus is currently in effect
		var statusLine = "";
		if (r.applies === true) {
			statusLine = '<span class="cr-info-on">Bonus active for this Pokémon</span>';
		} else if (r.applies === false) {
			statusLine = '<span class="cr-info-off">Bonus does not apply here (×1)</span>';
		} else if (r.best) {
			statusLine = '<span class="cr-info-best">Situational — best case shown</span>';
		}

		var note = r.note
			? '<div class="cr-info-note">' + esc(r.note) + "</div>"
			: "";

		return (
			'<div class="cr-info">' +
			'<img class="cr-info-img" src="' +
			esc(ballSprite(r.id)) +
			'" alt="" onerror="this.style.visibility=\'hidden\'" />' +
			'<div class="cr-info-main">' +
			'<div class="cr-info-head"><span class="cr-info-name">' +
			esc(r.name) +
			'</span><span class="cr-info-mult">' +
			multLabel +
			"</span></div>" +
			(statusLine ? '<div class="cr-info-status">' + statusLine + "</div>" : "") +
			note +
			"</div>" +
			'<div class="cr-info-pct" style="color:' +
			pctColor(r.pct) +
			'"><b>' +
			fmtPct(r.pct) +
			"</b><small>catch chance</small></div>" +
			"</div>"
		);
	}

	// Re-render only the result section (fast path for slider/status changes).
	App._refreshCatchResult = function () {
		var sel = catchSel();
		if (!sel.slug || sel.captureRate == null) return;
		sel.gen = App.state.generation || 5;
		var box = el("crBody");
		if (box) box.innerHTML = catchResultHtml(sel);
	};

	// Toggle the on/off state of one ball-menu item in place (no full re-render).
	App._refreshBallMenuItem = function (ballId) {
		var hidden = App.catchHidden();
		var item = document.querySelector('.cr-menu-item[data-crballtoggle="' + ballId + '"]');
		if (item) item.classList.toggle("off", !!hidden[ballId]);
	};

	// Re-render the situational-inputs block (shown inputs depend on which balls
	// are currently visible). Called when the ball-filter selection changes.
	App._refreshCatchSituational = function () {
		var host = el("crSit");
		if (!host) return;
		var sel = catchSel();
		sel.gen = App.state.generation || 5;
		// situationalInputs returns the wrapper itself; swap it in place
		host.outerHTML = situationalInputs(sel, sel.gen);
	};

	// Lightweight highlight update: when the selected ball changes, toggle which
	// situational items are .active and which sprites are .on — without rebuilding
	// the DOM (so a number input being edited keeps its focus/value).
	App._refreshCatchSitHighlight = function () {
		var host = el("crSit");
		if (!host) return;
		var sel = catchSel();
		var gen = App.state.generation || 5;
		host.querySelectorAll(".cr-sit-item").forEach(function (item) {
			var input = item.querySelector("[data-crinput]");
			if (!input) return;
			var key = input.getAttribute("data-crinput");
			var users = App.ballsForInput(key, gen).filter(function (b) {
				return !App.catchHidden()[b.id];
			});
			var active = users.some(function (b) { return b.id === sel.ball; });
			item.classList.toggle("active", active);
			item.querySelectorAll(".cr-sit-ball").forEach(function (img) {
				img.classList.toggle("on", img.getAttribute("title") &&
					(App.ballById(sel.ball) || {}).name === img.getAttribute("title"));
			});
		});
	};
	App._renderCatchRate = renderCatchRate;

	// ====================================================================
	// Room tab — share the live room (code + password) or join another one.
	// Every game is automatically a room (see ui.js autoStartRoom).
	// ====================================================================
	function renderRoom() {
		var host = el("tab-Room");
		if (!App.syncAvailable || !App.syncAvailable()) {
			host.innerHTML =
				'<div class="card"><h2>Live Room</h2>' +
				'<p class="hint">Live sync is unavailable right now (offline, or the ' +
				"sync service couldn't be reached). The game still works locally and " +
				"you can export/import JSON as usual.</p></div>";
			return;
		}

		var inRoom = App.room && App.room.code;
		if (inRoom) {
			// password: copy-only, never shown. Only available if WE set/entered it.
			var pwRow = App.room.password
				? '<div class="room-field"><label>Password</label>' +
					'<div class="room-val"><code class="room-secret">••••••••</code>' +
					'<button class="btn small" data-roomcopy="' + esc(App.room.password) + '">Copy</button></div></div>'
				: '<div class="room-field"><label>Password</label>' +
					'<p class="hint">Set on another device — ask whoever opened the room.</p></div>';

			// invite link: copy-only, never shown (contains the password)
			var invite = App.inviteLink();
			var inviteRow = (invite && App.room.password)
				? '<div class="room-field" style="flex:1 1 100%"><label>Invite link (1-click join)</label>' +
					'<div class="room-val"><code class="room-secret">🔗 link with code + password — copy &amp; send</code>' +
					'<button class="btn small ok" data-roomcopy="' + esc(invite) + '">Copy link</button></div></div>'
				: "";

			// presence list
			var members = (App.room.members || []);
			var memberHtml = members.length
				? members.map(function (m) {
						return '<span class="room-member' + (m.me ? " me" : "") + '">' +
							"🟢 " + esc(m.name) + (m.me ? " (you)" : "") + "</span>";
					}).join("")
				: '<span class="hint">Just you so far.</span>';

			host.innerHTML =
				'<div class="card"><h2>🔴 Live Room</h2>' +
				'<p class="hint">This run is live. Send the invite link (or the code + ' +
				"password) so friends can join and edit together in real time. Everyone " +
				"can still export the run to JSON at any time.</p>" +
				'<div class="room-share">' +
				'<div class="room-field"><label>Room code</label>' +
				'<div class="room-val"><code>' + esc(App.room.code) + "</code>" +
				'<button class="btn small" data-roomcopy="' + esc(App.room.code) + '">Copy</button></div></div>' +
				pwRow +
				inviteRow +
				"</div>" +
				'<h3 style="margin-top:16px">In this room (' + members.length + ")</h3>" +
				'<div class="room-members">' + memberHtml + "</div>" +
				'<button class="btn danger" id="roomLeaveBtn" style="margin-top:16px">Leave room (go local-only)</button>' +
				"</div>";
			return;
		}

		// not in a room (rare: e.g. sync failed at start) -> offer to join one
		host.innerHTML =
			'<div class="card"><h2>Live Room</h2>' +
			'<p class="hint">You are not in a live room. Start or load a game to open ' +
			"one automatically, or join a friend's room below.</p>" +
			'<div class="room-share" style="margin-top:12px">' +
			'<div class="room-field"><label>Room code</label>' +
			'<input type="text" id="joinRoomCode" placeholder="e.g. black2-abc12" autocomplete="off" /></div>' +
			'<div class="room-field"><label>Password</label>' +
			'<input type="password" id="joinRoomPw" placeholder="room password" autocomplete="off" /></div>' +
			"</div>" +
			'<button class="btn ok" id="joinRoomCardBtn" style="margin-top:14px">Join room</button>' +
			"</div>";
	}

	// ====================================================================
	// Level Caps — hardcore-nuzlocke caps (highest boss Pokémon level) for the
	// current game, in story order. The "current" cap is the next boss you have
	// not beaten yet, derived from the badge count on the Dashboard.
	// ====================================================================
	function renderLevelCaps() {
		var game = App.state.game;
		var info = App.levelCapInfo();
		// REGION_DATA.get(game) -> { gen, region:{ badges, ... } }
		var rd = window.REGION_DATA.get(game);
		var badges = rd && rd.region && rd.region.badges ? rd.region.badges : null;

		if (!info) {
			el("tab-Caps").innerHTML =
				'<div class="card"><h2>Level Caps</h2>' +
				'<p class="hint">No level-cap data for ' +
				esc(game) +
				".</p></div>";
			return;
		}

		var caps = info.caps;
		var currentIdx = info.currentIdx;

		var rows = caps
			.map(function (c, idx) {
				var cleared = idx < currentIdx;
				var isCurrent = idx === currentIdx;
				// name a gym after its badge where we have one
				var name = c.label;
				if (c.kind === "gym" && badges && badges[c.gymIndex]) {
					name = badges[c.gymIndex] + " Badge";
				}
				var kindLabel =
					c.kind === "gym" ? "Gym " + (c.gymIndex + 1)
					: c.kind === "e4" ? "Elite Four"
					: c.kind === "champion" ? "Champion"
					: "Boss";
				return (
					'<div class="cap-row' +
					(cleared ? " done" : "") +
					(isCurrent ? " current" : "") +
					'">' +
					'<span class="cap-kind">' +
					esc(kindLabel) +
					"</span>" +
					'<span class="cap-name">' +
					esc(name) +
					(isCurrent ? ' <span class="cap-tag">current cap</span>' : "") +
					"</span>" +
					'<span class="cap-lv">Lv ' +
					c.level +
					"</span></div>"
				);
			})
			.join("");

		var curCap = currentIdx < caps.length ? caps[currentIdx] : null;
		var summary = curCap
			? 'Current cap: <b>Lv ' + curCap.level + "</b> (" + esc(curCap.label) + ")"
			: "All bosses cleared — no cap.";

		el("tab-Caps").innerHTML =
			'<div class="card"><h2>Level Caps — ' +
			esc(game) +
			" (Gen " +
			(rd ? rd.gen : "?") +
			")</h2>" +
			'<p class="hint">Hardcore-nuzlocke caps: the level of each boss’s ' +
			"highest Pokémon. Don’t let your team exceed the current cap. Caps " +
			"track the badges you set on the Dashboard.</p>" +
			'<div class="cap-summary">' +
			summary +
			"</div>" +
			'<div class="cap-list">' +
			rows +
			"</div></div>";
	}

	// expose internal renderers
	App._renderers = {
		setup: renderSetup,
		dashboard: renderDashboard,
		info: renderPokemonInfo,
		catch: renderCatchRate,
		caps: renderLevelCaps,
		room: renderRoom,
	};
})(window.App);

# Soul Link Tracker

A retro, pixel-styled web app for tracking Pokémon **Soul Link / Nuzlocke** runs
(Generations 1–5). It runs entirely in the browser — no install, no account
required — and lets a group of friends play the same run together in real time.

## ▶ Try it online

**<https://zytechtv.github.io/SoulLinkTracker/>**

Just open the link, start a game (or load a save), and you're ready. To play with
friends, share your room code + password from the **Room** view (the LIVE pill in
the top-right).

---

## Features

- **Dashboard** — per-player teams (6 slots each), gym badges, death counters, and
  a team type-analysis bar chart showing combined weaknesses / resistances, with a
  per-Pokémon breakdown on hover.
- **Bank** — drag-and-drop box management to move soul-linked Pokémon between team
  and storage.
- **Pokémon Info** — generation-correct stats, abilities, evolutions and level-up
  moves, pulled live from PokéAPI.
- **Catchrate Calculator** — generation-accurate catch odds (separate Gen 1, 2,
  3–4 and 5 formulas), an HP slider, status conditions, and an interactive ball
  comparison with situational modifiers (turn, level, weight, fishing, night…).
- **Level Caps** — hardcore-nuzlocke level caps for each game, tracked automatically
  against the badges you've earned.
- **Live Rooms** — every game is automatically a live room. Friends join with a
  code + password (or a one-click invite link) and edit the same run in real time.
  A shared, persisted **Run Log** records the important events (encounters, catches,
  deaths, bank moves, badges, evolutions) so the whole run can be retraced.
- **Save / Load** — the run is exportable to a JSON file at any time and can be
  re-imported later or on another device.

---

## Playing with friends (live rooms)

1. One person starts a new game (or loads a save) — this automatically opens a
   **live room** with a generated code + password.
2. Open the **Room** view (click the 🔴 **SYNCED** pill, top-right) to copy the
   **invite link** (code + password in one) and send it to your friends.
3. Friends open the link → confirm join → pick a display name → they're in.
4. Everyone edits the same run live. Anyone can **Export** a JSON backup at any time.

Rooms are kept for **7 days** of inactivity so a paused run survives, then are
cleaned up automatically. Leaving a room (or closing the tab) just drops you to
local-only play — the game keeps running.

---

## Running it locally

The app is fully static, but it loads sprites and PokéAPI data over HTTPS, so it's
best served over http(s) rather than opened as a `file://` URL:

```bash
# from the project folder
python -m http.server 8000
# then open http://localhost:8000
```

No build step, no dependencies — it's plain HTML/CSS/JS.

---

## Hosting

Because it's a static site, it can be hosted anywhere that serves static files
(GitHub Pages, Netlify, Cloudflare Pages, …). This repo is published with
**GitHub Pages** (Settings → Pages → deploy from the `main` branch).

### Live sync (optional)

The real-time rooms are powered by **Firebase Realtime Database**. If you fork this
project and want live sync to work on your own deployment, you'll need your own
Firebase project:

1. Create a Firebase project and a **Realtime Database**.
2. Enable **Anonymous** authentication and add your hosting domain to the
   authorized domains.
3. Apply the security rules from [`firebase.rules.json`](firebase.rules.json).
4. Replace the `firebaseConfig` in [`js/sync.js`](js/sync.js) with your own.

> The Firebase **web API key is public by design** (it ships in client code); the
> database is protected by the security rules (`auth != null`) plus anonymous auth,
> not by hiding the key.

Without a Firebase setup the app still works fully — just locally, with JSON
export/import instead of live rooms.

---

## Project structure

```text
index.html            entry point + script/style includes
css/style.css         all styling (retro / CRT look)
data/
  pokemon.js          Pokémon dex data (types per generation, families)
  types.js            type-effectiveness charts (Gen 1 and Gen 2–5)
  regions.js          games → region, badges, catch locations
  levelcaps.js        hardcore-nuzlocke level caps per game
js/
  state.js            single source of truth + JSON serialize/apply + run log
  catch.js            soul-link catch / death / bank logic
  catchrate.js        per-generation catch-rate maths + ball catalogue
  pokeapi.js          live PokéAPI access (with per-session caching)
  sync.js             Firebase live-room sync, presence, dead-room cleanup
  render.js           builds the UI from state
  ui.js               event wiring, toasts, room flows, log panel
```

---

## A note on API usage

The app uses a few free, public services (see Acknowledgements). Calls are made
**only on user interaction** (e.g. opening the Pokémon Info or Catchrate tabs) and
PokéAPI responses are cached per session, in line with the
[PokéAPI fair-use policy](https://pokeapi.co/docs/v2). Sprites and badge images are
plain images the browser caches via the normal HTTP cache.

Further optimizations are possible in theory — a persistent (cross-reload) cache,
baking `capture_rate` into the local data, or self-hosting the sprites. At the
current scale (a small group of friends) these were **deliberately left out as
over-engineering**: the request volume is tiny, the existing per-session caching
already satisfies the fair-use policy, and the added complexity wouldn't pay off.
If usage ever grows substantially, a persistent cache is the first worthwhile step.

---

## Acknowledgements & data sources

Huge thanks to the projects and communities whose open data and assets make this
possible:

- **[PokéAPI](https://pokeapi.co/)** — Pokémon stats, abilities, evolutions,
  level-up moves and capture rates. Free and open; please respect their
  [fair-use policy](https://pokeapi.co/docs/v2).
- **[Pokémon Showdown](https://play.pokemonshowdown.com/)** — animated Pokémon
  sprites.
- **[PokéAPI/sprites](https://github.com/PokeAPI/sprites)** — Poké Ball / item
  sprites.
- **[Bulbagarden Archives](https://archives.bulbagarden.net/)** — gym badge images.
- **[Nuzlocke University](https://nuzlockeuniversity.ca/2022/01/18/hardcore-nuzlocke-level-caps-by-generation/)**
  — the hardcore-nuzlocke level-cap data.
- **[Firebase](https://firebase.google.com/)** — real-time room sync.

---

## License

The original source code of this project is released under the
**[MIT License](LICENSE)** © Torben Kley (ZytechTV).

The MIT license covers only the code written for this app. It does **not** cover
the third-party data and assets listed above (Pokémon names, sprites, game data,
…), which remain the property of their respective owners.

---

This is a non-commercial fan project for personal use and is **not affiliated with,
endorsed by, or sponsored by Nintendo, Game Freak, or The Pokémon Company**.
Pokémon and Pokémon character names are trademarks of Nintendo. All referenced
data and assets belong to their respective owners.

# Soul Link Tracker

A retro, pixel-styled tracker for Pokémon **Soul Link / Nuzlocke** runs (Gen 1–5),
built as a single static web app — no backend, no install. Everything runs in the
browser; runs are shared via JSON export/import.

## Features

- **Dashboard** — per-player teams, badges, death counters, and a team type-analysis
  bar chart (weaknesses / resistances, with a per-Pokémon hover breakdown).
- **Bank** — drag-and-drop box management for caught Pokémon.
- **Pokémon Info** — live data from PokéAPI (stats, abilities, evolutions, level-up
  moves), generation-correct for the chosen game.
- **Catchrate Calculator** — generation-accurate catch odds (Gen 1–5 formulas),
  HP slider, status, and an interactive ball comparison with situational modifiers.
- **Level Caps** — hardcore-nuzlocke level caps per game, tracked against your badges.

## Run it

Just open `index.html` in a browser — but because it loads sprites and PokéAPI data
over HTTPS, it's best served over http(s). For local development:

```bash
# from the project folder
python -m http.server 8000
# then open http://localhost:8000
```

## Hosting

The app is fully static, so it can be hosted on GitHub Pages, Netlify, Cloudflare
Pages, etc. See the repository's Pages settings to publish.

## Data sources

- Pokémon data & sprites: [PokéAPI](https://pokeapi.co/) and
  [Pokémon Showdown](https://play.pokemonshowdown.com/).
- Level caps: [Nuzlocke University — Hardcore Nuzlocke Level Caps](https://nuzlockeuniversity.ca/2022/01/18/hardcore-nuzlocke-level-caps-by-generation/).

This is a fan project and is not affiliated with Nintendo / The Pokémon Company.

# Dawn of War Wikicalc

A local English-language wiki and explainable trade calculator for **Dawn of War: Definitive Edition**. Statistics come from your installed game files. The game installation is strictly read-only.

## Start

On Windows, double-click **Start Wikicalc.cmd**, then open **http://127.0.0.1:4173**. The launcher uses Node.js from PATH, or the existing Codex bundled runtime. It imports the game automatically if no database exists.

For development, use Node.js **24 or later**. There are **no npm dependencies**, paid services or build step.

```powershell
node scripts/import.mjs
node server.mjs
```

Keep the server terminal open. Press Ctrl+C to stop. The server binds only to `127.0.0.1`; nothing is published. Set the `PORT` environment variable if port 4173 is occupied.

## Reimport after a patch

Stop the server, then run `node scripts/import.mjs`. For another installation:

```powershell
node scripts/import.mjs "--game=D:\Games\Dawn of War Definitive Edition"
```

Import reads declared modules, archives and loose data, resolves first-match precedence, parses SGA/RGD and English localization, then builds a fresh SQLite database and replaces the old dataset after successful completion. Stable virtual paths identify records, so repeated imports do not add duplicates. Each record retains its original member SHA-256 and archive. A dataset fingerprint identifies effective source content and module configuration; this avoids guessing a patch number from module version `1.0`.

`node scripts/import.mjs --cached` renormalizes the previous extraction. It **does not** detect a patch. All extracted data and generated databases stay under ignored `data/`.

## Features

- All nine factions, grouped into infantry, vehicles and buildings.
- Search, category/faction filters and optional campaign/scripted variants.
- Individual pages with source-backed costs, baseline build times, health, armour, mobility, squad/morale data, weapons, research, requirements and abilities.
- Linked records, source archives and searchable original field paths. Missing values remain distinct from zero.
- Multiple groups per force, squad sizes, hardpoint weapon choices and supported research.
- Expected DPS, simultaneous model attrition, surviving health, elapsed time and separate requisition/power costs and allocated losses.

## Model boundaries

This is an **expected-damage experiment**, not an engine replay. It uses accuracy, damage ranges, minimum damage, numeric armour, armour-class piercing, reload intervals, health and regeneration. Model losses reduce ongoing DPS. Groups focus-fire in list order; damage is simultaneous in short steps.

Both forces stand at fixed range on open ground with unbroken morale. Movement, cover, morale breaks, abilities, splash victims, animation/burst timing, sync kills, leaders, reinforcement and transport occupants are excluded. Melee assumes every model can engage. Unsupported mechanics cause explicit errors where necessary. Only research whose relevant effects can be safely interpreted is selectable; other research remains visible. Infrastructure requirements are assumed available, while supported research dependencies are checked. See [the combat model](docs/combat.md).

Build times are blueprint baselines. Strategic-point bonuses, race economy rules and campaign scripts can change effective times and costs. Campaign variants are retained, but flags and naming conventions are not a complete availability rules engine. Unrecognized field names remain hexadecimal hashes and are disclosed in the manifest.

## Verification

```powershell
node --test tests/*.test.mjs
node scripts/check.mjs
node scripts/verify-sources.mjs
node scripts/verify-normalization.mjs
```

Tests use explicitly synthetic fixtures for parsing, null/zero preservation, database replacement, modifiers, damage floors and attrition. Source verification rereads original archive members across all factions and categories. Generated game data is never committed. See [verification notes](docs/verification.md).

## Architecture

| Component | Purpose |
| --- | --- |
| `lib/extract-formats.mjs`, `lib/extract.mjs` | SGA/RGD/UCS decoding and module precedence |
| `lib/normalize.mjs`, `lib/research.mjs` | Squad/entity/weapon composition and research |
| `lib/database.mjs` | SQLite records, indexed summaries and explicit relations |
| `lib/combat.mjs` | Pure combat calculations and validated modifiers |
| `server.mjs` | Local HTTP API and static server |
| `public/` | Responsive dependency-free browser interface |

SQLite stores compressed record documents alongside indexed identities, summaries and relationships. Raw decoded files remain local for audit. See [extraction and provenance](docs/extraction.md).

## References and licensing

The [Dawn of War Player's Guide](https://warhammer-guide.ru/wiki/Dawn_of_War_Players_Guide.html) informed faction/category navigation and relevant fields. Its historical values are not used as game data. No reference-site images or descriptive articles are copied.

The RGD field-name dictionary is credited in `resources/rgd-dictionary.txt`, with its distribution notice retained. Original game archives, images, sounds and generated datasets are not uploaded. Users need their own game installation.

# Development

Requires Node.js 24 or later. No npm dependencies or compilation step are needed.

```powershell
node scripts/import.mjs
node server.mjs
```

The Windows launcher finds Node.js on PATH or in the existing Codex runtime. Default server address: http://127.0.0.1:4173. Set PORT to change it.

## Game data

The game installation is read-only. All generated files stay in ignored data/. Stop the server before importing after a game update:

```powershell
node scripts/import.mjs
node scripts/import.mjs "--game=D:\Games\Dawn of War Definitive Edition"
```

The default installation path is defined in lib/extract.mjs. The --cached option renormalizes the previous raw extraction; it does not read a patch. Import builds a fresh SQLite database and replaces the previous database after success. Original game archives and generated data must not be committed.

Source identities, hashes and full extracted fields remain available internally for audit. They are not player-facing product features. See [extraction](extraction.md) for module precedence and formats.

## Architecture

- lib/extract*.mjs: SGA, RGD, UCS and module loading.
- lib/normalize.mjs and roster/leader helpers: multiplayer catalogue and unit composition.
- lib/research.mjs: supported modifiers and research dependencies.
- lib/combat.mjs: expected-damage simulation and casualty accounting.
- lib/database.mjs: compressed records, summaries and relationships in SQLite.
- server.mjs: local API and static files.
- public/: responsive browser UI.

## Checks

```powershell
node --test tests/*.test.mjs
node scripts/check.mjs
node scripts/verify-sources.mjs
node scripts/verify-normalization.mjs
```

With the server running, use node scripts/verify-app.mjs for HTTP workflow regression checks. Generated audit reports remain under data/. Test fixtures use explicit synthetic values; displayed game statistics do not.

The RGD dictionary retains its author and distribution notice in resources/rgd-dictionary.txt.

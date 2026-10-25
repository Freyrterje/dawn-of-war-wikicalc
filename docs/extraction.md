# Local game extraction

`node scripts/extract.mjs [game-directory] [output-file]` reads the installation and writes `data/generated/raw.json` by default. It uses only Node standard libraries. The game directory is never opened for writing. The command rejects an output inside the game directory.

## Formats and precedence

The inspected installation uses SGA version 2 archives, Relic Chunky version 1 RGD attribute records, and UTF-16LE UCS localization. The reader supports Chunky versions 1 and 3 and fails on unsupported types instead of inventing values. SGA members are read by offsets; only RGD and UCS members are decompressed. Art, audio, textures, executables and original archives are not copied.

The root module is `DoWDE.module`. Module declarations explicitly state that the first listed folder/archive wins. The importer visits each module's numbered data folders, then numbered archives, then required modules recursively, skipping already visited modules. In this installation the module priority is DoWDE, DXP3, DXP2, WXP, W40k. `%LOCALE%` resolves to `Locale/English`. Loose data wins over archives in the same module. The entire winning RGD file replaces lower-priority files; compiled RGD tables already contain their resolved values. `$REF` fields are retained as relationships and type identities, not re-applied as another inheritance layer.

The English game strings are consolidated in `Engine/Locale/English/Engine.ucs`. These are read after module-local string sources, as engine fallback strings. String provenance includes its file and SHA-256. RGD localization IDs remain intact in raw records.

## Reproducibility and provenance

Each raw record has a stable lower-case virtual path, module, winning archive/member, and SHA-256 of its uncompressed original bytes. Shadowed definitions are listed in metadata. The dataset ID is a SHA-256 of module content hashes, winning member paths/content hashes/sources and localization content/provenance; timestamps do not affect it. No human patch number is guessed. All declared archives are indexed, including those with no attributes, so missing declared archives are reported.

The output distinguishes absent keys, `false`, numeric zero and empty strings. Unknown field-name hashes are retained as `0x...` keys and listed in metadata. On the inspected dataset, 21 field-name hashes remain unknown, mainly AI/pathfinding tuning and a few flags. No unknown value is discarded. Malformed data or unsupported record types abort extraction.

`node scripts/verify-sources.mjs` reopens 27 original archive members: infantry, vehicle/monster and building records from each of the nine factions. It verifies member identity, content hash and all decoded fields against the saved dataset, and writes a local verification report. This establishes extraction consistency; it does not independently prove the game's combat engine interpretation.

`node --test tests/extraction.test.mjs` uses independent synthetic binary fixtures for archive directory offsets, compression, RGD zero/false/reference values, UCS and module declarations. Repeated extraction of unchanged files produces the same dataset ID. Generated game data and research downloads are ignored by Git.

`node --test tests/normalization.test.mjs` covers squad creation costs, initial versus maximum squad size, regeneration, missing values, default weapon alternatives, support-cap monster categories, campaign/cinematic variants and linked weapon metadata. `node scripts/verify-normalization.mjs` checks a further 27 catalog entries across all factions/categories against raw health, armour, costs, times, regeneration and default weapon values. It writes `data/generated/normalization-verification.json` locally.

## Format references and dictionary

The implementation was written for this project from the observed format layouts, cross-checked against the [Corsix Mod Studio SGA reader](https://github.com/jbelford/CorsixModStudio/blob/master/src/rainman/archive/CSgaFile.cpp) and [RGD reader](https://github.com/jbelford/CorsixModStudio/blob/master/src/rainman/formats/CRgdFile.cpp). The original field-name [RGD dictionary](https://github.com/jbelford/CorsixModStudio/blob/master/Mod_Studio_Files/dictionaries/RGD_DIC.TXT) is included in `resources/rgd-dictionary.txt`; its header explicitly permits obtaining, modifying and redistributing the dictionary, with no copyrights claimed. Its original notice is preserved. The reader code is independently implemented; reference source downloads remain untracked in `data/research/`.

## Scope

This importer targets the installed Definitive Edition root module and English locale. It does not claim mod-loader precedence for arbitrary third-party mods, campaign runtime SCAR effects or per-save modifiers. All compiled attributes are retained, including campaign variants and non-playable entries; the application decides which appear in its main catalog. New archive or RGD versions require an explicit reader update.

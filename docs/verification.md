# Verification record

Verified locally on 2026-10-25 with Node.js 24.22.1 and the installed Definitive Edition data.

- Dataset SHA-256: `75e1ae71fac3d0feb66a78910b5c0d2cbc53d798980b7e149d6c33257ed68272`.
- 4,709 decoded RGD records, 25,301 English strings, 4,012 shadowed definitions.
- 571 wiki entries across nine factions, including campaign and scripted variants. The default filter shows 263 records; this is a blueprint catalog, not a guaranteed multiplayer build menu.
- 21 unknown field-name hashes are preserved as hexadecimal identifiers and disclosed in metadata.
- 33 automated tests passed: binary parsing, database rollback/idempotency, normalization, supported research, combat mathematics and input validation.
- `scripts/check.mjs` checks all application and test JavaScript syntax; no compilation step is required.
- `scripts/verify-sources.mjs` rereads 27 source members from original archives, verifies their SHA-256 and parsed fields, covering infantry, vehicles and buildings for each faction.
- `scripts/verify-normalization.mjs` checks 27 representative entries against decoded source health, armour, costs, production time, regeneration and default weapon fields.
- `scripts/verify-app.mjs` exercises the running HTTP application: all factions/categories, source provenance, actual unit combat, invalid counts, partial weapon quantities, upgrade caps, capacity research and melee symmetry.

Actual-data smoke test: one starting Guardsmen squad against one starting Space Marine Squad, stationary at range 20, produces initial expected DPS 27.5 versus approximately 42.614 and a Marine victory at approximately 19 seconds under the documented assumptions. This is a model regression example, not an observed in-engine combat result.

Browser checks covered desktop index/search, the Space Marine Squad detail page, add-to-force actions, partial weapon loadouts, the Heavy Weapon Increase research changing the limit from 2 to 4, ranged and melee result display, health charts and dataset information. A 390×844 viewport showed a usable stacked calculator and detail page, with no document-width overflow. Browser error logs were empty. The temporary viewport override was reset.

## Explicit limits

Research support is conservative: an upgrade with relevant effects the model cannot interpret is displayed with a reason and cannot be selected. Not every research is supported. Slave-group firing timing is rejected. Morale breaks, cover, movement, abilities, splash victims, animation timing, leaders and other stated exclusions are not simulated. No in-engine replay comparison was performed. Source checks establish extraction and normalization consistency; mathematical tests establish the specified model, not engine equivalence.

Campaign/scripted classification combines source flags and naming conventions. Some internal or alternate blueprints remain in the default index. Every record retains its stable source ID so similarly named records can be distinguished. Effective production and economy effects are not a complete build-order simulation.

The game installation was read only. Generated data remains local and is ignored by Git. No public hosting or paid services were created.

# Combat model

`lib/combat.mjs` exports `weaponDps`, `expectedHitDamage`, `applyModifiers`, and `simulateTrade`. The calculator is a deterministic expected-damage attrition experiment, not a reproduction of the game engine. Its visible assumptions travel with every result.

## Damage calculation

The archived [Relic Developer Network armour explanation](https://dow.finaldeath.co.uk/rdnwiki/www.relic.com/rdn/wiki/DOWAttributeEditor/ArmorAndDamageExplanation&show_comments=1.html) describes numeric armour, minimum armour, and per-type armour penetration. The model uses:

```
penetration = matching per-armour-type value, otherwise weapon default
multiplier = clamp(min(100 - target armour + penetration,
                       100 - target minimum armour) / 100, 0, 1)
expected DPS = accuracy * E[max(minimum damage, damage * multiplier)] / reload
```

The damage floor applies after armour. We integrate uniformly distributed damage between the extracted minimum and maximum; when the floor crosses that interval, flooring only its mean would understate the expectation. The random distribution and reload-only timing are explicit modeling assumptions. Fixed range gates ranged weapons. Melee requires separation zero and assumes contact; it does not require ranged-distance fields, which are absent on many melee blueprints. Ranged and melee weapons never fire together in one experiment.

Local checks found the tactical Marine's `health_ext.armour = 100`, `armour_minimum = 0`, and `type_ext.type_armour.$REF = type_armour\\tp_infantry_heavy_med.lua`. Numeric armour is not inferred from the armour-type name. Zero penetration remains a real zero; the minimum-damage floor can still produce damage.

## Attrition and targeting

Both sides deal damage simultaneously in steps of 0.05 seconds, preventing a first-side advantage. Every surviving model contributes its currently selected hardpoints. All groups focus the first surviving enemy group; damage concentrates on one model, spilling through models in that group. Model deaths reduce subsequent firepower. Excess damage within a step is not transferred to another group. This is a deliberately simple focus-fire policy; it does not predict human target selection.

Regeneration is applied to each wounded surviving front model and capped at its health. The normalized source in-combat reduction is subtracted where available; additional conditional suppression, resurrection, and healing abilities are not modeled. Morale remains unbroken; its damage, regeneration, death penalties and broken-state accuracy are not simulated. See returned assumptions for all exclusions, including setup time, movement, cover, abilities, projectiles, bursts, special attacks, splash victims and transport contents. Melee assumes every model is engaged. Area weapons describe only one primary target. Extracted air/ground target permissions gate damage. Nonzero weapon slave groups reject the estimate because their linked firing timing is not modeled.

Each hardpoint has one baseline weapon. An optional choice `{id, count}` replaces it on `count` models per squad, bounded by `unit.weaponUpgradeMax`. Unknown caps reject optional choices. Base-weapon models die first in this experiment, retaining upgraded weapons until too few models survive; different hardpoints are evaluated independently. This is an explicit casualty allocation policy, not a claim about the engine. Source requirements are shown in the wiki; the calculator does not simulate the technology tree.

## API and missing data

```
simulateTrade({
  left: [{unit, count: 1, squadSize: 4,
          weaponChoices: {hardpoint_01: {id: 'weapon-id', count: 1}},
          upgrades: ['research-id']}],
  right: [{unit, count: 1, squadSize: 4}]
}, {mode: 'ranged', range: 20, step: 0.05, maxTime: 600})
```

Units supply `hp`, `regen`, `armor` (type key), `armourValue`, `armourMinimum`, `squadMin`, `squadMax`, `weapons`, starting-squad `cost`, and per-added-model `reinforceCost`. Weapon fields: `id`, `slot`, `default`, `melee`, `accuracy`, `minDamage`, `maxDamage`, `minDamageValue`, `reload`, `minRange`, `maxRange`, `armourPiercing`, and `armourPiercingTypes` keyed exactly like `unit.armor`. Optional weapon costs describe one purchased replacement.

Missing combat inputs fail visibly instead of becoming zero. Missing costs yield `null` totals. Zero-cost units remain valid. No enemy damage means a time-limit result rather than an invented kill time. Start DPS is against the first opposing group and is labeled separately from the attrition outcome.

Results include `status`, elapsed `time`, `left` and `right` summaries, and health/model `history`. Each side has `initialDps`, `initialHp`, `initialModels`, `remainingHp`, `remainingModels`, purchase `cost`, allocated `losses`, and per-group survivors. Resource losses allocate known purchase costs in proportion to model casualties; they are neither refunds nor exact reinforcement bills. Costs include requested extra models, selected weapon purchases, and selected research. A research selected on multiple groups is charged on each group; do not interpret that as a whole-army build-order optimizer.

## Research modifiers

Only normalized upgrades explicitly marked `supported: true` may be applied. Their `modifiers` contain `{field, operation, value, weaponId?}`; operations are `multiply`, `add`, and `set`. Unit fields supported are `hp`, `regen`, `armourValue`, and `armourMinimum`; exact squad-targeted capacity modifiers support `weaponUpgradeMax`. Weapon fields include `accuracy`, `minDamage`, `maxDamage`, `minDamageValue`, `reload`, and `maxRange`, and require the exact `weaponId`. Unknown fields or unavailable weapons fail closed.

`lib/research.mjs` matches source `target_type_name` to the exact entity, squad, or weapon basename, requires the corresponding application type, and retains source modifier paths. Any relevant unsupported effect disables the entire research for that entry. Effects targeting other entries do not invalidate this entry's estimate. Only probability-one, nonexclusive modifiers with known usage semantics are admitted. Research prerequisites are attached recursively and must be selected; they are applied in prerequisite order regardless of checkbox order. Negative research requirements enforce mutual exclusion. Unknown requirement types disable research. Infrastructure prerequisites, including buildings and global add-ons, are assumed satisfied and shown as source requirements; the calculator does not reproduce the technology tree or build order. Global upgrades selected for multiple groups are charged for each group as disclosed above.

## Verification

Run `node --test tests/combat.test.mjs`. Synthetic fixtures test armour overrides, numeric armour, the damage floor integral, range/mode gating, missing data, simultaneous mutual destruction, casualty-dependent DPS, regeneration stalemates, weapon choice caps, partial loadouts, modifier isolation, unknown costs, and step-size convergence. Synthetic numbers exist only in tests. These checks validate the specified mathematical model; they do not claim agreement with recorded engine combat.

# Combat model

The trade calculator compares multiplayer infantry and vehicles. It estimates expected damage and casualties; it does not reproduce every event in the game engine.

## Forces, squads and leaders

Each row describes one or more squads of the same type. The squad size is its number of regular troopers; purchased squad leaders are additional models, subject to the squad's leader limit. Every model has its own health, armour, regeneration, weapons and purchase cost. A Dark Reaper Exarch therefore contributes its own health and weapon damage, rather than being represented as another ordinary Dark Reaper.

Supported leader bonuses apply only while their owner is alive and only to their stated recipients. For example, the Dark Reaper Exarch's damage bonus applies to the squad troopers and excludes the leader where the game ability specifies that. Bonuses disappear when the owner dies. Unsupported leader mechanics are identified and excluded rather than silently approximated.

Both forces focus the first surviving squad in row order. Within each squad, ordinary troopers are targeted first, then troopers carrying purchased weapons, then leaders. This is a deliberate, visible casualty-order assumption: it is not a claim about targeting or attachment position in a match. The next squad is targeted after the current squad is eliminated.

## Global research and resource losses

Building research is global to its force. Selecting a research once applies its relevant effects to every eligible squad and selected leader in that force, and its cost is charged exactly once. The other force has its own independent research purchases. Research remains after units die and is **never included in losses**.

Results separate:

- **Army cost:** purchased troopers, squad weapons and leaders.
- **Global research:** one-time purchases retained after the engagement.
- **Total investment:** army cost plus global research.
- **Resources lost:** purchase cost of the models actually killed, including any purchased weapons they carried.

Initial squad cost is divided among its starting troopers. Extra troopers use their reinforcement price. Leaders retain their own purchase price. Purchased weapons are assigned to individual carriers and lost only when those carriers die. A squad with no power cost cannot lose power merely because global research was purchased. Missing costs remain unavailable rather than becoming zero.

Research prerequisites and mutual exclusions are checked, and prerequisite effects are applied first. Building and technology infrastructure is assumed available. Unsupported relevant effects disable a research for that force; upgrades unavailable through multiplayer production are not offered.

## Damage calculation

The archived [Relic Developer Network armour explanation](https://dow.finaldeath.co.uk/rdnwiki/www.relic.com/rdn/wiki/DOWAttributeEditor/ArmorAndDamageExplanation&show_comments=1.html) describes numeric armour, minimum armour and armour-class piercing. The calculation is:

```
penetration = matching armour-class value, otherwise weapon default
multiplier = clamp(min(100 - armour + penetration,
                       100 - minimum armour) / 100, 0, 1)
expected DPS = accuracy * E[max(damage floor, damage * multiplier)] / reload
```

Damage is treated as uniformly distributed between the weapon's minimum and maximum. The minimum-damage floor is applied after armour for each value in that interval, rather than after averaging. Actual zero penetration stays zero. The damage floor may still allow damage.

Only one chosen weapon per hardpoint fires, and ranged/melee weapons never fire simultaneously. Optional weapon quantities replace the baseline weapon on that many troopers per squad and obey the shared upgrade cap. Ranged attacks require the fixed separation to lie within the weapon's range. Melee requires separation zero and assumes every model can engage; melee weapons do not require ranged-distance fields. Air/ground target permissions are respected. Linked weapon slave-group timing is unsupported and rejects the estimate.

## Time and exclusions

Damage is simultaneous in steps no longer than 0.05 seconds, shortened to the next death event on either side. This prevents an arbitrary kill-rate cap and allows the next target to use its own armour immediately. Neither side receives a first-turn advantage, and every surviving model contributes its current weapons. High-damage and ordinary engagements are checked for step-size convergence. In-combat regeneration is applied and capped at each model’s maximum health.

Morale remains unbroken. Movement, cover, activated abilities, splash victims, setup/burst/animation timing, projectile travel, sync kills, resurrection, reinforcement and transport occupants are excluded. Supported leader bonuses are the exception to ability exclusion. Supported health auras start models at full modified health. When an aura ends, health is clamped to the new maximum without healing; this is an explicit model assumption. These assumptions are returned with every result.

No in-engine replay comparison has been performed. The tests establish mathematical correctness and source-backed selection, not agreement with an actual match.

## Developer API

```js
simulateTrade({
  left: [{ unit, count: 2, squadSize: 4,
           weaponChoices: { hardpoint_01: { id: 'weapon-id', count: 1 } },
           leaders: [{ id: 'leader-id', count: 1 }] }],
  right: [{ unit: opponent, count: 1, squadSize: 6 }],
  research: { left: ['research-id'], right: [] }
}, { mode: 'ranged', range: 20, step: 0.05, maxTime: 600 });
```

`lib/combat.mjs` contains damage mathematics and modifier application; `lib/combat-engine.mjs` contains force construction and per-model attrition. Leader choices provide complete normalized model profiles and scoped modifiers. `lib/research.mjs` maps exact multiplayer entity, squad and weapon targets, including leader-specific effects. Tests use explicitly synthetic fixtures and never provide application game statistics.

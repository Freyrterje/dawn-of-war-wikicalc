# Verification record

Verified locally on 2026-10-25 with Node.js 24.22.1 and installed Definitive Edition data.

- 247 multiplayer catalogue entries across nine factions: 97 infantry, 58 vehicles, 92 buildings. Buildings are reference-only and rejected by the calculator.
- Multiplayer production, starting units, transformations and summons determine eligibility. Campaign requirements and internal duplicate variants are excluded. All catalogue entries have an explicit reference ordering.
- 47 automated tests pass, covering extraction, normalization, database transactions, damage, research, model losses, leaders, health auras and validation. JavaScript syntax checks pass.
- 27 representative normalized entries match decoded source health, armour, purchase costs, production times, regeneration and default weapons across all nine factions and three categories.
- HTTP application checks pass, including campaign/building rejection, one Dark Reaper squad, selectable Exarch, weapon caps, global research purchased once and zero power casualty losses for power-free troops.
- Desktop browser checks cover the index, Dark Reaper profile, Exarch selection and combat results. Three Dark Reapers plus an Exarch start at 1,935 HP and 55.71 expected DPS against three unupgraded Dark Reapers. The Exarch survives this modeled engagement; power lost remains zero. Browser error logs were empty.
- Guard versus Space Marines remains a regression example: initial DPS 27.5 versus about 42.614; Marine victory at about 18.996 seconds.

## Limits

These are stationary expected-damage estimates, not replay-verified engine simulations. Casualty order is ordinary troopers, weapon carriers, then leaders. Supported leader bonuses cease with their owner. Health-aura removal clamps surviving health to the new maximum without healing. Conditional or unsupported effects are conservatively unavailable. Movement, cover, morale breaks, activated abilities, splash victims and firing animations are excluded.

The game installation was read only. Generated game data remains local and ignored by Git. No public hosting or paid services were created.

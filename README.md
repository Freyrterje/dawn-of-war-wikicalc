# Dawn of War Wikicalc

A multiplayer unit reference and trade calculator for **Dawn of War: Definitive Edition**.

## Explore your army

Browse all nine factions, with infantry, vehicles and buildings arranged in the familiar Player's Guide order. Search for a unit, inspect its health, armour, movement, costs and weapons, and compare its reinforcement and upgrade options.

The roster focuses on multiplayer units. Campaign variants and standalone versions of squad leaders are not offered as separate armies. Buildings remain in the field index for reference and cannot enter the trade calculator.

## Compare a trade

Add infantry and vehicles to either force. Choose the number of squads, regular squad members, weapon upgrades and available squad leaders.

- **Squad leaders** have their own health, armour, weapons and purchase cost. Supported leader bonuses affect the squad while the leader survives.
- **Weapon upgrades** belong to individual models. Their cost is lost when their bearer dies.
- **Global research** is bought once per force, affects eligible units, and remains available after casualties. Its cost is shown separately and is never counted as a combat loss.
- Results show expected starting DPS, surviving models and health, elapsed engagement time, and requisition and power lost through casualties.

## Understand the estimate

The calculator compares stationary forces at a chosen range, or assumes all models are engaged in melee. Both sides attack simultaneously; losing models reduces firepower. Each force targets the opposing groups in the order shown.

This is an estimate, not a match prediction. Movement, cover, morale breaks, active abilities, splash victims, animation timing and reinforcement during combat are not simulated. Leaders survive behind regular troopers under the model's stated casualty order. Supported bonuses disappear when their leader dies. Unsupported upgrade effects are identified rather than silently included.

See [combat assumptions](docs/combat.md) for the complete model and cost rules.

## Run locally

On Windows, double-click **Start Wikicalc.cmd**, keep the window open, and visit **http://127.0.0.1:4173**. Close the server with Ctrl+C when finished.

For development setup, updating game values and tests, see [the development guide](docs/development.md).

## Credits

The faction and category ordering follows the [Dawn of War Player's Guide](https://warhammer-guide.ru/wiki/Dawn_of_War_Players_Guide.html). Game values reflect Definitive Edition rather than the guide's historical balance values. This is an independent fan project, not an official game product.

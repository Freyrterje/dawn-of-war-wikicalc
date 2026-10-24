# Dawn of War Wikicalc

A wiki and combat trade calculator for Dawn of War Definitive Edition, powered by data extracted from the locally installed game files.

## Project goals

- Read game files and extract structured information without modifying the game installation.
- Store extracted data in a database with references to its source files and game version.
- Build a web application with standard wiki information about units, vehicles, and buildings.
- Build a calculator for comparing combat trades between units, with explicit assumptions and relevant combat modifiers.

## Planned components

1. **Data extraction:** Read and normalize relevant game statistics.
2. **Database:** Store entities, weapons, armor, costs, upgrades, and relationships where available in the source data.
3. **Wiki:** Browse and compare units, vehicles, and buildings.
4. **Trade calculator:** Estimate combat outcomes and resource efficiency using the extracted statistics.

## Development constraints

The game installation is strictly read-only. Extracted data and application files belong in the separate project workspace. Calculator results should state their assumptions and limitations.

## Status

Initial project setup. The technology stack and implementation are not yet selected.
# HexFactory

A mobile-portrait (`390x844`) 12-turn **Catan + Mindustry** tactical roguelike prototype built with **Vite + TypeScript + Phaser 3** and 100% procedural graphics (zero external assets).

## Features
- **19-Hex Axial Board Graph**: Deduplicated 54 vertices and 72 edges with full bidirectional adjacency lists, standard Catan terrain/dice-token distribution (crimson 6 & 8), Catan distance rule for Harvesters/Drill Rigs, and a starting Core + Harvester + Conveyor Mk.I chain.
- **4-Phase Turn Loop (12 Turns)**:
  1. **Roll & Harvest**: 2d6 harvest roll with optional **Magnetic Bias** (1 Power Cell: 3d6 drop mismatched parity) and 7 Core Siphon.
  2. **Logistics & Smelt**: Weighted BFS conveyor routing (`Mk.I`: 2 items/turn up to 3 edges; `Mk.II`: 5 items/turn up to 6 edges) and automatic refinement recipes (`Brick`, `Steel`, `Power Cell`, `Silicon`).
  3. **Build & Gamble**: Contextual mobile bottom-sheet `BuildDrawer` for Industry & Defense structures, Conveyor edges, upgrades, repairs, and **Overclock** toggles (+100% output/fire rate with `k/6` end-of-turn 50-DMG explosion risk).
  4. **Wave Combat**: Coastal enemy spawns (Turn 1–2 grace, Turn 3 Crawlers, Turn 6 Mid-Boss **Spiroct**, Turn 12 Final Boss **Eclipse**), shortest-path marching halted by Barricades, strict range-ordered turret combat (`2 → 1 → 0`), armor pierce, and 1d6 Jam/Normal/Crit rolls.

## Development

```bash
npm install
npm run dev
```

## Typecheck & Production Build

```bash
npx tsc --noEmit
npm run build
```

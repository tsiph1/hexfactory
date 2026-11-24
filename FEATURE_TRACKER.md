# HexFactory — Feature Tracker

Track implemented systems, work-in-progress features, and upcoming roadmap ideas.

## Status Legend
- `[x]` Implemented & Verified
- `[-]` In Progress
- `[ ]` Planned / Backlog

---

## v0.1 — Core 12-Turn Prototype (Completed)
- [x] **FEAT-001** Mobile-portrait Phaser 3 (`390x844`, `FIT`, `CENTER_BOTH`, touch capture) scaffold (`src/main.ts`)
- [x] **FEAT-002** Axial radius-2 hex board (`19` hexes, deduplicated `54` vertices, `72` edges, bidirectional adjacency lists) (`src/core/HexBoardGraph.ts`)
- [x] **FEAT-003** Standard Catan terrain/dice-token distribution with crimson `6`/`8` and probability pips
- [x] **FEAT-004** Starting state: Central Core on Desert border, starting Harvester 2 edges away, 2 Conveyor Mk.I edges
- [x] **FEAT-005** Phase 1 (`ROLL_AND_HARVEST`): 2d6 roll, Magnetic Bias (`1 PWR`, 3d6 drop mismatched parity), and Roll-7 Core Siphon (`src/core/EconomyEngine.ts`, `src/ui/DiceOverlay.ts`)
- [x] **FEAT-006** Phase 2 (`LOGISTICS_AND_SMELT`): Weighted BFS conveyor routing (`Mk.I` 2/turn · 3 edges, `Mk.II` 5/turn · 6 edges) and auto-smelting (`Brick`, `Steel`, `Power Cell`, `Silicon`) with animated resource packets
- [x] **FEAT-007** Phase 3 (`BUILD_AND_GAMBLE`): Contextual `BuildDrawer` for Industry & Defense structures, Catan distance rule enforcement, Conveyor edge builder, upgrades (`Harvester -> Drill Rig`, `Mk.I -> Mk.II`), repair, salvage, and Overclock toggle (`src/ui/BuildDrawer.ts`)
- [x] **FEAT-008** Phase 4 (`WAVE_COMBAT`): 12-turn wave curve (Grace T1–T2, Crawlers T3, Mid-Boss Spiroct T6, Final Boss Eclipse T12), Barricade blocking, range-ordered firing (`2 -> 1 -> 0`), exact armor-pierce formula, 1d6 Jam/Normal/Crit, and Overclock `k/6` 50-DMG explosion roll (`src/core/CombatEngine.ts`)
- [x] **FEAT-009** Procedural graphics (`BootScene.ts`), `18px` vertex / `16px` edge hitboxes, translucent turret range circles, combat laser/AoE VFX, Field Manual (`?`), and Win/Defeat summary modal

---

## v0.2 — Polish & Juice (Backlog)
- [ ] **FEAT-010** Procedural WebAudio SFX synthesizer (dice clatter, conveyor hum, laser zaps, explosion boom, victory chime) with mute toggle
- [ ] **FEAT-011** Seeded daily / custom run codes so players can replay or share specific 19-hex board layouts
- [ ] **FEAT-012** Interactive enemy & turret inspect tooltip (tap an enemy on the board to see HP, Armor, ATK, and shortest path to Core)
- [ ] **FEAT-013** Animated enemy march tweens along edges during Phase 4 (smooth slide from `fromVertexId` to `toVertexId`)
- [ ] **FEAT-014** Dedicated Vitest unit test suite in `tests/` for `HexBoardGraph`, `EconomyEngine`, and `CombatEngine`

---

## v0.3 — Roguelike Depth (Backlog)
- [ ] **FEAT-015** Post-Boss Relic / Upgrade draft after Turn 6 (`Spiroct`) (e.g., +1 Conveyor Range, Reduced Overclock Heat, Crit on 5–6)
- [ ] **FEAT-016** Difficulty Ascensions (Hazard 1–5 with tighter resources and elite enemy modifiers)
- [ ] **FEAT-017** LocalStorage high-score & run-history leaderboard
- [ ] **FEAT-018** PWA manifest & offline service worker for installable mobile home-screen play

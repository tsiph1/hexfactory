# HexFactory — Gemini Project Context (`Gemini.MD`)

## 1. Project Overview
**HexFactory** is a mobile-portrait (`390x844`, 9:16 aspect ratio) 12-turn **Catan + Mindustry** tactical roguelike built with **Vite + TypeScript + Phaser 3** and 100% procedural graphics (zero external image assets).

- **Repository:** https://github.com/tsiph1/hexfactory
- **Local Development Path (Windows):** `E:\prog\hexfactory`
- **Virtual Environment:** `E:\prog\hexfactory\.venv` (Python tooling/automation scripts, e.g., Playwright E2E tests)
- **Trackers:** See `BUG_TRACKER.md` and `FEATURE_TRACKER.md`

---

## 2. Local Setup & Commands (PowerShell)

```powershell
cd E:\prog\hexfactory

# Create & activate Python virtual environment (first time / per shell)
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# Install Node dependencies & run local dev server
npm install
npm run dev

# Typecheck & production build
npx tsc --noEmit
npm run build
```

---

## 3. Architecture & Coding Rules

### Strict Headless / Renderer Separation
- **`src/core/` (Headless Engine):** Pure TypeScript game state, graph math, economy, and combat. **Never import `phaser` inside `src/core/`.**
- **`src/scenes/` & `src/ui/` (Phaser Layer):** Rendering, procedural textures, touch input, animations, and native Phaser UI containers. **No external UI libraries (React, DOM HUDs, etc.).**

### Directory Layout
```text
src/
├── main.ts                  # Phaser Game config (390x844, FIT, CENTER_BOTH, touch capture)
├── core/
│   ├── types.ts             # Hex, Vertex, Edge, Building, Unit, Enemy, TurnPhase, GameState
│   ├── constants.ts         # Exact costs, turret stats, smelting recipes, 12-turn wave curve
│   ├── HexBoardGraph.ts     # Axial radius-2 board (19 hexes, 54 vertices, 72 edges) & start state
│   ├── EconomyEngine.ts     # 2d6 / Magnetic Bias, harvesting, weighted BFS conveyors, smelting
│   └── CombatEngine.ts      # Spawning, marching, 2->1->0 range firing, crit/jam, overclock boom
├── scenes/
│   ├── BootScene.ts         # Procedural Graphics.generateTexture assets
│   ├── GameScene.ts         # Hex board rendering, 18px vertex / 16px edge hit-testing, VFX
│   └── UIScene.ts           # Top HUD, resource bar, phase tracker, modals, panel host
└── ui/
    ├── BuildDrawer.ts       # Mobile bottom-sheet for vertex buildings, edge conveyors, overclock
    └── DiceOverlay.ts       # Animated 2d6/3d6 tray + Magnetic Bias toggles
```

---

## 4. Core Mathematical & Gameplay Invariants
- **Board Topology:** Exactly `19` hexes (axial radius 2, center `(0,0)` always Desert), `54` deduplicated vertices, `72` deduplicated edges, centered in upper 65% (`x: 195, y: 330`).
- **Terrain Pool:** 4 Forest (Timber), 3 Hills (Clay), 3 Mountains (Ore), 4 Fields (Grain), 4 Pasture (Aether), 1 Center Desert.
- **Dice Tokens:** `{2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12}` (`6` and `8` highlighted crimson).
- **Turn State Machine (12 Turns):** `ROLL_AND_HARVEST` → `LOGISTICS_AND_SMELT` → `BUILD_AND_GAMBLE` → `WAVE_COMBAT` → next turn (or `GAME_OVER`).
- **Catan Distance Rule:** Harvester Nodes and Drill Rigs cannot be placed on vertices adjacent to another Harvester/Drill Rig (upgrading an existing Harvester → Drill Rig on the same vertex is allowed).
- **Conveyors:** Mk.I (`2 items/turn`, max `3` edges); Mk.II (`5 items/turn`, max `6` edges).
- **Smelting Recipes:**
  - `Brick` = 1 Clay + 1 Timber (`Smelter / Kiln`)
  - `Steel` = 2 Ore + 1 Timber (`Smelter / Kiln`)
  - `Power Cell` = 1 Aether + 1 Grain (`Aether Reactor`)
  - `Silicon` = 2 Ore + 1 Aether (`Arc Furnace`)
- **Combat Formula:** `Damage = max(1, floor((ATK * M_crit) - Armor * (1 - Pierce)))` with per-attack 1d6 (`1` = `0.75x` Jam, `2-5` = `1.0x`, `6` = `1.5x` Overcharge Crit). Turrets fire strictly in range order `2 → 1 → 0`.
- **Overclock Gamble:** `+100%` output/fire rate; end-of-turn `k/6` roll deals `50` damage to self and adjacent vertices/enemies on explosion.

---

## 5. Agent Workflow Guidelines
1. Always verify `npx tsc --noEmit` and `npm run build` before committing changes.
2. Preserve `19 / 54 / 72` topology invariants when modifying `HexBoardGraph.ts`.
3. Log newly discovered bugs in `BUG_TRACKER.md` and update status in `FEATURE_TRACKER.md` as features are added.

# HexFactory — Bug Tracker

Track active defects, reproduction steps, severity, and fixes here.

## Legend
- **Severity:** `P0` (Blocker/Crash) · `P1` (Gameplay/Logic Bug) · `P2` (UI/UX Polish) · `P3` (Minor)
- **Status:** `Open` · `In Progress` · `Resolved` · `Won't Fix`

---

## Active Bugs

| ID | Severity | Status | Component | Summary | Repro / Notes |
| :--- | :---: | :---: | :--- | :--- | :--- |
| *(none)* | — | — | — | No open bugs currently logged. | Add new entries below as `BUG-003`, `BUG-004`, etc. |

---

## Resolved Bugs

| ID | Severity | Status | Component | Summary | Resolution |
| :--- | :---: | :---: | :--- | :--- | :--- |
| `BUG-001` | `P1` | `Resolved` | `GameScene.ts` / `DiceOverlay.ts` | Phase transition timers stalled on low-FPS / software WebGL renderers due to clamped Phaser clock deltas. | Switched phase orchestration timers to wall-clock `setTimeout` / `setInterval` with cleanup on restart and scene shutdown. |
| `BUG-002` | `P2` | `Resolved` | `UIScene.ts` | Active phase pill (`BLD` / `ROLL`) lagged one sync cycle behind animation completion. | Cleared transient `showingLogistics` / `showingCombat` flags before computing `visualPhase` inside `UIScene.syncUI()`. |

---

## Bug Report Template

```markdown
| `BUG-XXX` | `P1` | `Open` | `File.ts` | Short description | Turn/phase, steps to reproduce, expected vs actual |
```

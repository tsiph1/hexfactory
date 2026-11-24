import {
  BUILDING_SPECS,
  ENEMY_SPECS,
  OVERCLOCK_EXPLOSION_DAMAGE,
  WAVE_CURVE,
} from './constants';
import {
  getShortestVertexPath,
  getVertexDistances,
  shuffle,
} from './HexBoardGraph';
import type {
  CombatEvent,
  CombatResult,
  Enemy,
  GameState,
  Vertex,
} from './types';

function roll1d6(rng: () => number): number {
  return Math.floor(rng() * 6) + 1;
}

export function getCritMultiplier(roll: number): {
  multiplier: number;
  critState: 'jam' | 'normal' | 'crit';
} {
  if (roll === 1) return { multiplier: 0.75, critState: 'jam' };
  if (roll === 6) return { multiplier: 1.5, critState: 'crit' };
  return { multiplier: 1.0, critState: 'normal' };
}

/**
 * Exact combat damage formula:
 * Damage = max(1, floor((ATK * M_crit) - Armor * (1 - Pierce)))
 */
export function calculateDamage(
  atk: number,
  critMultiplier: number,
  armor: number,
  pierce: number
): number {
  const effectiveArmor = armor * (1 - pierce);
  return Math.max(1, Math.floor(atk * critMultiplier - effectiveArmor));
}

/**
 * Phase 4: Wave spawning, enemy march (1 edge/turn toward Core),
 * turret firing in strict range order (2 -> 1 -> 0) with 1d6 crit/jam & armor pierce,
 * enemy attacks, and end-of-turn Overclock k/6 explosion checks.
 */
export function executeWaveCombat(
  state: GameState,
  rng: () => number = Math.random
): CombatResult {
  const events: CombatEvent[] = [];
  let enemiesSpawned = 0;
  let enemiesKilled = 0;
  let bossesKilled = 0;
  let coreDamageTaken = 0;

  // 1. Spawn current turn's wave on outer coastal vertices
  const waveDef = WAVE_CURVE.find((w) => w.turn === state.turn);
  if (waveDef && waveDef.entries.length > 0) {
    const coastalVertices = Array.from(state.vertices.values()).filter(
      (v) => v.isCoastal && v.id !== state.coreVertexId
    );
    const shuffledCoastal = shuffle(coastalVertices, rng);
    let spawnCursor = 0;

    for (const entry of waveDef.entries) {
      const spec = ENEMY_SPECS[entry.type];
      for (let i = 0; i < entry.count; i++) {
        // Prefer unoccupied coastal vertex, wrapping around if wave is large
        const spawnVertex =
          shuffledCoastal[spawnCursor % shuffledCoastal.length];
        spawnCursor++;

        const enemy: Enemy = {
          id: `en_${state.nextEntityId++}`,
          type: entry.type,
          name: spec.name,
          vertexId: spawnVertex.id,
          hp: spec.maxHp,
          maxHp: spec.maxHp,
          armor: spec.armor,
          atk: spec.atk,
          isBoss: spec.isBoss,
          spawnedTurn: state.turn,
        };
        state.enemies.push(enemy);
        enemiesSpawned++;

        events.push({
          kind: 'spawn',
          enemyId: enemy.id,
          enemyType: enemy.type,
          enemyName: enemy.name,
          vertexId: spawnVertex.id,
          isBoss: enemy.isBoss,
        });
      }
    }
  }

  // 2. Enemy Movement: march 1 edge/turn along shortest path toward Core
  // Barricades block enemy entry onto their vertex until destroyed.
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) continue;
    if (enemy.vertexId === state.coreVertexId) continue;

    // If standing on a non-barricade building (e.g. Scorch / Harvester), hold to attack it if not Core
    const currVertex = state.vertices.get(enemy.vertexId);
    if (
      currVertex?.building &&
      currVertex.building.type !== 'core' &&
      enemy.spawnedTurn < state.turn
    ) {
      // Enemy engages building on its current tile rather than ignoring it
      continue;
    }

    const path = getShortestVertexPath(
      state.vertices,
      enemy.vertexId,
      state.coreVertexId
    );
    if (!path || path.length < 2) continue;

    const nextVertexId = path[1];
    const nextVertex = state.vertices.get(nextVertexId);
    if (
      nextVertex?.building &&
      BUILDING_SPECS[nextVertex.building.type].blocksMovement
    ) {
      // Blocked by Barricade — will strike it during Enemy Attack phase
      continue;
    }

    const fromVertexId = enemy.vertexId;
    enemy.vertexId = nextVertexId;
    events.push({
      kind: 'move',
      enemyId: enemy.id,
      fromVertexId,
      toVertexId: nextVertexId,
    });
  }

  // 3. Turret Firing in strict Range Order: 2 -> 1 -> 0
  const distToCore = getVertexDistances(state.vertices, state.coreVertexId);
  const turretVertices: Vertex[] = [];
  for (const v of state.vertices.values()) {
    if (!v.building) continue;
    const spec = BUILDING_SPECS[v.building.type];
    if (spec.atk !== undefined && spec.range !== undefined) {
      turretVertices.push(v);
    }
  }

  for (const activeRange of [2, 1, 0]) {
    const turretsAtRange = turretVertices.filter(
      (v) =>
        v.building && BUILDING_SPECS[v.building.type].range === activeRange
    );

    for (const turretVertex of turretsAtRange) {
      const building = turretVertex.building;
      if (!building || building.hp <= 0) continue;
      const spec = BUILDING_SPECS[building.type];
      const atk = spec.atk!;
      const pierce = spec.pierce ?? 0;
      const shotsPerVolley = spec.shots ?? 1;
      const volleys = building.isOverclocked ? 2 : 1;

      const distFromTurret = getVertexDistances(
        state.vertices,
        turretVertex.id
      );

      for (let vIdx = 0; vIdx < volleys; vIdx++) {
        for (let sIdx = 0; sIdx < shotsPerVolley; sIdx++) {
          const aliveInRange = state.enemies.filter((e) => {
            if (e.hp <= 0) return false;
            const d = distFromTurret.get(e.vertexId);
            return d !== undefined && d <= activeRange;
          });

          if (aliveInRange.length === 0) break;

          // Prioritize enemy closest to the Core (tie-break: boss, then lowest HP)
          aliveInRange.sort((a, b) => {
            const dA = distToCore.get(a.vertexId) ?? 99;
            const dB = distToCore.get(b.vertexId) ?? 99;
            if (dA !== dB) return dA - dB;
            if (a.isBoss !== b.isBoss) return a.isBoss ? -1 : 1;
            return a.hp - b.hp;
          });

          const primaryTarget = aliveInRange[0];
          let targetsToHit: Enemy[] = [];
          let lineVertexIds: string[] | undefined;

          if (spec.isLine) {
            // Lancer: Range 2 piercing line along shortest path from turret to target (extended to dist 2 if length 1)
            const rawPath = getShortestVertexPath(
              state.vertices,
              turretVertex.id,
              primaryTarget.vertexId
            ) ?? [turretVertex.id, primaryTarget.vertexId];

            const lineSet = new Set<string>(rawPath.slice(1));
            // If primary target was at distance 1, extend beam 1 hop further in the same geometric direction
            if (rawPath.length === 2) {
              const v0 = state.vertices.get(turretVertex.id)!;
              const v1 = state.vertices.get(rawPath[1])!;
              const dx = v1.x - v0.x;
              const dy = v1.y - v0.y;
              let bestExt: string | null = null;
              let bestDot = -Infinity;
              for (const candId of v1.adjacentVertices) {
                if (candId === turretVertex.id) continue;
                const vc = state.vertices.get(candId)!;
                const dot = (vc.x - v1.x) * dx + (vc.y - v1.y) * dy;
                if (dot > bestDot) {
                  bestDot = dot;
                  bestExt = candId;
                }
              }
              if (bestExt) {
                lineSet.add(bestExt);
                rawPath.push(bestExt);
              }
            }
            lineVertexIds = rawPath;
            targetsToHit = state.enemies.filter(
              (e) => e.hp > 0 && lineSet.has(e.vertexId)
            );
          } else if (spec.isAoE) {
            // Scorch (Rng 0 AoE) & Meltdown (Rng 2 AoE): hit all enemies at target vertex
            targetsToHit = state.enemies.filter(
              (e) => e.hp > 0 && e.vertexId === primaryTarget.vertexId
            );
          } else {
            // Single target (Duo Turret)
            targetsToHit = [primaryTarget];
          }

          const hits: Array<{
            enemyId: string;
            enemyVertexId: string;
            roll1d6: number;
            multiplier: number;
            critState: 'jam' | 'normal' | 'crit';
            damage: number;
            killed: boolean;
          }> = [];

          for (const target of targetsToHit) {
            const roll = roll1d6(rng);
            const { multiplier, critState } = getCritMultiplier(roll);
            const damage = calculateDamage(
              atk,
              multiplier,
              target.armor,
              pierce
            );
            target.hp = Math.max(0, target.hp - damage);
            const killed = target.hp <= 0;
            if (killed) {
              enemiesKilled++;
              state.stats.enemiesKilled++;
              if (target.isBoss) {
                bossesKilled++;
                state.stats.bossesKilled++;
              }
            }
            hits.push({
              enemyId: target.id,
              enemyVertexId: target.vertexId,
              roll1d6: roll,
              multiplier,
              critState,
              damage,
              killed,
            });
          }

          events.push({
            kind: 'turret_fire',
            turretVertexId: turretVertex.id,
            turretType: building.type,
            range: activeRange,
            targetVertexId: primaryTarget.vertexId,
            lineVertexIds,
            isAoE: Boolean(spec.isAoE),
            isLine: Boolean(spec.isLine),
            hits,
          });
        }
      }
    }
  }

  // Prune dead enemies
  state.enemies = state.enemies.filter((e) => e.hp > 0);

  // 4. Surviving Enemy Attacks
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) continue;

    let targetVertex: Vertex | null = null;
    const currVertex = state.vertices.get(enemy.vertexId)!;

    if (currVertex.building && currVertex.building.hp > 0) {
      targetVertex = currVertex;
    } else {
      // Check if blocked by an adjacent Barricade on path to Core
      const path = getShortestVertexPath(
        state.vertices,
        enemy.vertexId,
        state.coreVertexId
      );
      if (path && path.length >= 2) {
        const nextV = state.vertices.get(path[1]);
        if (
          nextV?.building &&
          nextV.building.hp > 0 &&
          BUILDING_SPECS[nextV.building.type].blocksMovement
        ) {
          targetVertex = nextV;
        }
      }
    }

    if (!targetVertex || !targetVertex.building) continue;

    const b = targetVertex.building;
    const dmg = enemy.atk;
    b.hp = Math.max(0, b.hp - dmg);
    const destroyed = b.hp <= 0;

    if (b.type === 'core') {
      coreDamageTaken += dmg;
    } else if (destroyed) {
      targetVertex.building = null;
      targetVertex.buffer = {};
    }

    events.push({
      kind: 'enemy_attack',
      enemyId: enemy.id,
      enemyVertexId: enemy.vertexId,
      targetVertexId: targetVertex.id,
      targetBuildingType: b.type,
      damage: dmg,
      destroyed,
    });
  }

  // 5. Overclock End-of-Turn Gamble (k/6 explosion roll dealing 50 self + adjacent DMG)
  for (const vertex of state.vertices.values()) {
    const b = vertex.building;
    if (!b || !b.isOverclocked) continue;

    const k = Math.max(1, b.overclockHeat);
    const roll = roll1d6(rng);
    const exploded = roll <= k;
    const affectedVertexIds: string[] = [];

    if (exploded) {
      state.stats.overclockExplosions++;
      affectedVertexIds.push(vertex.id, ...vertex.adjacentVertices);

      for (const vid of affectedVertexIds) {
        const v = state.vertices.get(vid);
        if (!v) continue;

        // Damage building on affected vertex
        if (v.building) {
          v.building.hp = Math.max(
            0,
            v.building.hp - OVERCLOCK_EXPLOSION_DAMAGE
          );
          if (v.building.type === 'core') {
            coreDamageTaken += OVERCLOCK_EXPLOSION_DAMAGE;
          } else if (v.building.hp <= 0) {
            v.building = null;
            v.buffer = {};
          }
        }

        // Also blast enemies standing on self/adjacent vertices!
        for (const e of state.enemies) {
          if (e.hp > 0 && e.vertexId === vid) {
            e.hp = Math.max(0, e.hp - OVERCLOCK_EXPLOSION_DAMAGE);
            if (e.hp <= 0) {
              enemiesKilled++;
              state.stats.enemiesKilled++;
              if (e.isBoss) {
                bossesKilled++;
                state.stats.bossesKilled++;
              }
            }
          }
        }
      }

      if (vertex.building) {
        vertex.building.isOverclocked = false;
        vertex.building.overclockHeat = 0;
      }
    } else {
      b.overclockHeat = Math.min(5, k + 1);
    }

    events.push({
      kind: 'overclock_roll',
      vertexId: vertex.id,
      buildingType: b.type,
      roll1d6: roll,
      thresholdK: k,
      exploded,
      affectedVertexIds,
      damage: exploded ? OVERCLOCK_EXPLOSION_DAMAGE : 0,
    });
  }

  // Prune any enemies killed by overclock blasts
  state.enemies = state.enemies.filter((e) => e.hp > 0);

  // 6. Determine Win / Defeat / Next Turn transition
  const coreBuilding = state.vertices.get(state.coreVertexId)?.building;
  const coreHpAfter = coreBuilding ? coreBuilding.hp : 0;

  let outcome: 'ongoing' | 'victory' | 'defeat' = 'ongoing';
  if (coreHpAfter <= 0) {
    outcome = 'defeat';
    state.status = 'defeat';
    state.phase = 'GAME_OVER';
  } else if (state.turn >= state.maxTurns) {
    outcome = 'victory';
    state.status = 'victory';
    state.phase = 'GAME_OVER';
  } else {
    state.turn += 1;
    state.phase = 'ROLL_AND_HARVEST';
  }

  const result: CombatResult = {
    events,
    enemiesSpawned,
    enemiesKilled,
    bossesKilled,
    coreDamageTaken,
    coreHpAfter,
    outcome,
  };

  state.lastCombat = result;
  return result;
}

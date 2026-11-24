import {
  BUILDING_SPECS,
  CONVEYOR_SPECS,
  REPAIR_AMOUNT,
  REPAIR_COST,
  SMELT_RECIPES,
} from './constants';
import { getEdgeBetween, violatesCatanDistanceRule } from './HexBoardGraph';
import type {
  BuildingType,
  ConveyorType,
  DiceRollResult,
  GameState,
  HarvestEvent,
  LogisticsResult,
  MagneticBiasMode,
  PacketAnimation,
  ResourceCost,
  ResourceInventory,
  ResourceType,
  SmeltEvent,
} from './types';

export function canAfford(
  inventory: ResourceInventory,
  cost: ResourceCost
): boolean {
  for (const [res, amt] of Object.entries(cost) as Array<
    [ResourceType, number]
  >) {
    if ((inventory[res] ?? 0) < amt) return false;
  }
  return true;
}

export function spendResources(
  inventory: ResourceInventory,
  cost: ResourceCost
): void {
  for (const [res, amt] of Object.entries(cost) as Array<
    [ResourceType, number]
  >) {
    inventory[res] = Math.max(0, (inventory[res] ?? 0) - amt);
  }
}

export function addResource(
  inventory: ResourceInventory,
  resource: ResourceType,
  amount: number
): void {
  inventory[resource] = (inventory[resource] ?? 0) + amount;
}

export interface BuildCheckResult {
  allowed: boolean;
  reason?: string;
}

export function canBuildOnVertex(
  state: GameState,
  vertexId: string,
  buildingType: BuildingType
): BuildCheckResult {
  if (state.phase !== 'BUILD_AND_GAMBLE') {
    return { allowed: false, reason: 'Only during Build Phase' };
  }
  if (buildingType === 'core') {
    return { allowed: false, reason: 'Cannot build Core' };
  }
  const vertex = state.vertices.get(vertexId);
  if (!vertex) return { allowed: false, reason: 'Invalid vertex' };

  const spec = BUILDING_SPECS[buildingType];

  // Check upgrade case (Harvester -> Drill Rig)
  if (vertex.building) {
    if (spec.upgradesFrom && vertex.building.type === spec.upgradesFrom) {
      if (!canAfford(state.resources, spec.cost)) {
        return { allowed: false, reason: 'Insufficient resources' };
      }
      return { allowed: true };
    }
    return { allowed: false, reason: 'Vertex occupied' };
  }

  // Enforce Catan distance rule for Harvester Node & Drill Rig
  if (
    spec.enforcesDistanceRule &&
    violatesCatanDistanceRule(state.vertices, vertexId)
  ) {
    return {
      allowed: false,
      reason: 'Distance rule: adj. Harvester/Rig',
    };
  }

  if (!canAfford(state.resources, spec.cost)) {
    return { allowed: false, reason: 'Insufficient resources' };
  }

  return { allowed: true };
}

export function buildOnVertex(
  state: GameState,
  vertexId: string,
  buildingType: BuildingType
): boolean {
  const check = canBuildOnVertex(state, vertexId, buildingType);
  if (!check.allowed) return false;

  const vertex = state.vertices.get(vertexId)!;
  const spec = BUILDING_SPECS[buildingType];
  spendResources(state.resources, spec.cost);

  const wasOverclocked = vertex.building?.isOverclocked ?? false;
  const prevHeat = vertex.building?.overclockHeat ?? 0;

  vertex.building = {
    id: `b_${state.nextEntityId++}`,
    type: buildingType,
    category: spec.category,
    vertexId,
    hp: spec.maxHp,
    maxHp: spec.maxHp,
    isOverclocked: spec.canOverclock ? wasOverclocked : false,
    overclockHeat: spec.canOverclock ? prevHeat : 0,
  };
  state.stats.buildingsConstructed += 1;
  return true;
}

export function canBuildOnEdge(
  state: GameState,
  edgeId: string,
  conveyorType: ConveyorType
): BuildCheckResult {
  if (state.phase !== 'BUILD_AND_GAMBLE') {
    return { allowed: false, reason: 'Only during Build Phase' };
  }
  const edge = state.edges.get(edgeId);
  if (!edge) return { allowed: false, reason: 'Invalid edge' };

  if (edge.conveyor === conveyorType) {
    return { allowed: false, reason: 'Already built' };
  }
  if (edge.conveyor === 'conveyor_mk2' && conveyorType === 'conveyor_mk1') {
    return { allowed: false, reason: 'Already Mk.II' };
  }

  const spec = CONVEYOR_SPECS[conveyorType];
  if (!canAfford(state.resources, spec.cost)) {
    return { allowed: false, reason: 'Insufficient resources' };
  }

  return { allowed: true };
}

export function buildOnEdge(
  state: GameState,
  edgeId: string,
  conveyorType: ConveyorType
): boolean {
  const check = canBuildOnEdge(state, edgeId, conveyorType);
  if (!check.allowed) return false;

  const edge = state.edges.get(edgeId)!;
  const spec = CONVEYOR_SPECS[conveyorType];
  spendResources(state.resources, spec.cost);
  edge.conveyor = conveyorType;
  state.stats.conveyorsBuilt += 1;
  return true;
}

export function toggleOverclock(state: GameState, vertexId: string): boolean {
  if (state.phase !== 'BUILD_AND_GAMBLE') return false;
  const vertex = state.vertices.get(vertexId);
  if (!vertex?.building) return false;
  const spec = BUILDING_SPECS[vertex.building.type];
  if (!spec.canOverclock) return false;

  vertex.building.isOverclocked = !vertex.building.isOverclocked;
  if (vertex.building.isOverclocked) {
    vertex.building.overclockHeat = Math.max(1, vertex.building.overclockHeat);
  } else {
    vertex.building.overclockHeat = 0;
  }
  return true;
}

export function canRepairBuilding(
  state: GameState,
  vertexId: string
): BuildCheckResult {
  if (state.phase !== 'BUILD_AND_GAMBLE') {
    return { allowed: false, reason: 'Only during Build Phase' };
  }
  const v = state.vertices.get(vertexId);
  if (!v?.building) return { allowed: false, reason: 'No building' };
  if (v.building.hp >= v.building.maxHp) {
    return { allowed: false, reason: 'Full HP' };
  }
  if (!canAfford(state.resources, REPAIR_COST)) {
    return { allowed: false, reason: 'Need 1 Brick' };
  }
  return { allowed: true };
}

export function repairBuilding(state: GameState, vertexId: string): boolean {
  const check = canRepairBuilding(state, vertexId);
  if (!check.allowed) return false;
  const v = state.vertices.get(vertexId)!;
  spendResources(state.resources, REPAIR_COST);
  v.building!.hp = Math.min(v.building!.maxHp, v.building!.hp + REPAIR_AMOUNT);
  return true;
}

export function demolishBuilding(state: GameState, vertexId: string): boolean {
  if (state.phase !== 'BUILD_AND_GAMBLE') return false;
  const v = state.vertices.get(vertexId);
  if (!v?.building || v.building.type === 'core') return false;

  // Refund 50% rounded down of build cost
  const spec = BUILDING_SPECS[v.building.type];
  for (const [res, amt] of Object.entries(spec.cost) as Array<
    [ResourceType, number]
  >) {
    const refund = Math.floor(amt / 2);
    if (refund > 0) addResource(state.resources, res, refund);
  }
  v.building = null;
  v.buffer = {};
  return true;
}

function rollDie(rng: () => number): number {
  return Math.floor(rng() * 6) + 1;
}

/**
 * Phase 1: Roll 2d6 (or 3d6 drop mismatched parity with Magnetic Bias for 1 Power Cell)
 * and harvest matching hexes into adjacent Harvester Nodes / Drill Rigs.
 */
export function executeRollAndHarvest(
  state: GameState,
  biasMode: MagneticBiasMode = 'none',
  rng: () => number = Math.random
): DiceRollResult {
  let activeBias: MagneticBiasMode = biasMode;
  if (activeBias !== 'none') {
    if (state.resources.powerCell >= 1) {
      state.resources.powerCell -= 1;
    } else {
      activeBias = 'none';
    }
  }

  let rawDice: number[];
  let keptDice: [number, number];
  let droppedIndex: number | null = null;

  if (activeBias === 'none') {
    const d1 = rollDie(rng);
    const d2 = rollDie(rng);
    rawDice = [d1, d2];
    keptDice = [d1, d2];
  } else {
    const d0 = rollDie(rng);
    const d1 = rollDie(rng);
    const d2 = rollDie(rng);
    rawDice = [d0, d1, d2];

    const wantEven = activeBias === 'even';
    // Try all 3 pairs; prefer a pair matching desired parity and closest to high-probability 6/8
    const pairs: Array<{ keep: [number, number]; dropIdx: number; sum: number }> = [
      { keep: [d0, d1], dropIdx: 2, sum: d0 + d1 },
      { keep: [d0, d2], dropIdx: 1, sum: d0 + d2 },
      { keep: [d1, d2], dropIdx: 0, sum: d1 + d2 },
    ];

    const matchingPairs = pairs.filter((p) => (p.sum % 2 === 0) === wantEven);
    const candidates = matchingPairs.length > 0 ? matchingPairs : pairs;

    // Score candidate pairs by how many hexes with player harvesters they activate, else closeness to 7
    const scoreSum = (sum: number): number => {
      let harvesterHits = 0;
      for (const hex of state.hexes.values()) {
        if (hex.diceNumber !== sum || !hex.resource) continue;
        for (const vid of hex.vertexIds) {
          const b = state.vertices.get(vid)?.building;
          if (b && (b.type === 'harvester' || b.type === 'drill_rig')) {
            harvesterHits++;
          }
        }
      }
      return harvesterHits * 10 - Math.abs(sum - 7);
    };

    candidates.sort((a, b) => scoreSum(b.sum) - scoreSum(a.sum));
    const chosen = candidates[0];
    keptDice = chosen.keep;
    droppedIndex = chosen.dropIdx;
  }

  const total = keptDice[0] + keptDice[1];
  const harvestEvents: HarvestEvent[] = [];

  if (total === 7) {
    // 7 = Core Siphon: Core draws +1 from each adjacent non-desert resource hex
    const coreVertex = state.vertices.get(state.coreVertexId)!;
    for (const hid of coreVertex.adjacentHexes) {
      const hex = state.hexes.get(hid);
      if (!hex || !hex.resource) continue;
      addResource(state.resources, hex.resource, 1);
      state.stats.totalHarvested += 1;
      harvestEvents.push({
        hexId: hex.id,
        vertexId: state.coreVertexId,
        resource: hex.resource,
        amount: 1,
        isOverclocked: false,
        isCoreSiphon: true,
      });
    }
  } else {
    // Standard harvest on matching hexes for all adjacent Harvester Nodes & Drill Rigs
    for (const hex of state.hexes.values()) {
      if (hex.diceNumber !== total || !hex.resource) continue;
      for (const vid of hex.vertexIds) {
        const vertex = state.vertices.get(vid)!;
        const b = vertex.building;
        if (!b || (b.type !== 'harvester' && b.type !== 'drill_rig')) continue;

        const baseYield = BUILDING_SPECS[b.type].harvestYield ?? 1;
        const amount = baseYield * (b.isOverclocked ? 2 : 1);
        vertex.buffer[hex.resource] = (vertex.buffer[hex.resource] ?? 0) + amount;
        state.stats.totalHarvested += amount;

        harvestEvents.push({
          hexId: hex.id,
          vertexId: vid,
          resource: hex.resource,
          amount,
          isOverclocked: b.isOverclocked,
        });
      }
    }
  }

  const result: DiceRollResult = {
    rawDice,
    keptDice,
    droppedIndex,
    total,
    biasUsed: activeBias,
    harvestEvents,
  };

  state.lastRoll = result;
  state.phase = 'LOGISTICS_AND_SMELT';
  return result;
}

interface ConveyorPathResult {
  vertexIds: string[];
  edgeIds: string[];
  minRemainingCapacity: number;
}

/**
 * Weighted BFS finding shortest valid conveyor path from `startId` to `goalId`.
 * Mk.I edges contribute 1/3 range weight (max 3 edges), Mk.II contribute 1/6 (max 6 edges).
 */
export function findConveyorPath(
  state: GameState,
  startId: string,
  goalId: string,
  edgeRemainingCap?: Map<string, number>
): ConveyorPathResult | null {
  if (startId === goalId) {
    return { vertexIds: [startId], edgeIds: [], minRemainingCapacity: Infinity };
  }

  interface QueueNode {
    vertexId: string;
    normDist: number;
    pathVertices: string[];
    pathEdges: string[];
    minCap: number;
  }

  const bestNormDist = new Map<string, number>();
  bestNormDist.set(startId, 0);

  const queue: QueueNode[] = [
    {
      vertexId: startId,
      normDist: 0,
      pathVertices: [startId],
      pathEdges: [],
      minCap: Infinity,
    },
  ];

  while (queue.length > 0) {
    // Dijkstra-style pop smallest normDist so shortest valid path wins
    queue.sort((a, b) => a.normDist - b.normDist);
    const curr = queue.shift()!;

    if (curr.vertexId === goalId) {
      return {
        vertexIds: curr.pathVertices,
        edgeIds: curr.pathEdges,
        minRemainingCapacity: curr.minCap,
      };
    }

    const v = state.vertices.get(curr.vertexId);
    if (!v) continue;

    for (const nextId of v.adjacentVertices) {
      const edge = getEdgeBetween(state.edges, curr.vertexId, nextId);
      if (!edge || !edge.conveyor) continue;

      const cap = edgeRemainingCap
        ? (edgeRemainingCap.get(edge.id) ?? 0)
        : CONVEYOR_SPECS[edge.conveyor].capacityPerTurn;
      if (cap <= 0) continue;

      const stepCost = 1 / CONVEYOR_SPECS[edge.conveyor].maxRangeEdges;
      const nextDist = curr.normDist + stepCost;
      if (nextDist > 1.0001) continue;

      const known = bestNormDist.get(nextId);
      if (known !== undefined && known <= nextDist + 1e-6) continue;

      bestNormDist.set(nextId, nextDist);
      queue.push({
        vertexId: nextId,
        normDist: nextDist,
        pathVertices: [...curr.pathVertices, nextId],
        pathEdges: [...curr.pathEdges, edge.id],
        minCap: Math.min(curr.minCap, cap),
      });
    }
  }

  return null;
}

/**
 * Phase 2: Route buffered resources along conveyors (respecting Mk.I/Mk.II throughput & range)
 * and automatically run refinement recipes on connected Smelters/Kilns/Reactors/Arc Furnaces.
 */
export function executeLogisticsAndSmelt(state: GameState): LogisticsResult {
  const edgeRemainingCap = new Map<string, number>();
  for (const edge of state.edges.values()) {
    if (edge.conveyor) {
      edgeRemainingCap.set(
        edge.id,
        CONVEYOR_SPECS[edge.conveyor].capacityPerTurn
      );
    }
  }

  const packets: PacketAnimation[] = [];
  const smelts: SmeltEvent[] = [];
  const deliveredToCore: Partial<Record<ResourceType, number>> = {};
  const strandedVertexIds: string[] = [];

  // 1. Route buffered raw resources from Harvester Nodes / Drill Rigs -> Core
  for (const vertex of state.vertices.values()) {
    const bufferEntries = Object.entries(vertex.buffer).filter(
      ([, amt]) => (amt ?? 0) > 0
    ) as Array<[ResourceType, number]>;
    if (bufferEntries.length === 0) continue;

    let anyStranded = false;

    for (const [res, qty] of bufferEntries) {
      let remaining = qty;
      while (remaining > 0) {
        const path = findConveyorPath(
          state,
          vertex.id,
          state.coreVertexId,
          edgeRemainingCap
        );
        if (!path || path.minRemainingCapacity <= 0) {
          anyStranded = true;
          break;
        }

        const sendAmt = Math.min(remaining, path.minRemainingCapacity);
        for (let i = 0; i < path.edgeIds.length; i++) {
          const eid = path.edgeIds[i];
          edgeRemainingCap.set(eid, (edgeRemainingCap.get(eid) ?? 0) - sendAmt);
          const edge = state.edges.get(eid);
          if (edge) {
            edge.flowDirection = [path.vertexIds[i], path.vertexIds[i + 1]];
          }
        }

        addResource(state.resources, res, sendAmt);
        deliveredToCore[res] = (deliveredToCore[res] ?? 0) + sendAmt;
        remaining -= sendAmt;

        packets.push({
          resource: res,
          pathVertexIds: path.vertexIds,
          pathEdgeIds: path.edgeIds,
          amount: sendAmt,
          fromVertexId: vertex.id,
          toVertexId: state.coreVertexId,
        });
      }

      if (remaining <= 0) {
        delete vertex.buffer[res];
      } else {
        vertex.buffer[res] = remaining;
      }
    }

    if (anyStranded) {
      strandedVertexIds.push(vertex.id);
    }
  }

  // 2. Run automatic smelting / refining recipes at connected processors
  for (const vertex of state.vertices.values()) {
    const b = vertex.building;
    if (!b) continue;
    const recipes = SMELT_RECIPES.filter((r) => r.buildingType === b.type);
    if (recipes.length === 0) continue;

    // Must be linked to Core via conveyor chain within conveyor range
    const beltPath = findConveyorPath(state, vertex.id, state.coreVertexId);
    if (!beltPath) {
      strandedVertexIds.push(vertex.id);
      continue;
    }

    const cycles = b.isOverclocked ? 2 : 1;

    for (let c = 0; c < cycles; c++) {
      for (const recipe of recipes) {
        if (!canAfford(state.resources, recipe.inputs)) continue;

        spendResources(state.resources, recipe.inputs);
        addResource(state.resources, recipe.output, recipe.outputAmount);
        deliveredToCore[recipe.output] =
          (deliveredToCore[recipe.output] ?? 0) + recipe.outputAmount;
        state.stats.totalSmelted += recipe.outputAmount;

        // Update flow direction along output belt
        for (let i = 0; i < beltPath.edgeIds.length; i++) {
          const edge = state.edges.get(beltPath.edgeIds[i]);
          if (edge) {
            edge.flowDirection = [
              beltPath.vertexIds[i],
              beltPath.vertexIds[i + 1],
            ];
          }
        }

        smelts.push({
          vertexId: vertex.id,
          buildingType: b.type,
          recipeId: recipe.id,
          outputResource: recipe.output,
          amount: recipe.outputAmount,
          inputsConsumed: { ...recipe.inputs },
        });

        packets.push({
          resource: recipe.output,
          pathVertexIds: beltPath.vertexIds,
          pathEdgeIds: beltPath.edgeIds,
          amount: recipe.outputAmount,
          fromVertexId: vertex.id,
          toVertexId: state.coreVertexId,
        });
      }
    }
  }

  const result: LogisticsResult = {
    packets,
    smelts,
    deliveredToCore,
    strandedVertexIds,
  };

  state.lastLogistics = result;
  state.phase = 'BUILD_AND_GAMBLE';
  return result;
}

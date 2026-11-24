import {
  BOARD_AXIAL_RADIUS,
  BOARD_CENTER_X,
  BOARD_CENTER_Y,
  BUILDING_SPECS,
  CATAN_DICE_TOKENS,
  DICE_PROBABILITIES,
  HEX_RADIUS,
  MAX_TURNS,
  STARTING_RESOURCES,
  TERRAIN_META,
  TERRAIN_POOL,
} from './constants';
import type {
  Edge,
  GameState,
  Hex,
  TerrainType,
  Vertex,
} from './types';

export interface BoardGraph {
  hexes: Map<string, Hex>;
  vertices: Map<string, Vertex>;
  edges: Map<string, Edge>;
}

/** Deterministic Fisher-Yates shuffle using injectable rng */
export function shuffle<T>(items: T[], rng: () => number = Math.random): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Rounded coordinate key for deduplicating shared hex corners.
 * Using 0.5px-shifted integer rounding guarantees floating-point jitter near .5
 * never splits two identical hex vertices (minimum real spacing is HEX_RADIUS = 40px).
 */
export function vertexCoordKey(x: number, y: number): string {
  const rx = Math.round((x + 0.137) / 2) * 2;
  const ry = Math.round((y + 0.271) / 2) * 2;
  return `${rx}_${ry}`;
}

export function edgePairKey(vA: string, vB: string): string {
  return vA < vB ? `${vA}__${vB}` : `${vB}__${vA}`;
}

/**
 * Generates the exact 19-hex axial board (radius 2), deduplicated 54 unique vertices,
 * and 72 unique edges with complete bidirectional adjacency lists.
 */
export function generateHexBoardGraph(
  rng: () => number = Math.random
): BoardGraph {
  const hexes = new Map<string, Hex>();
  const vertexByKey = new Map<string, Vertex>();
  const vertices = new Map<string, Vertex>();
  const edgeByKey = new Map<string, Edge>();
  const edges = new Map<string, Edge>();

  // Collect all 19 axial coordinates in radius 2
  const coords: Array<{ q: number; r: number }> = [];
  for (let q = -BOARD_AXIAL_RADIUS; q <= BOARD_AXIAL_RADIUS; q++) {
    const rMin = Math.max(-BOARD_AXIAL_RADIUS, -q - BOARD_AXIAL_RADIUS);
    const rMax = Math.min(BOARD_AXIAL_RADIUS, -q + BOARD_AXIAL_RADIUS);
    for (let r = rMin; r <= rMax; r++) {
      coords.push({ q, r });
    }
  }

  // Shuffle 18 terrains and 18 standard Catan dice tokens
  const shuffledTerrains = shuffle(TERRAIN_POOL, rng);
  const shuffledTokens = shuffle(CATAN_DICE_TOKENS, rng);
  let poolIdx = 0;

  let nextVertexNum = 0;
  let nextEdgeNum = 0;

  const sqrt3 = Math.sqrt(3);

  for (const { q, r } of coords) {
    const isCenter = q === 0 && r === 0;
    const terrain: TerrainType = isCenter
      ? 'desert'
      : shuffledTerrains[poolIdx];
    const diceNumber: number | null = isCenter ? null : shuffledTokens[poolIdx];
    if (!isCenter) {
      poolIdx++;
    }

    const hexId = `h_${q}_${r}`;
    const cx = BOARD_CENTER_X + HEX_RADIUS * sqrt3 * (q + r / 2);
    const cy = BOARD_CENTER_Y + HEX_RADIUS * 1.5 * r;

    const hexVertexIds: string[] = [];
    const hexEdgeIds: string[] = [];

    // Pointy-top hex corners: -30°, 30°, 90°, 150°, 210°, 270°
    for (let i = 0; i < 6; i++) {
      const angleRad = ((60 * i - 30) * Math.PI) / 180;
      const vx = cx + HEX_RADIUS * Math.cos(angleRad);
      const vy = cy + HEX_RADIUS * Math.sin(angleRad);
      const key = vertexCoordKey(vx, vy);

      let vertex = vertexByKey.get(key);
      if (!vertex) {
        const id = `v_${nextVertexNum++}`;
        vertex = {
          id,
          key,
          x: Math.round(vx * 100) / 100,
          y: Math.round(vy * 100) / 100,
          adjacentHexes: [],
          adjacentEdges: [],
          adjacentVertices: [],
          isCoastal: false,
          building: null,
          buffer: {},
        };
        vertexByKey.set(key, vertex);
        vertices.set(id, vertex);
      }

      if (!vertex.adjacentHexes.includes(hexId)) {
        vertex.adjacentHexes.push(hexId);
      }
      hexVertexIds.push(vertex.id);
    }

    // Create / deduplicate the 6 edges around this hex
    for (let i = 0; i < 6; i++) {
      const vAId = hexVertexIds[i];
      const vBId = hexVertexIds[(i + 1) % 6];
      const eKey = edgePairKey(vAId, vBId);

      let edge = edgeByKey.get(eKey);
      if (!edge) {
        const vA = vertices.get(vAId)!;
        const vB = vertices.get(vBId)!;
        const id = `e_${nextEdgeNum++}`;
        edge = {
          id,
          key: eKey,
          endpoints: [vAId, vBId],
          x1: vA.x,
          y1: vA.y,
          x2: vB.x,
          y2: vB.y,
          mx: (vA.x + vB.x) / 2,
          my: (vA.y + vB.y) / 2,
          conveyor: null,
          flowDirection: null,
        };
        edgeByKey.set(eKey, edge);
        edges.set(id, edge);

        if (!vA.adjacentEdges.includes(id)) vA.adjacentEdges.push(id);
        if (!vB.adjacentEdges.includes(id)) vB.adjacentEdges.push(id);
        if (!vA.adjacentVertices.includes(vBId)) vA.adjacentVertices.push(vBId);
        if (!vB.adjacentVertices.includes(vAId)) vB.adjacentVertices.push(vAId);
      }

      hexEdgeIds.push(edge.id);
    }

    hexes.set(hexId, {
      id: hexId,
      q,
      r,
      x: cx,
      y: cy,
      terrain,
      resource: TERRAIN_META[terrain].resource,
      diceNumber,
      vertexIds: hexVertexIds,
      edgeIds: hexEdgeIds,
    });
  }

  // Flag coastal vertices (vertices bordering fewer than 3 hexes)
  for (const v of vertices.values()) {
    v.isCoastal = v.adjacentHexes.length < 3;
  }

  // Topological integrity invariant: 19 hexes, 54 vertices, 72 edges
  if (hexes.size !== 19 || vertices.size !== 54 || edges.size !== 72) {
    throw new Error(
      `Invalid hex graph topology: expected 19/54/72, got ${hexes.size}/${vertices.size}/${edges.size}`
    );
  }

  return { hexes, vertices, edges };
}

export function getEdgeBetween(
  edges: Map<string, Edge>,
  vAId: string,
  vBId: string
): Edge | undefined {
  for (const edge of edges.values()) {
    const [a, b] = edge.endpoints;
    if ((a === vAId && b === vBId) || (a === vBId && b === vAId)) {
      return edge;
    }
  }
  return undefined;
}

/** BFS shortest edge-hop distances from originVertexId to every vertex in the graph */
export function getVertexDistances(
  vertices: Map<string, Vertex>,
  originVertexId: string
): Map<string, number> {
  const dist = new Map<string, number>();
  const queue: string[] = [originVertexId];
  dist.set(originVertexId, 0);

  let head = 0;
  while (head < queue.length) {
    const curr = queue[head++];
    const d = dist.get(curr)!;
    const v = vertices.get(curr);
    if (!v) continue;

    for (const next of v.adjacentVertices) {
      if (!dist.has(next)) {
        dist.set(next, d + 1);
        queue.push(next);
      }
    }
  }
  return dist;
}

/** BFS shortest vertex path from startId to goalId (inclusive of both endpoints) */
export function getShortestVertexPath(
  vertices: Map<string, Vertex>,
  startId: string,
  goalId: string
): string[] | null {
  if (startId === goalId) return [startId];
  const prev = new Map<string, string>();
  const visited = new Set<string>([startId]);
  const queue: string[] = [startId];

  let head = 0;
  while (head < queue.length) {
    const curr = queue[head++];
    const v = vertices.get(curr);
    if (!v) continue;

    for (const next of v.adjacentVertices) {
      if (visited.has(next)) continue;
      visited.add(next);
      prev.set(next, curr);
      if (next === goalId) {
        const path: string[] = [goalId];
        let node = goalId;
        while (node !== startId) {
          node = prev.get(node)!;
          path.push(node);
        }
        return path.reverse();
      }
      queue.push(next);
    }
  }
  return null;
}

export function getVerticesWithinRange(
  vertices: Map<string, Vertex>,
  originVertexId: string,
  range: number
): string[] {
  const dists = getVertexDistances(vertices, originVertexId);
  const result: string[] = [];
  for (const [vid, d] of dists.entries()) {
    if (d <= range) result.push(vid);
  }
  return result;
}

/**
 * Returns true if placing a Harvester Node or Drill Rig on `vertexId` violates
 * the Catan distance rule (another Harvester/Drill Rig on any adjacent vertex).
 */
export function violatesCatanDistanceRule(
  vertices: Map<string, Vertex>,
  vertexId: string
): boolean {
  const v = vertices.get(vertexId);
  if (!v) return true;
  for (const adjId of v.adjacentVertices) {
    const adj = vertices.get(adjId);
    if (
      adj?.building &&
      (adj.building.type === 'harvester' || adj.building.type === 'drill_rig')
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Creates a fresh Turn 1 GameState:
 * - Central Core on a central vertex bordering the Desert (0,0)
 * - 1 starting Harvester Node exactly 2 edges away (high-yield resource junction)
 * - 2 connecting Conveyor Mk.I edges linking Harvester -> Core
 */
export function createInitialGameState(
  rng: () => number = Math.random
): GameState {
  const { hexes, vertices, edges } = generateHexBoardGraph(rng);

  const desertHex = hexes.get('h_0_0')!;
  // Pick bottom-most vertex of the center Desert hex for clean visual centering
  let coreVertexId = desertHex.vertexIds[0];
  let maxY = -Infinity;
  for (const vid of desertHex.vertexIds) {
    const v = vertices.get(vid)!;
    if (v.y > maxY) {
      maxY = v.y;
      coreVertexId = vid;
    }
  }

  let nextEntityId = 1;
  const coreVertex = vertices.get(coreVertexId)!;
  coreVertex.building = {
    id: `b_${nextEntityId++}`,
    type: 'core',
    category: 'core',
    vertexId: coreVertexId,
    hp: BUILDING_SPECS.core.maxHp,
    maxHp: BUILDING_SPECS.core.maxHp,
    isOverclocked: false,
    overclockHeat: 0,
  };

  // Find candidate vertices exactly 2 edges from Core and score them by adjacent hex dice pips
  const distFromCore = getVertexDistances(vertices, coreVertexId);
  let bestHarvesterId: string | null = null;
  let bestScore = -1;

  for (const [vid, d] of distFromCore.entries()) {
    if (d !== 2) continue;
    const v = vertices.get(vid)!;
    let score = 0;
    let resourceHexCount = 0;
    for (const hid of v.adjacentHexes) {
      const h = hexes.get(hid)!;
      if (h.resource && h.diceNumber) {
        resourceHexCount++;
        score += DICE_PROBABILITIES[h.diceNumber]?.pips ?? 1;
      }
    }
    // Strongly prefer interior 3-hex junctions with high probability numbers
    const totalScore = resourceHexCount * 10 + score;
    if (totalScore > bestScore) {
      bestScore = totalScore;
      bestHarvesterId = vid;
    }
  }

  const harvesterVertexId = bestHarvesterId!;
  const harvesterVertex = vertices.get(harvesterVertexId)!;
  harvesterVertex.building = {
    id: `b_${nextEntityId++}`,
    type: 'harvester',
    category: 'industry',
    vertexId: harvesterVertexId,
    hp: BUILDING_SPECS.harvester.maxHp,
    maxHp: BUILDING_SPECS.harvester.maxHp,
    isOverclocked: false,
    overclockHeat: 0,
  };

  // Place 2 Conveyor Mk.I edges along shortest 2-edge path from Harvester -> Core
  const path = getShortestVertexPath(vertices, harvesterVertexId, coreVertexId)!;
  for (let i = 0; i < path.length - 1; i++) {
    const edge = getEdgeBetween(edges, path[i], path[i + 1]);
    if (edge) {
      edge.conveyor = 'conveyor_mk1';
      edge.flowDirection = [path[i], path[i + 1]];
    }
  }

  return {
    turn: 1,
    maxTurns: MAX_TURNS,
    phase: 'ROLL_AND_HARVEST',
    status: 'playing',
    resources: { ...STARTING_RESOURCES },
    coreVertexId,
    hexes,
    vertices,
    edges,
    enemies: [],
    nextEntityId,
    lastRoll: null,
    lastLogistics: null,
    lastCombat: null,
    selectedTarget: null,
    stats: {
      totalHarvested: 0,
      totalSmelted: 0,
      buildingsConstructed: 0,
      conveyorsBuilt: 0,
      enemiesKilled: 0,
      bossesKilled: 0,
      overclockExplosions: 0,
    },
  };
}

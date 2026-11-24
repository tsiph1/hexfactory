export type RawResourceType = 'timber' | 'clay' | 'ore' | 'grain' | 'aether';
export type RefinedResourceType = 'brick' | 'steel' | 'powerCell' | 'silicon';
export type ResourceType = RawResourceType | RefinedResourceType;

export type ResourceCost = Partial<Record<ResourceType, number>>;
export type ResourceInventory = Record<ResourceType, number>;

export type TerrainType =
  | 'forest'
  | 'hills'
  | 'mountains'
  | 'fields'
  | 'pasture'
  | 'desert';

export type BuildingCategory = 'core' | 'industry' | 'defense';

export type BuildingType =
  | 'core'
  | 'harvester'
  | 'drill_rig'
  | 'smelter_kiln'
  | 'aether_reactor'
  | 'arc_furnace'
  | 'barricade'
  | 'duo_turret'
  | 'scorch'
  | 'lancer'
  | 'meltdown';

export type ConveyorType = 'conveyor_mk1' | 'conveyor_mk2';

export type EnemyType =
  | 'crawler'
  | 'dagger'
  | 'mace'
  | 'fortress'
  | 'spiroct'
  | 'eclipse';

export type TurnPhase =
  | 'ROLL_AND_HARVEST'
  | 'LOGISTICS_AND_SMELT'
  | 'BUILD_AND_GAMBLE'
  | 'WAVE_COMBAT'
  | 'GAME_OVER';

export type MagneticBiasMode = 'none' | 'even' | 'odd';

export interface Hex {
  id: string;
  q: number;
  r: number;
  x: number;
  y: number;
  terrain: TerrainType;
  resource: RawResourceType | null;
  diceNumber: number | null;
  vertexIds: string[];
  edgeIds: string[];
}

export interface Building {
  id: string;
  type: BuildingType;
  category: BuildingCategory;
  vertexId: string;
  hp: number;
  maxHp: number;
  isOverclocked: boolean;
  /** Number of consecutive turns overclocked (k in k/6 explosion roll). Starts at 1 when toggled ON. */
  overclockHeat: number;
}

export interface Vertex {
  id: string;
  key: string;
  x: number;
  y: number;
  adjacentHexes: string[];
  adjacentEdges: string[];
  adjacentVertices: string[];
  isCoastal: boolean;
  building: Building | null;
  /** Temporary output buffer holding harvested items before Phase 2 conveyor routing. */
  buffer: Partial<Record<ResourceType, number>>;
}

export interface Edge {
  id: string;
  key: string;
  endpoints: [string, string];
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  mx: number;
  my: number;
  conveyor: ConveyorType | null;
  /** Last observed flow direction [fromVertexId, toVertexId] for chevron rendering */
  flowDirection: [string, string] | null;
}

export interface Unit {
  id: string;
  name: string;
  vertexId: string;
  hp: number;
  maxHp: number;
  armor: number;
  atk: number;
}

export interface Enemy extends Unit {
  type: EnemyType;
  isBoss: boolean;
  spawnedTurn: number;
}

export interface BuildingSpec {
  type: BuildingType;
  name: string;
  shortName: string;
  category: BuildingCategory;
  cost: ResourceCost;
  maxHp: number;
  description: string;
  canOverclock: boolean;
  enforcesDistanceRule?: boolean;
  upgradesFrom?: BuildingType;
  // Production
  harvestYield?: number;
  // Combat stats
  range?: number;
  atk?: number;
  shots?: number;
  pierce?: number;
  isAoE?: boolean;
  isLine?: boolean;
  blocksMovement?: boolean;
}

export interface ConveyorSpec {
  type: ConveyorType;
  name: string;
  shortName: string;
  cost: ResourceCost;
  capacityPerTurn: number;
  maxRangeEdges: number;
  description: string;
  upgradesFrom?: ConveyorType;
}

export interface SmeltRecipe {
  id: string;
  name: string;
  buildingType: BuildingType;
  inputs: Partial<Record<RawResourceType, number>>;
  output: RefinedResourceType;
  outputAmount: number;
}

export interface EnemySpec {
  type: EnemyType;
  name: string;
  maxHp: number;
  armor: number;
  atk: number;
  isBoss: boolean;
  color: number;
  accentColor: number;
  radius: number;
}

export interface WaveEntry {
  type: EnemyType;
  count: number;
}

export interface WaveDefinition {
  turn: number;
  label: string;
  isBossWave: boolean;
  entries: WaveEntry[];
}

export interface HarvestEvent {
  hexId: string;
  vertexId: string;
  resource: RawResourceType;
  amount: number;
  isOverclocked: boolean;
  isCoreSiphon?: boolean;
}

export interface DiceRollResult {
  rawDice: number[];
  keptDice: [number, number];
  droppedIndex: number | null;
  total: number;
  biasUsed: MagneticBiasMode;
  harvestEvents: HarvestEvent[];
}

export interface PacketAnimation {
  resource: ResourceType;
  pathVertexIds: string[];
  pathEdgeIds: string[];
  amount: number;
  fromVertexId: string;
  toVertexId: string;
}

export interface SmeltEvent {
  vertexId: string;
  buildingType: BuildingType;
  recipeId: string;
  outputResource: RefinedResourceType;
  amount: number;
  inputsConsumed: Partial<Record<RawResourceType, number>>;
}

export interface LogisticsResult {
  packets: PacketAnimation[];
  smelts: SmeltEvent[];
  deliveredToCore: Partial<Record<ResourceType, number>>;
  strandedVertexIds: string[];
}

export type CombatEvent =
  | {
      kind: 'spawn';
      enemyId: string;
      enemyType: EnemyType;
      enemyName: string;
      vertexId: string;
      isBoss: boolean;
    }
  | {
      kind: 'move';
      enemyId: string;
      fromVertexId: string;
      toVertexId: string;
    }
  | {
      kind: 'turret_fire';
      turretVertexId: string;
      turretType: BuildingType;
      range: number;
      targetVertexId: string;
      lineVertexIds?: string[];
      isAoE: boolean;
      isLine: boolean;
      hits: Array<{
        enemyId: string;
        enemyVertexId: string;
        roll1d6: number;
        multiplier: number;
        critState: 'jam' | 'normal' | 'crit';
        damage: number;
        killed: boolean;
      }>;
    }
  | {
      kind: 'enemy_attack';
      enemyId: string;
      enemyVertexId: string;
      targetVertexId: string;
      targetBuildingType: BuildingType;
      damage: number;
      destroyed: boolean;
    }
  | {
      kind: 'overclock_roll';
      vertexId: string;
      buildingType: BuildingType;
      roll1d6: number;
      thresholdK: number;
      exploded: boolean;
      affectedVertexIds: string[];
      damage: number;
    };

export interface CombatResult {
  events: CombatEvent[];
  enemiesSpawned: number;
  enemiesKilled: number;
  bossesKilled: number;
  coreDamageTaken: number;
  coreHpAfter: number;
  outcome: 'ongoing' | 'victory' | 'defeat';
}

export interface SelectionTarget {
  kind: 'vertex' | 'edge' | 'hex';
  id: string;
}

export interface RunStats {
  totalHarvested: number;
  totalSmelted: number;
  buildingsConstructed: number;
  conveyorsBuilt: number;
  enemiesKilled: number;
  bossesKilled: number;
  overclockExplosions: number;
}

export interface GameState {
  turn: number;
  maxTurns: number;
  phase: TurnPhase;
  status: 'playing' | 'victory' | 'defeat';
  resources: ResourceInventory;
  coreVertexId: string;
  hexes: Map<string, Hex>;
  vertices: Map<string, Vertex>;
  edges: Map<string, Edge>;
  enemies: Enemy[];
  nextEntityId: number;
  lastRoll: DiceRollResult | null;
  lastLogistics: LogisticsResult | null;
  lastCombat: CombatResult | null;
  selectedTarget: SelectionTarget | null;
  stats: RunStats;
}

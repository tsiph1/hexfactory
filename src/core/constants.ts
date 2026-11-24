import type {
  BuildingSpec,
  BuildingType,
  ConveyorSpec,
  ConveyorType,
  EnemySpec,
  EnemyType,
  RawResourceType,
  RefinedResourceType,
  ResourceInventory,
  ResourceType,
  SmeltRecipe,
  TerrainType,
  WaveDefinition,
} from './types';

export const GAME_WIDTH = 390;
export const GAME_HEIGHT = 844;
export const MAX_TURNS = 12;

/** Board geometry tuned to sit cleanly in y: 120..540 (upper 65% of 390x844 portrait) */
export const BOARD_CENTER_X = 195;
export const BOARD_CENTER_Y = 330;
export const HEX_RADIUS = 40;
export const BOARD_AXIAL_RADIUS = 2;

export const VERTEX_HIT_RADIUS = 18;
export const EDGE_HIT_THICKNESS = 16;

export const RAW_RESOURCES: RawResourceType[] = [
  'timber',
  'clay',
  'ore',
  'grain',
  'aether',
];

export const REFINED_RESOURCES: RefinedResourceType[] = [
  'brick',
  'steel',
  'powerCell',
  'silicon',
];

export const ALL_RESOURCES: ResourceType[] = [
  ...RAW_RESOURCES,
  ...REFINED_RESOURCES,
];

export const RESOURCE_META: Record<
  ResourceType,
  { name: string; short: string; color: number; hex: string }
> = {
  timber: { name: 'Timber', short: 'TMB', color: 0x38b000, hex: '#38b000' },
  clay: { name: 'Clay', short: 'CLY', color: 0xd96b43, hex: '#d96b43' },
  ore: { name: 'Ore', short: 'ORE', color: 0x7c98b3, hex: '#7c98b3' },
  grain: { name: 'Grain', short: 'GRN', color: 0xf4c430, hex: '#f4c430' },
  aether: { name: 'Aether', short: 'AET', color: 0x9b5de5, hex: '#9b5de5' },
  brick: { name: 'Brick', short: 'BRK', color: 0xe76f51, hex: '#e76f51' },
  steel: { name: 'Steel', short: 'STL', color: 0xb8d0eb, hex: '#b8d0eb' },
  powerCell: {
    name: 'Power Cell',
    short: 'PWR',
    color: 0x00e5ff,
    hex: '#00e5ff',
  },
  silicon: { name: 'Silicon', short: 'SIL', color: 0xf15bb5, hex: '#f15bb5' },
};

export const TERRAIN_META: Record<
  TerrainType,
  {
    name: string;
    resource: RawResourceType | null;
    fillColor: number;
    borderColor: number;
    accentColor: number;
  }
> = {
  forest: {
    name: 'Forest',
    resource: 'timber',
    fillColor: 0x1b4332,
    borderColor: 0x40916c,
    accentColor: 0x52b788,
  },
  hills: {
    name: 'Hills',
    resource: 'clay',
    fillColor: 0x5c2c1c,
    borderColor: 0xb55333,
    accentColor: 0xe07a5f,
  },
  mountains: {
    name: 'Mountains',
    resource: 'ore',
    fillColor: 0x2b3648,
    borderColor: 0x627794,
    accentColor: 0x9eb3c9,
  },
  fields: {
    name: 'Fields',
    resource: 'grain',
    fillColor: 0x5c4714,
    borderColor: 0xc99c2a,
    accentColor: 0xf4c430,
  },
  pasture: {
    name: 'Pasture',
    resource: 'aether',
    fillColor: 0x351c52,
    borderColor: 0x7b42bc,
    accentColor: 0xb388ff,
  },
  desert: {
    name: 'Wasteland',
    resource: null,
    fillColor: 0x3b3328,
    borderColor: 0x7a6c57,
    accentColor: 0xa69478,
  },
};

/** Exact 18 non-desert terrains (center (0,0) is always Desert) */
export const TERRAIN_POOL: TerrainType[] = [
  'forest',
  'forest',
  'forest',
  'forest',
  'hills',
  'hills',
  'hills',
  'mountains',
  'mountains',
  'mountains',
  'fields',
  'fields',
  'fields',
  'fields',
  'pasture',
  'pasture',
  'pasture',
  'pasture',
];

/** Standard Catan 18 dice tokens */
export const CATAN_DICE_TOKENS: number[] = [
  2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12,
];

/** Exact 2d6 probability weights (out of 36) */
export const DICE_PROBABILITIES: Record<number, { ways: number; pips: number }> = {
  2: { ways: 1, pips: 1 },
  3: { ways: 2, pips: 2 },
  4: { ways: 3, pips: 3 },
  5: { ways: 4, pips: 4 },
  6: { ways: 5, pips: 5 },
  7: { ways: 6, pips: 6 },
  8: { ways: 5, pips: 5 },
  9: { ways: 4, pips: 4 },
  10: { ways: 3, pips: 3 },
  11: { ways: 2, pips: 2 },
  12: { ways: 1, pips: 1 },
};

export const STARTING_RESOURCES: ResourceInventory = {
  timber: 2,
  clay: 2,
  ore: 2,
  grain: 1,
  aether: 1,
  brick: 1,
  steel: 0,
  powerCell: 1,
  silicon: 0,
};

export const CONVEYOR_SPECS: Record<ConveyorType, ConveyorSpec> = {
  conveyor_mk1: {
    type: 'conveyor_mk1',
    name: 'Conveyor Mk.I',
    shortName: 'Belt Mk.I',
    cost: { timber: 1, clay: 1 },
    capacityPerTurn: 2,
    maxRangeEdges: 3,
    description: '2 items/turn · Up to 3 edges',
  },
  conveyor_mk2: {
    type: 'conveyor_mk2',
    name: 'Conveyor Mk.II',
    shortName: 'Belt Mk.II',
    cost: { steel: 1 },
    capacityPerTurn: 5,
    maxRangeEdges: 6,
    description: '5 items/turn · Up to 6 edges',
    upgradesFrom: 'conveyor_mk1',
  },
};

export const BUILDING_SPECS: Record<BuildingType, BuildingSpec> = {
  core: {
    type: 'core',
    name: 'Central Core',
    shortName: 'Core',
    category: 'core',
    cost: {},
    maxHp: 250,
    description: 'Command hub. Protect at all costs.',
    canOverclock: false,
  },
  harvester: {
    type: 'harvester',
    name: 'Harvester Node',
    shortName: 'Harvester',
    category: 'industry',
    cost: { timber: 1, clay: 1, grain: 1, aether: 1 },
    maxHp: 60,
    description: 'Harvests +1 from matching hexes. No adj. Nodes.',
    canOverclock: true,
    enforcesDistanceRule: true,
    harvestYield: 1,
  },
  drill_rig: {
    type: 'drill_rig',
    name: 'Drill Rig',
    shortName: 'Drill Rig',
    category: 'industry',
    cost: { steel: 2, brick: 1 },
    maxHp: 90,
    description: 'Heavy extractor: +2 per matching hex.',
    canOverclock: true,
    enforcesDistanceRule: true,
    upgradesFrom: 'harvester',
    harvestYield: 2,
  },
  smelter_kiln: {
    type: 'smelter_kiln',
    name: 'Smelter / Kiln',
    shortName: 'Smelter',
    category: 'industry',
    cost: { brick: 2, ore: 1 },
    maxHp: 80,
    description: 'Brick (1 Cly+1 Tmb) & Steel (2 Ore+1 Tmb).',
    canOverclock: true,
  },
  aether_reactor: {
    type: 'aether_reactor',
    name: 'Aether Reactor',
    shortName: 'Reactor',
    category: 'industry',
    cost: { steel: 1, aether: 2 },
    maxHp: 80,
    description: 'Refines Power Cell (1 Aether + 1 Grain).',
    canOverclock: true,
  },
  arc_furnace: {
    type: 'arc_furnace',
    name: 'Arc Furnace',
    shortName: 'Arc Furn.',
    category: 'industry',
    cost: { steel: 2, powerCell: 1 },
    maxHp: 85,
    description: 'Refines Silicon (2 Ore + 1 Aether).',
    canOverclock: true,
  },
  barricade: {
    type: 'barricade',
    name: 'Barricade',
    shortName: 'Barricade',
    category: 'defense',
    cost: { brick: 2 },
    maxHp: 120,
    description: '120 HP wall. Halts enemy march until broken.',
    canOverclock: false,
    blocksMovement: true,
  },
  duo_turret: {
    type: 'duo_turret',
    name: 'Duo Turret',
    shortName: 'Duo',
    category: 'defense',
    cost: { brick: 1, ore: 1 },
    maxHp: 60,
    description: 'Rng 1 · 15x2 DMG · Rapid twin cannons.',
    canOverclock: true,
    range: 1,
    atk: 15,
    shots: 2,
    pierce: 0,
  },
  scorch: {
    type: 'scorch',
    name: 'Scorch',
    shortName: 'Scorch',
    category: 'defense',
    cost: { steel: 2, clay: 1 },
    maxHp: 90,
    description: 'Rng 0 AoE · 35 DMG · Torches vertex.',
    canOverclock: true,
    range: 0,
    atk: 35,
    shots: 1,
    pierce: 0,
    isAoE: true,
  },
  lancer: {
    type: 'lancer',
    name: 'Lancer',
    shortName: 'Lancer',
    category: 'defense',
    cost: { steel: 2, powerCell: 2 },
    maxHp: 75,
    description: 'Rng 2 Line · 60 DMG · 100% Pierce.',
    canOverclock: true,
    range: 2,
    atk: 60,
    shots: 1,
    pierce: 1.0,
    isLine: true,
  },
  meltdown: {
    type: 'meltdown',
    name: 'Meltdown',
    shortName: 'Meltdown',
    category: 'defense',
    cost: { silicon: 3, powerCell: 3 },
    maxHp: 150,
    description: 'Rng 2 AoE · 110 DMG · 50% Pierce.',
    canOverclock: true,
    range: 2,
    atk: 110,
    shots: 1,
    pierce: 0.5,
    isAoE: true,
  },
};

export const INDUSTRY_BUILD_LIST: BuildingType[] = [
  'harvester',
  'drill_rig',
  'smelter_kiln',
  'aether_reactor',
  'arc_furnace',
];

export const DEFENSE_BUILD_LIST: BuildingType[] = [
  'barricade',
  'duo_turret',
  'scorch',
  'lancer',
  'meltdown',
];

export const SMELT_RECIPES: SmeltRecipe[] = [
  {
    id: 'steel',
    name: 'Steel',
    buildingType: 'smelter_kiln',
    inputs: { ore: 2, timber: 1 },
    output: 'steel',
    outputAmount: 1,
  },
  {
    id: 'brick',
    name: 'Brick',
    buildingType: 'smelter_kiln',
    inputs: { clay: 1, timber: 1 },
    output: 'brick',
    outputAmount: 1,
  },
  {
    id: 'powerCell',
    name: 'Power Cell',
    buildingType: 'aether_reactor',
    inputs: { aether: 1, grain: 1 },
    output: 'powerCell',
    outputAmount: 1,
  },
  {
    id: 'silicon',
    name: 'Silicon',
    buildingType: 'arc_furnace',
    inputs: { ore: 2, aether: 1 },
    output: 'silicon',
    outputAmount: 1,
  },
];

export const ENEMY_SPECS: Record<EnemyType, EnemySpec> = {
  crawler: {
    type: 'crawler',
    name: 'Crawler',
    maxHp: 28,
    armor: 0,
    atk: 12,
    isBoss: false,
    color: 0xff595e,
    accentColor: 0xff9f1c,
    radius: 7,
  },
  dagger: {
    type: 'dagger',
    name: 'Dagger',
    maxHp: 44,
    armor: 5,
    atk: 16,
    isBoss: false,
    color: 0xf77f00,
    accentColor: 0xfcbf49,
    radius: 8,
  },
  mace: {
    type: 'mace',
    name: 'Mace',
    maxHp: 74,
    armor: 14,
    atk: 22,
    isBoss: false,
    color: 0xd62828,
    accentColor: 0xf77f00,
    radius: 9,
  },
  fortress: {
    type: 'fortress',
    name: 'Fortress',
    maxHp: 112,
    armor: 20,
    atk: 30,
    isBoss: false,
    color: 0x9d0208,
    accentColor: 0xffba08,
    radius: 10,
  },
  spiroct: {
    type: 'spiroct',
    name: 'Spiroct',
    maxHp: 185,
    armor: 16,
    atk: 38,
    isBoss: true,
    color: 0xb5179e,
    accentColor: 0xf72585,
    radius: 12,
  },
  eclipse: {
    type: 'eclipse',
    name: 'Eclipse',
    maxHp: 340,
    armor: 26,
    atk: 52,
    isBoss: true,
    color: 0x7209b7,
    accentColor: 0xff006e,
    radius: 14,
  },
};

export const WAVE_CURVE: WaveDefinition[] = [
  { turn: 1, label: 'Grace Period (1/2)', isBossWave: false, entries: [] },
  { turn: 2, label: 'Grace Period (2/2)', isBossWave: false, entries: [] },
  {
    turn: 3,
    label: 'Scout Swarm',
    isBossWave: false,
    entries: [{ type: 'crawler', count: 3 }],
  },
  {
    turn: 4,
    label: 'Raiding Party',
    isBossWave: false,
    entries: [
      { type: 'crawler', count: 3 },
      { type: 'dagger', count: 1 },
    ],
  },
  {
    turn: 5,
    label: 'Armored Vanguard',
    isBossWave: false,
    entries: [
      { type: 'crawler', count: 2 },
      { type: 'dagger', count: 2 },
      { type: 'mace', count: 1 },
    ],
  },
  {
    turn: 6,
    label: 'MID-BOSS: SPIROCT',
    isBossWave: true,
    entries: [
      { type: 'spiroct', count: 1 },
      { type: 'crawler', count: 2 },
    ],
  },
  {
    turn: 7,
    label: 'Shock Battalion',
    isBossWave: false,
    entries: [
      { type: 'dagger', count: 3 },
      { type: 'mace', count: 2 },
    ],
  },
  {
    turn: 8,
    label: 'Siege Column',
    isBossWave: false,
    entries: [
      { type: 'crawler', count: 3 },
      { type: 'mace', count: 2 },
      { type: 'fortress', count: 1 },
    ],
  },
  {
    turn: 9,
    label: 'Heavy Assault',
    isBossWave: false,
    entries: [
      { type: 'dagger', count: 3 },
      { type: 'fortress', count: 2 },
    ],
  },
  {
    turn: 10,
    label: 'Iron Phalanx',
    isBossWave: false,
    entries: [
      { type: 'crawler', count: 3 },
      { type: 'mace', count: 2 },
      { type: 'fortress', count: 2 },
    ],
  },
  {
    turn: 11,
    label: 'Twin Dread',
    isBossWave: true,
    entries: [
      { type: 'spiroct', count: 2 },
      { type: 'dagger', count: 3 },
    ],
  },
  {
    turn: 12,
    label: 'FINAL BOSS: ECLIPSE',
    isBossWave: true,
    entries: [
      { type: 'eclipse', count: 1 },
      { type: 'mace', count: 2 },
      { type: 'crawler', count: 2 },
    ],
  },
];

export const OVERCLOCK_EXPLOSION_DAMAGE = 50;
export const REPAIR_COST = { brick: 1 } as const;
export const REPAIR_AMOUNT = 45;

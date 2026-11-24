import Phaser from 'phaser';
import {
  ALL_RESOURCES,
  BUILDING_SPECS,
  GAME_HEIGHT,
  GAME_WIDTH,
  RAW_RESOURCES,
  REFINED_RESOURCES,
  RESOURCE_META,
} from '../core/constants';
import type {
  CombatResult,
  DiceRollResult,
  GameState,
  LogisticsResult,
  ResourceType,
  TurnPhase,
} from '../core/types';
import { BuildDrawer } from '../ui/BuildDrawer';
import { DiceOverlay } from '../ui/DiceOverlay';

export class UIScene extends Phaser.Scene {
  private turnText!: Phaser.GameObjects.Text;
  private coreHpText!: Phaser.GameObjects.Text;
  private coreHpFill!: Phaser.GameObjects.Rectangle;

  private phasePills = new Map<
    TurnPhase,
    { bg: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text }
  >();

  private resourceTexts = new Map<ResourceType, Phaser.GameObjects.Text>();
  private lastResourceValues = new Map<ResourceType, number>();

  private diceOverlay!: DiceOverlay;
  private buildDrawer!: BuildDrawer;
  private logisticsPanel!: Phaser.GameObjects.Container;
  private logisticsBodyText!: Phaser.GameObjects.Text;
  private combatPanel!: Phaser.GameObjects.Container;
  private combatBodyText!: Phaser.GameObjects.Text;

  private helpModal!: Phaser.GameObjects.Container;
  private gameOverModal!: Phaser.GameObjects.Container;
  private gameOverDynamic!: Phaser.GameObjects.Container;

  private showingLogistics = false;
  private showingCombat = false;

  constructor() {
    super({ key: 'UIScene' });
  }

  create(): void {
    this.buildTopHud();
    this.diceOverlay = new DiceOverlay(this);
    this.buildDrawer = new BuildDrawer(this);
    this.buildLogisticsPanel();
    this.buildCombatPanel();
    this.buildHelpModal();
    this.buildGameOverModal();

    this.bindEvents();

    const initialState = this.registry.get('gameState') as
      | GameState
      | undefined;
    if (initialState) {
      this.syncUI(initialState);
    }
  }

  private buildTopHud(): void {
    // Top bar background (y: 0..38)
    this.add
      .rectangle(GAME_WIDTH / 2, 19, GAME_WIDTH, 38, 0x0d1526, 0.98)
      .setDepth(10);
    this.add
      .line(0, 0, 0, 38, GAME_WIDTH, 38, 0x1e3a5f, 1)
      .setOrigin(0)
      .setDepth(11);

    // Turn badge
    this.add
      .rectangle(38, 19, 64, 24, 0x16243b, 1)
      .setStrokeStyle(1.2, 0x38bdf8, 0.9)
      .setDepth(11);
    this.turnText = this.add
      .text(38, 19, 'T 1/12', {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#38bdf8',
      })
      .setOrigin(0.5)
      .setDepth(12);

    // Core HP bar
    this.add
      .rectangle(124, 19, 96, 22, 0x161f30, 1)
      .setStrokeStyle(1, 0x334155, 1)
      .setDepth(11);
    this.coreHpFill = this.add
      .rectangle(78, 19, 92, 18, 0x10b981, 0.85)
      .setOrigin(0, 0.5)
      .setDepth(11);
    this.coreHpText = this.add
      .text(124, 19, 'CORE 250/250', {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '9.5px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#070a10',
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setDepth(12);

    // 4-Phase Tracker Pills
    const phases: Array<{ phase: TurnPhase; label: string; x: number }> = [
      { phase: 'ROLL_AND_HARVEST', label: 'ROLL', x: 196 },
      { phase: 'LOGISTICS_AND_SMELT', label: 'SMLT', x: 233 },
      { phase: 'BUILD_AND_GAMBLE', label: 'BLD', x: 270 },
      { phase: 'WAVE_COMBAT', label: 'WAVE', x: 307 },
    ];
    for (const p of phases) {
      const bg = this.add
        .rectangle(p.x, 19, 34, 20, 0x141e30, 1)
        .setStrokeStyle(1, 0x334155, 1)
        .setDepth(11);
      const label = this.add
        .text(p.x, 19, p.label, {
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: '8.5px',
          fontStyle: 'bold',
          color: '#64748b',
        })
        .setOrigin(0.5)
        .setDepth(12);
      this.phasePills.set(p.phase, { bg, label });
    }

    // Help (?) button
    const helpBtn = this.add
      .rectangle(344, 19, 24, 24, 0x1e293b, 1)
      .setStrokeStyle(1, 0x475569, 1)
      .setInteractive({ useHandCursor: true })
      .setDepth(11);
    this.add
      .text(344, 19, '?', {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#e2e8f0',
      })
      .setOrigin(0.5)
      .setDepth(12);
    helpBtn.on('pointerdown', () => {
      const next = !this.helpModal.visible;
      this.helpModal.setVisible(next);
      this.registry.set('helpModalOpen', next);
    });

    // Restart button
    const restartBtn = this.add
      .rectangle(373, 19, 24, 24, 0x1e293b, 1)
      .setStrokeStyle(1, 0x475569, 1)
      .setInteractive({ useHandCursor: true })
      .setDepth(11);
    this.add
      .text(373, 19, '↺', {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '13px',
        fontStyle: 'bold',
        color: '#e2e8f0',
      })
      .setOrigin(0.5)
      .setDepth(12);
    restartBtn.on('pointerdown', () => {
      this.showingLogistics = false;
      this.showingCombat = false;
      this.helpModal.setVisible(false);
      this.registry.set('helpModalOpen', false);
      this.game.events.emit('cmd:restart');
    });

    // Resource Bar background (y: 38..106)
    this.add
      .rectangle(GAME_WIDTH / 2, 72, GAME_WIDTH, 68, 0x09101d, 0.96)
      .setDepth(10);
    this.add
      .line(0, 0, 0, 106, GAME_WIDTH, 106, 0x1e293b, 1)
      .setOrigin(0)
      .setDepth(11);

    // Row 1: 5 Raw resources
    RAW_RESOURCES.forEach((res, idx) => {
      const meta = RESOURCE_META[res];
      const cx = 39 + idx * 78;
      const cy = 55;
      this.createResourcePill(res, meta.short, meta.hex, cx, cy, 72);
    });

    // Row 2: 4 Refined resources
    REFINED_RESOURCES.forEach((res, idx) => {
      const meta = RESOURCE_META[res];
      const cx = 54 + idx * 94;
      const cy = 88;
      this.createResourcePill(res, meta.short, meta.hex, cx, cy, 88);
    });
  }

  private createResourcePill(
    res: ResourceType,
    short: string,
    colorHex: string,
    cx: number,
    cy: number,
    width: number
  ): void {
    this.add
      .rectangle(cx, cy, width, 26, 0x111a2b, 1)
      .setStrokeStyle(1, 0x1f2d45, 1)
      .setDepth(11);

    const left = cx - width / 2;
    this.add
      .image(left + 13, cy, `res_${res}`)
      .setScale(0.95)
      .setDepth(12);

    this.add
      .text(left + 25, cy, short, {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '8.5px',
        fontStyle: 'bold',
        color: colorHex,
      })
      .setOrigin(0, 0.5)
      .setDepth(12);

    const valTxt = this.add
      .text(cx + width / 2 - 7, cy, '0', {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#f8fafc',
      })
      .setOrigin(1, 0.5)
      .setDepth(12);

    this.resourceTexts.set(res, valTxt);
    this.lastResourceValues.set(res, 0);
  }

  private buildLogisticsPanel(): void {
    this.logisticsPanel = this.add.container(0, 554).setVisible(false);

    const bg = this.add
      .rectangle(GAME_WIDTH / 2, 145, GAME_WIDTH - 14, 280, 0x111827, 0.96)
      .setStrokeStyle(1.5, 0xffb703, 0.9);
    const header = this.add.rectangle(
      GAME_WIDTH / 2,
      20,
      GAME_WIDTH - 24,
      26,
      0x1f2937,
      1
    );
    const title = this.add
      .text(GAME_WIDTH / 2, 20, 'PHASE 2: LOGISTICS & SMELTING', {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '11.5px',
        fontStyle: 'bold',
        color: '#ffbe0b',
      })
      .setOrigin(0.5);

    this.logisticsBodyText = this.add
      .text(24, 52, 'Routing resource packets along conveyors...', {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '11px',
        color: '#e2e8f0',
        lineSpacing: 6,
        wordWrap: { width: GAME_WIDTH - 48 },
      })
      .setOrigin(0, 0);

    const skipBg = this.add
      .rectangle(GAME_WIDTH / 2, 250, 160, 34, 0x1e293b, 1)
      .setStrokeStyle(1.2, 0x64748b, 1)
      .setInteractive({ useHandCursor: true });
    const skipLbl = this.add
      .text(GAME_WIDTH / 2, 250, 'SKIP TO BUILD >>', {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#e2e8f0',
      })
      .setOrigin(0.5);
    skipBg.on('pointerdown', () => {
      this.showingLogistics = false;
      this.game.events.emit('cmd:skip_logistics');
    });

    this.logisticsPanel.add([
      bg,
      header,
      title,
      this.logisticsBodyText,
      skipBg,
      skipLbl,
    ]);
  }

  private buildCombatPanel(): void {
    this.combatPanel = this.add.container(0, 554).setVisible(false);

    const bg = this.add
      .rectangle(GAME_WIDTH / 2, 145, GAME_WIDTH - 14, 280, 0x160f19, 0.97)
      .setStrokeStyle(1.5, 0xf43f5e, 0.9);
    const header = this.add.rectangle(
      GAME_WIDTH / 2,
      20,
      GAME_WIDTH - 24,
      26,
      0x2c111e,
      1
    );
    const title = this.add
      .text(GAME_WIDTH / 2, 20, 'PHASE 4: WAVE COMBAT', {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '11.5px',
        fontStyle: 'bold',
        color: '#fb7185',
      })
      .setOrigin(0.5);

    this.combatBodyText = this.add
      .text(24, 48, 'Resolving enemy wave...', {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '10.5px',
        color: '#f1f5f9',
        lineSpacing: 5,
        wordWrap: { width: GAME_WIDTH - 48 },
      })
      .setOrigin(0, 0);

    this.combatPanel.add([bg, header, title, this.combatBodyText]);
  }

  private buildHelpModal(): void {
    this.helpModal = this.add.container(0, 0).setDepth(100).setVisible(false);

    const dim = this.add
      .rectangle(
        GAME_WIDTH / 2,
        GAME_HEIGHT / 2,
        GAME_WIDTH,
        GAME_HEIGHT,
        0x04070e,
        0.78
      )
      .setInteractive();

    const card = this.add
      .rectangle(GAME_WIDTH / 2, 420, 348, 520, 0x0f172a, 0.98)
      .setStrokeStyle(2, 0x38bdf8, 1);

    const title = this.add
      .text(GAME_WIDTH / 2, 188, 'HEXFACTORY FIELD MANUAL', {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '15px',
        fontStyle: 'bold',
        color: '#38bdf8',
      })
      .setOrigin(0.5);

    const rules = [
      'GOAL: Survive all 12 Turns with your Central Core intact!',
      '',
      'SMELTING RECIPES (Auto-run in Phase 2 when belted to Core):',
      '• Brick = 1 Clay + 1 Timber (Smelter / Kiln)',
      '• Steel = 2 Ore + 1 Timber (Smelter / Kiln)',
      '• Power Cell = 1 Aether + 1 Grain (Aether Reactor)',
      '• Silicon = 2 Ore + 1 Aether (Arc Furnace)',
      '',
      'CONVEYORS:',
      '• Mk.I: 2 items/turn, up to 3 edges',
      '• Mk.II: 5 items/turn, up to 6 edges',
      '',
      'CATAN DISTANCE RULE:',
      '• Harvester Nodes / Drill Rigs cannot be placed on',
      '  adjacent vertices. Upgrade Harvester → Drill Rig!',
      '',
      'COMBAT & GAMBLES:',
      '• Turrets fire in range order: 2 → 1 → 0.',
      '• Every attack rolls 1d6: 1=0.75x Jam, 2-5=1x, 6=1.5x Crit.',
      '• Damage = max(1, floor(ATK*Crit - Armor*(1-Pierce))).',
      '• Overclock: +100% output/fire rate, end-of-turn k/6',
      '  explosion roll dealing 50 self & adjacent DMG!',
      '• Magnetic Bias (1 PWR): Roll 3d6, drop mismatched parity.',
    ].join('\n');

    const body = this.add
      .text(38, 214, rules, {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '10.5px',
        color: '#cbd5e1',
        lineSpacing: 4,
        wordWrap: { width: 316 },
      })
      .setOrigin(0, 0);

    const closeBtn = this.add
      .rectangle(GAME_WIDTH / 2, 646, 180, 38, 0x0284c7, 1)
      .setStrokeStyle(1.5, 0x38bdf8, 1)
      .setInteractive({ useHandCursor: true });
    const closeLbl = this.add
      .text(GAME_WIDTH / 2, 646, 'CLOSE MANUAL', {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    closeBtn.on('pointerdown', () => {
      this.helpModal.setVisible(false);
      this.registry.set('helpModalOpen', false);
    });

    this.helpModal.add([dim, card, title, body, closeBtn, closeLbl]);
  }

  private buildGameOverModal(): void {
    this.gameOverModal = this.add.container(0, 0).setDepth(120).setVisible(false);

    const dim = this.add
      .rectangle(
        GAME_WIDTH / 2,
        GAME_HEIGHT / 2,
        GAME_WIDTH,
        GAME_HEIGHT,
        0x04070e,
        0.84
      )
      .setInteractive();
    this.gameOverDynamic = this.add.container(0, 0);

    this.gameOverModal.add([dim, this.gameOverDynamic]);
  }

  private renderGameOverModal(state: GameState): void {
    this.gameOverDynamic.removeAll(true);
    const isVictory = state.status === 'victory';
    const coreHp = state.vertices.get(state.coreVertexId)?.building?.hp ?? 0;

    const accent = isVictory ? 0x10b981 : 0xf43f5e;
    const accentHex = isVictory ? '#34d399' : '#fb7185';

    const card = this.add
      .rectangle(GAME_WIDTH / 2, 420, 336, 410, 0x0f172a, 0.98)
      .setStrokeStyle(2.5, accent, 1);

    const title = this.add
      .text(
        GAME_WIDTH / 2,
        255,
        isVictory ? 'VICTORY!' : 'CORE DESTROYED',
        {
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: '26px',
          fontStyle: 'bold',
          color: accentHex,
        }
      )
      .setOrigin(0.5);

    const subtitle = this.add
      .text(
        GAME_WIDTH / 2,
        286,
        isVictory
          ? 'All 12 Waves Survived — HexFactory Secured'
          : `Defeated on Turn ${state.turn} of ${state.maxTurns}`,
        {
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: '12px',
          color: '#cbd5e1',
        }
      )
      .setOrigin(0.5);

    // Compute run rank
    let grade = 'C';
    if (isVictory) {
      if (coreHp >= 200 && state.stats.bossesKilled >= 1) grade = 'S';
      else if (coreHp >= 150) grade = 'A';
      else grade = 'B';
    }

    const gradeBadge = this.add
      .circle(GAME_WIDTH / 2, 338, 28, 0x162238, 1)
      .setStrokeStyle(2.5, accent, 1);
    const gradeText = this.add
      .text(GAME_WIDTH / 2, 338, grade, {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '28px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    const rows = [
      ['Turn Reached', `${state.turn} / ${state.maxTurns}`],
      ['Core HP Remaining', `${coreHp} / ${BUILDING_SPECS.core.maxHp}`],
      ['Enemies Eliminated', `${state.stats.enemiesKilled}`],
      ['Bosses Slain', `${state.stats.bossesKilled}`],
      ['Resources Harvested', `${state.stats.totalHarvested}`],
      ['Items Smelted', `${state.stats.totalSmelted}`],
      ['Overclock Explosions', `${state.stats.overclockExplosions}`],
    ];

    const statNodes: Phaser.GameObjects.GameObject[] = [];
    rows.forEach(([label, val], idx) => {
      const y = 390 + idx * 24;
      statNodes.push(
        this.add
          .text(56, y, label, {
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: '11.5px',
            color: '#94a3b8',
          })
          .setOrigin(0, 0.5),
        this.add
          .text(GAME_WIDTH - 56, y, val, {
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: '11.5px',
            fontStyle: 'bold',
            color: '#f8fafc',
          })
          .setOrigin(1, 0.5)
      );
    });

    const playBtn = this.add
      .rectangle(GAME_WIDTH / 2, 585, 220, 44, isVictory ? 0x059669 : 0x0284c7, 1)
      .setStrokeStyle(2, isVictory ? 0x34d399 : 0x38bdf8, 1)
      .setInteractive({ useHandCursor: true });
    const playLbl = this.add
      .text(GAME_WIDTH / 2, 585, 'PLAY AGAIN', {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '15px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    playBtn.on('pointerdown', () => {
      this.gameOverModal.setVisible(false);
      this.game.events.emit('cmd:restart');
    });

    this.gameOverDynamic.add([
      card,
      title,
      subtitle,
      gradeBadge,
      gradeText,
      ...statNodes,
      playBtn,
      playLbl,
    ]);
    this.gameOverModal.setVisible(true);
  }

  private bindEvents(): void {
    const bus = this.game.events;

    bus.on('ui:state_changed', (state: GameState) => {
      this.syncUI(state);
    });

    bus.on('ui:roll_result', (result: DiceRollResult) => {
      this.showingLogistics = false;
      this.showingCombat = false;
      this.diceOverlay.setVisible(true);
      this.diceOverlay.playRollAnimation(result);
    });

    bus.on('ui:logistics_result', (logistics: LogisticsResult) => {
      this.showingLogistics = true;
      this.showingCombat = false;
      this.updateLogisticsSummary(logistics);
      this.refreshBottomPanels(
        this.registry.get('gameState') as GameState
      );
    });

    bus.on('ui:combat_started', (combat: CombatResult) => {
      this.showingLogistics = false;
      this.showingCombat = true;
      this.updateCombatSummary(combat);
      this.refreshBottomPanels(
        this.registry.get('gameState') as GameState
      );
    });
  }

  private updateLogisticsSummary(logistics: LogisticsResult): void {
    const lines: string[] = [];

    const deliveredEntries = Object.entries(logistics.deliveredToCore).filter(
      ([, amt]) => (amt ?? 0) > 0
    ) as Array<[ResourceType, number]>;

    if (deliveredEntries.length > 0) {
      const summary = deliveredEntries
        .map(([res, amt]) => `+${amt} ${RESOURCE_META[res].name}`)
        .join(', ');
      lines.push(`Delivered to Core: ${summary}`);
    } else {
      lines.push('No raw packets routed to Core this turn.');
    }

    if (logistics.smelts.length > 0) {
      lines.push('');
      lines.push('Refining Executed:');
      for (const sm of logistics.smelts) {
        lines.push(
          `• ${BUILDING_SPECS[sm.buildingType].shortName}: +${sm.amount} ${RESOURCE_META[sm.outputResource].name}`
        );
      }
    }

    if (logistics.strandedVertexIds.length > 0) {
      lines.push('');
      lines.push(
        `⚠ ${logistics.strandedVertexIds.length} node(s) need a conveyor path to Core (or Mk.II upgrade)!`
      );
    }

    this.logisticsBodyText.setText(lines.join('\n'));
  }

  private updateCombatSummary(combat: CombatResult): void {
    const lines: string[] = [];

    if (combat.events.length === 0) {
      lines.push('Perimeter quiet — no enemies spawned or active.');
      this.combatBodyText.setText(lines.join('\n'));
      return;
    }

    if (combat.enemiesSpawned > 0) {
      lines.push(`• Spawned ${combat.enemiesSpawned} hostiles on coastal edge`);
    }

    const fireEvents = combat.events.filter((e) => e.kind === 'turret_fire');
    for (const ev of fireEvents.slice(0, 5)) {
      if (ev.kind !== 'turret_fire') continue;
      const tName = BUILDING_SPECS[ev.turretType].shortName;
      const totalDmg = ev.hits.reduce((s, h) => s + h.damage, 0);
      const crits = ev.hits.filter((h) => h.critState === 'crit').length;
      const jams = ev.hits.filter((h) => h.critState === 'jam').length;
      const kills = ev.hits.filter((h) => h.killed).length;
      const tag =
        crits > 0 ? ' [CRIT!]' : jams > 0 ? ' [JAM]' : '';
      lines.push(
        `• [Rng ${ev.range}] ${tName}: ${totalDmg} DMG${tag}${kills > 0 ? ` (${kills} KO)` : ''}`
      );
    }
    if (fireEvents.length > 5) {
      lines.push(`  ... +${fireEvents.length - 5} more turret volleys`);
    }

    if (combat.coreDamageTaken > 0) {
      lines.push(`⚠ Core took ${combat.coreDamageTaken} DMG! (${combat.coreHpAfter} HP left)`);
    }

    const booms = combat.events.filter(
      (e) => e.kind === 'overclock_roll' && e.exploded
    );
    if (booms.length > 0) {
      lines.push(`💥 ${booms.length} Overclocked building(s) exploded (50 AoE DMG)!`);
    }

    if (combat.enemiesKilled > 0) {
      lines.push(`✓ Eliminated ${combat.enemiesKilled} enemy unit(s)`);
    }

    this.combatBodyText.setText(lines.join('\n'));
  }

  private syncUI(state: GameState): void {
    // Turn counter
    this.turnText.setText(`T ${state.turn}/${state.maxTurns}`);

    // Core HP bar
    const coreBuilding = state.vertices.get(state.coreVertexId)?.building;
    const hp = coreBuilding ? coreBuilding.hp : 0;
    const maxHp = coreBuilding ? coreBuilding.maxHp : BUILDING_SPECS.core.maxHp;
    const pct = Phaser.Math.Clamp(hp / maxHp, 0, 1);

    this.coreHpFill.setDisplaySize(Math.max(0, 92 * pct), 18);
    this.coreHpFill.setFillStyle(
      pct > 0.5 ? 0x10b981 : pct > 0.25 ? 0xf59e0b : 0xf43f5e,
      0.85
    );
    this.coreHpText.setText(`CORE ${hp}/${maxHp}`);

    // Clear transient flags when GameScene finishes animations
    const gameScene = this.scene.get('GameScene') as unknown as {
      isAnimating?: boolean;
    };
    if (gameScene && !gameScene.isAnimating) {
      this.showingLogistics = false;
      this.showingCombat = false;
    }

    // Active phase pills
    const visualPhase: TurnPhase = this.showingLogistics
      ? 'LOGISTICS_AND_SMELT'
      : this.showingCombat
      ? 'WAVE_COMBAT'
      : state.phase;

    for (const [phase, pill] of this.phasePills.entries()) {
      const active = visualPhase === phase;
      pill.bg.setFillStyle(active ? 0x0284c7 : 0x141e30, 1);
      pill.bg.setStrokeStyle(1.2, active ? 0x38bdf8 : 0x334155, 1);
      pill.label.setColor(active ? '#ffffff' : '#64748b');
    }

    // Resource bar values with pop tween on change
    for (const res of ALL_RESOURCES) {
      const val = state.resources[res] ?? 0;
      const prev = this.lastResourceValues.get(res) ?? 0;
      const txt = this.resourceTexts.get(res);
      if (txt) {
        txt.setText(String(val));
        if (val !== prev) {
          this.lastResourceValues.set(res, val);
          this.tweens.add({
            targets: txt,
            scale: 1.35,
            duration: 110,
            yoyo: true,
          });
        }
      }
    }

    this.refreshBottomPanels(state);

    if (state.phase === 'GAME_OVER') {
      this.renderGameOverModal(state);
    } else {
      this.gameOverModal.setVisible(false);
    }
  }

  private refreshBottomPanels(state: GameState): void {
    const showDice =
      state.phase === 'ROLL_AND_HARVEST' ||
      (state.phase === 'LOGISTICS_AND_SMELT' && !this.showingLogistics);
    const showLog = this.showingLogistics;
    const showCombat = this.showingCombat || state.phase === 'WAVE_COMBAT';
    const showBuild =
      state.phase === 'BUILD_AND_GAMBLE' &&
      !this.showingLogistics &&
      !this.showingCombat;

    this.diceOverlay.setVisible(showDice);
    this.logisticsPanel.setVisible(showLog);
    this.buildDrawer.setVisible(showBuild);
    this.combatPanel.setVisible(showCombat);

    if (showDice) {
      this.diceOverlay.sync(state);
    } else if (showBuild) {
      this.buildDrawer.sync(state);
    }
  }
}

import Phaser from 'phaser';
import {
  BUILDING_SPECS,
  CONVEYOR_SPECS,
  DICE_PROBABILITIES,
  EDGE_HIT_THICKNESS,
  ENEMY_SPECS,
  GAME_WIDTH,
  HEX_RADIUS,
  RESOURCE_META,
  TERRAIN_META,
  VERTEX_HIT_RADIUS,
} from '../core/constants';
import { executeWaveCombat } from '../core/CombatEngine';
import {
  buildOnEdge,
  buildOnVertex,
  demolishBuilding,
  executeLogisticsAndSmelt,
  executeRollAndHarvest,
  repairBuilding,
  toggleOverclock,
} from '../core/EconomyEngine';
import {
  createInitialGameState,
  getVerticesWithinRange,
  violatesCatanDistanceRule,
} from '../core/HexBoardGraph';
import type {
  BuildingType,
  CombatEvent,
  ConveyorType,
  GameState,
  MagneticBiasMode,
  ResourceType,
  SelectionTarget,
} from '../core/types';

interface ConveyorArrowSprite {
  sprite: Phaser.GameObjects.Image;
  edgeId: string;
  phase: number;
}

export class GameScene extends Phaser.Scene {
  public state!: GameState;

  private bgGraphics!: Phaser.GameObjects.Graphics;
  private hexLayer!: Phaser.GameObjects.Container;
  private rangeGraphics!: Phaser.GameObjects.Graphics;
  private edgeGraphics!: Phaser.GameObjects.Graphics;
  private arrowLayer!: Phaser.GameObjects.Container;
  private vertexLayer!: Phaser.GameObjects.Container;
  private enemyLayer!: Phaser.GameObjects.Container;
  private fxLayer!: Phaser.GameObjects.Container;
  private floatTextLayer!: Phaser.GameObjects.Container;

  private hexHighlightSprites = new Map<string, Phaser.GameObjects.Image>();
  private conveyorArrows: ConveyorArrowSprite[] = [];
  private enemyVisuals = new Map<string, Phaser.GameObjects.Container>();

  public isAnimating = false;
  private activeTimers: number[] = [];
  private previewRange: number | null = null;

  constructor() {
    super({ key: 'GameScene' });
  }

  create(): void {
    this.bgGraphics = this.add.graphics().setDepth(0);
    this.hexLayer = this.add.container(0, 0).setDepth(10);
    this.rangeGraphics = this.add.graphics().setDepth(15);
    this.edgeGraphics = this.add.graphics().setDepth(20);
    this.arrowLayer = this.add.container(0, 0).setDepth(22);
    this.vertexLayer = this.add.container(0, 0).setDepth(30);
    this.enemyLayer = this.add.container(0, 0).setDepth(40);
    this.fxLayer = this.add.container(0, 0).setDepth(50);
    this.floatTextLayer = this.add.container(0, 0).setDepth(60);

    this.drawBackdrop();
    this.initNewRun();
    this.bindInput();
    this.bindCommands();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.clearActiveTimers();
    });

    // Expose read-only snapshot hook for automated QA verification
    (window as unknown as Record<string, unknown>).__HEXFACTORY__ = {
      getStateSummary: () => ({
        turn: this.state.turn,
        phase: this.state.phase,
        status: this.state.status,
        hexCount: this.state.hexes.size,
        vertexCount: this.state.vertices.size,
        edgeCount: this.state.edges.size,
        coreHp: this.state.vertices.get(this.state.coreVertexId)?.building?.hp ?? 0,
        enemyCount: this.state.enemies.length,
        resources: { ...this.state.resources },
        isAnimating: this.isAnimating,
        selectedTarget: this.state.selectedTarget,
      }),
    };
  }

  update(_time: number, delta: number): void {
    // Animate conveyor directional arrows along every built belt edge
    const dt = delta / 1000;
    for (const item of this.conveyorArrows) {
      const edge = this.state.edges.get(item.edgeId);
      if (!edge || !edge.conveyor) continue;
      const speed = edge.conveyor === 'conveyor_mk2' ? 0.95 : 0.55;
      item.phase = (item.phase + dt * speed) % 1;

      const [fromId, toId] = edge.flowDirection ?? edge.endpoints;
      const vFrom = this.state.vertices.get(fromId)!;
      const vTo = this.state.vertices.get(toId)!;

      const t = 0.18 + item.phase * 0.64;
      item.sprite.setPosition(
        Phaser.Math.Linear(vFrom.x, vTo.x, t),
        Phaser.Math.Linear(vFrom.y, vTo.y, t)
      );
      item.sprite.setRotation(Math.atan2(vTo.y - vFrom.y, vTo.x - vFrom.x));
    }
  }

  private drawBackdrop(): void {
    const g = this.bgGraphics;
    g.clear();
    g.fillStyle(0x0b101b, 1);
    g.fillRect(0, 0, GAME_WIDTH, 844);

    // Subtle tactical blueprint grid across board region (y: 108..552)
    g.lineStyle(1, 0x162238, 0.45);
    for (let x = 15; x < GAME_WIDTH; x += 26) {
      g.lineBetween(x, 108, x, 552);
    }
    for (let y = 112; y <= 550; y += 26) {
      g.lineBetween(0, y, GAME_WIDTH, y);
    }

    // Subtle radial halo behind board center
    g.fillStyle(0x132642, 0.25);
    g.fillCircle(195, 330, 178);
    g.lineStyle(1, 0x1e3a5f, 0.5);
    g.strokeCircle(195, 330, 182);
  }

  private clearActiveTimers(): void {
    for (const id of this.activeTimers) {
      window.clearTimeout(id);
    }
    this.activeTimers = [];
  }

  private schedule(delay: number, callback: () => void): void {
    const id = window.setTimeout(() => {
      if (!this.scene.isActive()) return;
      callback();
    }, delay);
    this.activeTimers.push(id);
  }

  private initNewRun(): void {
    this.clearActiveTimers();
    this.isAnimating = false;
    this.previewRange = null;
    this.state = createInitialGameState();
    this.registry.set('gameState', this.state);

    this.renderHexes();
    this.refreshBoard();
    this.emitStateChanged();
  }

  private bindInput(): void {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      // Only handle touches inside the hex board viewport (y: 108..550)
      if (pointer.y < 108 || pointer.y > 550) return;
      if (this.isAnimating || this.state.phase === 'GAME_OVER') return;

      // Ignore if Help modal is open
      if (this.registry.get('helpModalOpen')) return;

      const hit = this.pickBoardTarget(pointer.x, pointer.y);
      this.state.selectedTarget = hit;
      this.previewRange = null;
      this.refreshSelectionAndRange();
      this.emitStateChanged();
    });
  }

  /**
   * High-ergonomics mobile touch hit-test:
   * 1. Priority to Vertices within VERTEX_HIT_RADIUS (18px)
   * 2. Edges within EDGE_HIT_THICKNESS / 2 (8px perpendicular = 16px wide)
   * 3. Hexes within 0.85 * HEX_RADIUS
   */
  private pickBoardTarget(px: number, py: number): SelectionTarget | null {
    // 1. Check all 54 vertices
    let bestVertexId: string | null = null;
    let bestVDist = VERTEX_HIT_RADIUS;
    for (const v of this.state.vertices.values()) {
      const d = Phaser.Math.Distance.Between(px, py, v.x, v.y);
      if (d <= bestVDist) {
        bestVDist = d;
        bestVertexId = v.id;
      }
    }
    if (bestVertexId) {
      return { kind: 'vertex', id: bestVertexId };
    }

    // 2. Check all 72 edges using exact perpendicular segment distance
    const halfThick = EDGE_HIT_THICKNESS / 2;
    let bestEdgeId: string | null = null;
    let bestEDist = halfThick;
    for (const e of this.state.edges.values()) {
      const dx = e.x2 - e.x1;
      const dy = e.y2 - e.y1;
      const lenSq = dx * dx + dy * dy;
      if (lenSq === 0) continue;
      const t = ((px - e.x1) * dx + (py - e.y1) * dy) / lenSq;
      if (t < 0.05 || t > 0.95) continue;
      const projX = e.x1 + t * dx;
      const projY = e.y1 + t * dy;
      const d = Phaser.Math.Distance.Between(px, py, projX, projY);
      if (d <= bestEDist) {
        bestEDist = d;
        bestEdgeId = e.id;
      }
    }
    if (bestEdgeId) {
      return { kind: 'edge', id: bestEdgeId };
    }

    // 3. Check hex centers
    let bestHexId: string | null = null;
    let bestHDist = HEX_RADIUS * 0.82;
    for (const h of this.state.hexes.values()) {
      const d = Phaser.Math.Distance.Between(px, py, h.x, h.y);
      if (d <= bestHDist) {
        bestHDist = d;
        bestHexId = h.id;
      }
    }
    if (bestHexId) {
      return { kind: 'hex', id: bestHexId };
    }

    return null;
  }

  private bindCommands(): void {
    const bus = this.game.events;

    bus.on('cmd:roll', (biasMode: MagneticBiasMode) => {
      if (this.isAnimating || this.state.phase !== 'ROLL_AND_HARVEST') return;
      this.handleRollAndHarvest(biasMode);
    });

    bus.on('cmd:skip_logistics', () => {
      if (this.state.phase === 'BUILD_AND_GAMBLE' && this.isAnimating) {
        this.clearActiveTimers();
        this.fxLayer.removeAll(true);
        this.isAnimating = false;
        this.refreshBoard();
        this.emitStateChanged();
      }
    });

    bus.on(
      'cmd:build_vertex',
      (payload: { vertexId: string; buildingType: BuildingType }) => {
        if (this.isAnimating || this.state.phase !== 'BUILD_AND_GAMBLE') return;
        const ok = buildOnVertex(
          this.state,
          payload.vertexId,
          payload.buildingType
        );
        if (ok) {
          const v = this.state.vertices.get(payload.vertexId)!;
          this.spawnBuildPulse(v.x, v.y, 0x00e5ff);
          this.spawnFloatingText(
            v.x,
            v.y - 16,
            BUILDING_SPECS[payload.buildingType].shortName.toUpperCase(),
            '#00e5ff'
          );
          this.refreshBoard();
          this.emitStateChanged();
        }
      }
    );

    bus.on(
      'cmd:build_edge',
      (payload: { edgeId: string; conveyorType: ConveyorType }) => {
        if (this.isAnimating || this.state.phase !== 'BUILD_AND_GAMBLE') return;
        const ok = buildOnEdge(this.state, payload.edgeId, payload.conveyorType);
        if (ok) {
          const e = this.state.edges.get(payload.edgeId)!;
          const color =
            payload.conveyorType === 'conveyor_mk2' ? 0x00e5ff : 0xffb703;
          this.spawnBuildPulse(e.mx, e.my, color);
          this.spawnFloatingText(
            e.mx,
            e.my - 12,
            CONVEYOR_SPECS[payload.conveyorType].shortName.toUpperCase(),
            payload.conveyorType === 'conveyor_mk2' ? '#00e5ff' : '#ffb703'
          );
          this.refreshBoard();
          this.emitStateChanged();
        }
      }
    );

    bus.on('cmd:toggle_overclock', (payload: { vertexId: string }) => {
      if (this.isAnimating || this.state.phase !== 'BUILD_AND_GAMBLE') return;
      const ok = toggleOverclock(this.state, payload.vertexId);
      if (ok) {
        const v = this.state.vertices.get(payload.vertexId)!;
        const isOn = v.building?.isOverclocked ?? false;
        this.spawnBuildPulse(v.x, v.y, isOn ? 0xff595e : 0x64748b);
        this.spawnFloatingText(
          v.x,
          v.y - 18,
          isOn ? 'OVERCLOCK ON!' : 'OVERCLOCK OFF',
          isOn ? '#ff9f1c' : '#94a3b8'
        );
        this.refreshBoard();
        this.emitStateChanged();
      }
    });

    bus.on('cmd:repair', (payload: { vertexId: string }) => {
      if (this.isAnimating || this.state.phase !== 'BUILD_AND_GAMBLE') return;
      const ok = repairBuilding(this.state, payload.vertexId);
      if (ok) {
        const v = this.state.vertices.get(payload.vertexId)!;
        this.spawnBuildPulse(v.x, v.y, 0x52b788);
        this.spawnFloatingText(v.x, v.y - 16, '+45 HP', '#52b788');
        this.refreshBoard();
        this.emitStateChanged();
      }
    });

    bus.on('cmd:demolish', (payload: { vertexId: string }) => {
      if (this.isAnimating || this.state.phase !== 'BUILD_AND_GAMBLE') return;
      const ok = demolishBuilding(this.state, payload.vertexId);
      if (ok) {
        const v = this.state.vertices.get(payload.vertexId)!;
        this.spawnBuildPulse(v.x, v.y, 0x94a3b8);
        this.spawnFloatingText(v.x, v.y - 16, 'SALVAGED', '#cbd5e1');
        this.refreshBoard();
        this.emitStateChanged();
      }
    });

    bus.on('cmd:end_build', () => {
      if (this.isAnimating || this.state.phase !== 'BUILD_AND_GAMBLE') return;
      this.handleWaveCombat();
    });

    bus.on('cmd:clear_selection', () => {
      this.state.selectedTarget = null;
      this.previewRange = null;
      this.refreshSelectionAndRange();
      this.emitStateChanged();
    });

    bus.on('cmd:preview_range', (range: number | null) => {
      this.previewRange = range;
      this.refreshSelectionAndRange();
    });

    bus.on('cmd:restart', () => {
      this.fxLayer.removeAll(true);
      this.floatTextLayer.removeAll(true);
      this.initNewRun();
    });
  }

  private renderHexes(): void {
    this.hexLayer.removeAll(true);
    this.hexHighlightSprites.clear();

    for (const hex of this.state.hexes.values()) {
      const tile = this.add.image(hex.x, hex.y, `hex_${hex.terrain}`);
      this.hexLayer.add(tile);
      this.hexHighlightSprites.set(hex.id, tile);

      if (hex.diceNumber !== null) {
        const isHot = hex.diceNumber === 6 || hex.diceNumber === 8;
        const badgeY = hex.y + 11;

        const tokenBg = this.add.circle(
          hex.x,
          badgeY,
          12.5,
          isHot ? 0x260910 : 0x0e1624,
          0.95
        );
        tokenBg.setStrokeStyle(1.6, isHot ? 0xff3b5c : 0x475569, 1);
        this.hexLayer.add(tokenBg);

        const numText = this.add
          .text(hex.x, badgeY - 2, String(hex.diceNumber), {
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: isHot ? '13px' : '12px',
            fontStyle: 'bold',
            color: isHot ? '#ff3b5c' : '#f1f5f9',
          })
          .setOrigin(0.5);
        this.hexLayer.add(numText);

        // Probability pips beneath number
        const pips = DICE_PROBABILITIES[hex.diceNumber]?.pips ?? 1;
        const pipSpacing = 3.2;
        const startX = hex.x - ((pips - 1) * pipSpacing) / 2;
        for (let i = 0; i < pips; i++) {
          const dot = this.add.circle(
            startX + i * pipSpacing,
            badgeY + 7,
            1.1,
            isHot ? 0xff3b5c : 0x94a3b8
          );
          this.hexLayer.add(dot);
        }
      } else {
        // Desert Wasteland subtle label
        const label = this.add
          .text(hex.x, hex.y + 14, 'DESERT', {
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: '7px',
            fontStyle: 'bold',
            color: '#a69478',
          })
          .setOrigin(0.5);
        this.hexLayer.add(label);
      }
    }
  }

  private refreshBoard(): void {
    this.renderEdges();
    this.renderVertices();
    this.renderEnemies();
    this.refreshSelectionAndRange();
  }

  private renderEdges(): void {
    const g = this.edgeGraphics;
    g.clear();
    this.arrowLayer.removeAll(true);
    this.conveyorArrows = [];

    for (const edge of this.state.edges.values()) {
      const isSelected =
        this.state.selectedTarget?.kind === 'edge' &&
        this.state.selectedTarget.id === edge.id;

      if (edge.conveyor === 'conveyor_mk1') {
        g.lineStyle(5, 0x3b2a0a, 1);
        g.lineBetween(edge.x1, edge.y1, edge.x2, edge.y2);
        g.lineStyle(2.5, 0xffb703, 0.95);
        g.lineBetween(edge.x1, edge.y1, edge.x2, edge.y2);

        const arrow = this.add.image(edge.mx, edge.my, 'arrow_mk1').setScale(0.85);
        this.arrowLayer.add(arrow);
        this.conveyorArrows.push({ sprite: arrow, edgeId: edge.id, phase: 0 });
      } else if (edge.conveyor === 'conveyor_mk2') {
        g.lineStyle(6, 0x062d38, 1);
        g.lineBetween(edge.x1, edge.y1, edge.x2, edge.y2);
        g.lineStyle(3, 0x00e5ff, 1);
        g.lineBetween(edge.x1, edge.y1, edge.x2, edge.y2);

        for (const phase of [0, 0.5]) {
          const arrow = this.add
            .image(edge.mx, edge.my, 'arrow_mk2')
            .setScale(0.9);
          this.arrowLayer.add(arrow);
          this.conveyorArrows.push({ sprite: arrow, edgeId: edge.id, phase });
        }
      } else {
        g.lineStyle(1.4, 0x334155, 0.55);
        g.lineBetween(edge.x1, edge.y1, edge.x2, edge.y2);
      }

      if (isSelected) {
        g.lineStyle(8, 0x38bdf8, 0.35);
        g.lineBetween(edge.x1, edge.y1, edge.x2, edge.y2);
        g.lineStyle(2.5, 0xffffff, 0.95);
        g.lineBetween(edge.x1, edge.y1, edge.x2, edge.y2);
      }
    }
  }

  private renderVertices(): void {
    this.vertexLayer.removeAll(true);

    for (const v of this.state.vertices.values()) {
      const isSelected =
        this.state.selectedTarget?.kind === 'vertex' &&
        this.state.selectedTarget.id === v.id;

      if (v.building) {
        const b = v.building;
        // Overclock pulsing aura
        if (b.isOverclocked) {
          const aura = this.add.circle(v.x, v.y, 15, 0xff595e, 0.28);
          aura.setStrokeStyle(1.5, 0xff9f1c, 0.9);
          this.vertexLayer.add(aura);
        }

        const icon = this.add
          .image(v.x, v.y, `bld_${b.type}`)
          .setScale(b.type === 'core' ? 0.95 : 0.8);
        this.vertexLayer.add(icon);

        // Mini HP bar if damaged (or always on Core)
        if (b.hp < b.maxHp || b.type === 'core') {
          const barW = b.type === 'core' ? 28 : 22;
          const pct = Phaser.Math.Clamp(b.hp / b.maxHp, 0, 1);
          const barY = v.y + 15;
          const bg = this.add.rectangle(v.x, barY, barW, 4, 0x090d16, 0.95);
          const fillColor =
            pct > 0.5 ? 0x52b788 : pct > 0.25 ? 0xffb703 : 0xff3b5c;
          const fill = this.add
            .rectangle(
              v.x - barW / 2,
              barY,
              Math.max(1, barW * pct),
              3,
              fillColor,
              1
            )
            .setOrigin(0, 0.5);
          this.vertexLayer.add([bg, fill]);
        }

        // Overclock heat badge
        if (b.isOverclocked) {
          const heatBadge = this.add
            .text(v.x + 11, v.y - 12, `⚡${b.overclockHeat}`, {
              fontFamily: 'Inter, system-ui, sans-serif',
              fontSize: '9px',
              fontStyle: 'bold',
              color: '#ffbe0b',
              backgroundColor: '#3a0a0a',
              padding: { x: 2, y: 1 },
            })
            .setOrigin(0.5);
          this.vertexLayer.add(heatBadge);
        }

        // Buffer indicator if stranded resources await conveyor
        const bufferedTotal = Object.values(v.buffer).reduce(
          (sum, n) => sum + (n ?? 0),
          0
        );
        if (bufferedTotal > 0) {
          const warn = this.add
            .text(v.x - 12, v.y - 12, `!${bufferedTotal}`, {
              fontFamily: 'Inter, system-ui, sans-serif',
              fontSize: '9px',
              fontStyle: 'bold',
              color: '#fbbf24',
              backgroundColor: '#1e1b0a',
              padding: { x: 2, y: 1 },
            })
            .setOrigin(0.5);
          this.vertexLayer.add(warn);
        }
      } else {
        // Subtle empty socket node
        const showStrong = this.state.phase === 'BUILD_AND_GAMBLE';
        const dot = this.add.circle(
          v.x,
          v.y,
          isSelected ? 6 : showStrong ? 4 : 3,
          isSelected
            ? 0x00e5ff
            : v.isCoastal
            ? 0x334155
            : 0x475569,
          isSelected ? 1 : showStrong ? 0.85 : 0.45
        );
        dot.setStrokeStyle(
          1.2,
          isSelected ? 0xffffff : showStrong ? 0x64748b : 0x334155,
          0.9
        );
        this.vertexLayer.add(dot);
      }

      if (isSelected) {
        const ring = this.add.circle(v.x, v.y, 17, 0x00e5ff, 0.14);
        ring.setStrokeStyle(2, 0x00e5ff, 1);
        this.vertexLayer.add(ring);
      }
    }
  }

  private renderEnemies(): void {
    this.enemyLayer.removeAll(true);
    this.enemyVisuals.clear();

    // Group enemies by vertex so stacked enemies fan neatly around the vertex
    const byVertex = new Map<string, typeof this.state.enemies>();
    for (const enemy of this.state.enemies) {
      if (enemy.hp <= 0) continue;
      const list = byVertex.get(enemy.vertexId) ?? [];
      list.push(enemy);
      byVertex.set(enemy.vertexId, list);
    }

    for (const [vid, list] of byVertex.entries()) {
      const v = this.state.vertices.get(vid);
      if (!v) continue;

      list.forEach((enemy, idx) => {
        let ox = 0;
        let oy = 0;
        if (list.length > 1) {
          const angle = (idx / list.length) * Math.PI * 2 - Math.PI / 2;
          ox = Math.cos(angle) * 9;
          oy = Math.sin(angle) * 9;
        } else if (v.building) {
          oy = -11;
        }

        const c = this.add.container(v.x + ox, v.y + oy);
        const sprite = this.add.image(0, 0, `enemy_${enemy.type}`);
        c.add(sprite);

        // Mini HP bar above enemy
        const spec = ENEMY_SPECS[enemy.type];
        const barW = spec.isBoss ? 28 : 18;
        const pct = Phaser.Math.Clamp(enemy.hp / enemy.maxHp, 0, 1);
        const barY = -(spec.radius + 5);
        const bg = this.add.rectangle(0, barY, barW, 3.5, 0x090b12, 0.95);
        const fill = this.add
          .rectangle(
            -barW / 2,
            barY,
            Math.max(1, barW * pct),
            2.5,
            spec.isBoss ? 0xf72585 : 0xff4d6d,
            1
          )
          .setOrigin(0, 0.5);
        c.add([bg, fill]);

        if (spec.isBoss) {
          const tag = this.add
            .text(0, spec.radius + 7, enemy.name.toUpperCase(), {
              fontFamily: 'Inter, system-ui, sans-serif',
              fontSize: '8px',
              fontStyle: 'bold',
              color: '#ff99c8',
              backgroundColor: '#240022',
              padding: { x: 2, y: 1 },
            })
            .setOrigin(0.5);
          c.add(tag);
        }

        this.enemyLayer.add(c);
        this.enemyVisuals.set(enemy.id, c);
      });
    }
  }

  private refreshSelectionAndRange(): void {
    this.renderEdges();
    this.renderVertices();

    const g = this.rangeGraphics;
    g.clear();

    const sel = this.state.selectedTarget;
    if (!sel) return;

    if (sel.kind === 'vertex') {
      const v = this.state.vertices.get(sel.id);
      if (!v) return;

      // Determine range to display: either previewed turret range, or existing turret range
      let rangeToShow = this.previewRange;
      if (rangeToShow === null && v.building) {
        const spec = BUILDING_SPECS[v.building.type];
        if (spec.range !== undefined) {
          rangeToShow = spec.range;
        }
      }

      if (rangeToShow !== null) {
        const pixelRadius =
          rangeToShow === 0
            ? 24
            : rangeToShow === 1
            ? HEX_RADIUS * 1.15
            : HEX_RADIUS * 2.15;

        g.fillStyle(0x00e5ff, 0.08);
        g.fillCircle(v.x, v.y, pixelRadius);
        g.lineStyle(1.8, 0x00e5ff, 0.55);
        g.strokeCircle(v.x, v.y, pixelRadius);

        // Highlight all reachable vertices within exact graph range
        const reachable = getVerticesWithinRange(
          this.state.vertices,
          v.id,
          rangeToShow
        );
        for (const rVid of reachable) {
          if (rVid === v.id && rangeToShow > 0) continue;
          const rv = this.state.vertices.get(rVid)!;
          g.fillStyle(0x00e5ff, 0.25);
          g.fillCircle(rv.x, rv.y, 7);
          g.lineStyle(1.2, 0x00e5ff, 0.7);
          g.strokeCircle(rv.x, rv.y, 7);
        }
      } else if (
        !v.building &&
        violatesCatanDistanceRule(this.state.vertices, v.id)
      ) {
        // Subtle red warning ring if vertex is blocked from Harvester by Catan distance rule
        g.lineStyle(1.5, 0xff595e, 0.45);
        g.strokeCircle(v.x, v.y, 20);
      }
    } else if (sel.kind === 'hex') {
      const hex = this.state.hexes.get(sel.id);
      if (!hex) return;
      g.lineStyle(2.5, 0xf4c430, 0.85);
      g.strokeCircle(hex.x, hex.y, HEX_RADIUS - 4);
    }
  }

  /** Phase 1 -> Phase 2 animated sequence */
  private handleRollAndHarvest(biasMode: MagneticBiasMode): void {
    this.isAnimating = true;
    this.state.selectedTarget = null;
    this.previewRange = null;

    const rollResult = executeRollAndHarvest(this.state, biasMode);
    this.game.events.emit('ui:roll_result', rollResult);
    this.emitStateChanged();

    // After dice land (480ms), flash matching hexes & pop floating +1 icons
    this.schedule(480, () => {
      // Pulse matching hexes
      for (const hex of this.state.hexes.values()) {
        if (hex.diceNumber === rollResult.total) {
          const img = this.hexHighlightSprites.get(hex.id);
          if (img) {
            this.tweens.add({
              targets: img,
              scaleX: 1.08,
              scaleY: 1.08,
              duration: 180,
              yoyo: true,
              repeat: 1,
            });
          }
          const glow = this.add.circle(
            hex.x,
            hex.y,
            HEX_RADIUS * 0.7,
            TERRAIN_META[hex.terrain].accentColor,
            0.35
          );
          this.fxLayer.add(glow);
          this.tweens.add({
            targets: glow,
            alpha: 0,
            scale: 1.35,
            duration: 520,
            onComplete: () => glow.destroy(),
          });
        }
      }

      // Floating +1 resource popups on Harvester Nodes / Core Siphon
      rollResult.harvestEvents.forEach((ev, idx) => {
        const v = this.state.vertices.get(ev.vertexId);
        if (!v) return;
        const meta = RESOURCE_META[ev.resource];
        const yOff = -14 - (idx % 3) * 14;
        const label = ev.isCoreSiphon
          ? `+${ev.amount} ${meta.short} (CORE)`
          : `+${ev.amount} ${meta.short}${ev.isOverclocked ? ' ⚡' : ''}`;
        this.spawnFloatingText(v.x, v.y + yOff, label, meta.hex);
      });

      if (rollResult.harvestEvents.length === 0) {
        this.spawnFloatingText(
          195,
          330,
          `ROLLED ${rollResult.total} — NO HARVEST`,
          '#94a3b8'
        );
      }

      this.refreshBoard();
    });

    // Trigger Phase 2 Logistics & Smelting
    this.schedule(1050, () => {
      const logistics = executeLogisticsAndSmelt(this.state);
      this.game.events.emit('ui:logistics_result', logistics);
      this.emitStateChanged();

      if (logistics.packets.length === 0 && logistics.smelts.length === 0) {
        this.schedule(350, () => {
          this.isAnimating = false;
          this.refreshBoard();
          this.emitStateChanged();
        });
        return;
      }

      // Animate resource packets sliding along conveyor edges
      let maxDuration = 420;
      logistics.packets.forEach((pkt, idx) => {
        const startDelay = idx * 90;
        const hopDuration = 220;
        const totalPktDuration =
          startDelay + Math.max(1, pkt.pathVertexIds.length - 1) * hopDuration;
        if (totalPktDuration > maxDuration) maxDuration = totalPktDuration;

        this.schedule(startDelay, () => {
          this.animateResourcePacket(pkt.resource, pkt.pathVertexIds, hopDuration);
        });
      });

      // Floating smelt popups at refineries
      logistics.smelts.forEach((sm, idx) => {
        const v = this.state.vertices.get(sm.vertexId);
        if (!v) return;
        const meta = RESOURCE_META[sm.outputResource];
        this.schedule(180 + idx * 130, () => {
          this.spawnBuildPulse(v.x, v.y, meta.color);
          this.spawnFloatingText(
            v.x,
            v.y - 18,
            `SMELT +${sm.amount} ${meta.short}`,
            meta.hex
          );
        });
      });

      this.schedule(Math.min(maxDuration + 260, 1450), () => {
        this.isAnimating = false;
        this.refreshBoard();
        this.emitStateChanged();
      });
    });
  }

  private animateResourcePacket(
    resource: ResourceType,
    pathVertexIds: string[],
    hopDuration: number
  ): void {
    if (pathVertexIds.length < 2) return;
    const startV = this.state.vertices.get(pathVertexIds[0]);
    if (!startV) return;

    const meta = RESOURCE_META[resource];
    const dot = this.add.container(startV.x, startV.y);
    const glow = this.add.image(0, 0, 'glow_dot').setTint(meta.color).setScale(0.95);
    const icon = this.add.image(0, 0, `res_${resource}`).setScale(0.75);
    dot.add([glow, icon]);
    this.fxLayer.add(dot);

    const stepAlong = (index: number) => {
      if (index >= pathVertexIds.length) {
        this.tweens.add({
          targets: dot,
          scale: 1.4,
          alpha: 0,
          duration: 140,
          onComplete: () => dot.destroy(),
        });
        return;
      }
      const targetV = this.state.vertices.get(pathVertexIds[index]);
      if (!targetV) {
        dot.destroy();
        return;
      }
      this.tweens.add({
        targets: dot,
        x: targetV.x,
        y: targetV.y,
        duration: hopDuration,
        ease: 'Sine.easeInOut',
        onComplete: () => stepAlong(index + 1),
      });
    };

    stepAlong(1);
  }

  /** Phase 4 Wave Combat sequenced animation */
  private handleWaveCombat(): void {
    this.isAnimating = true;
    this.state.selectedTarget = null;
    this.previewRange = null;
    this.state.phase = 'WAVE_COMBAT';
    this.refreshSelectionAndRange();
    this.emitStateChanged();

    const combatResult = executeWaveCombat(this.state);
    this.game.events.emit('ui:combat_started', combatResult);

    // Grace turn / empty combat fast resolution
    if (combatResult.events.length === 0) {
      this.spawnFloatingText(195, 320, 'PERIMETER CLEAR', '#52b788');
      this.schedule(600, () => {
        this.isAnimating = false;
        this.refreshBoard();
        this.emitStateChanged();
      });
      return;
    }

    // Play combat events in brisk rhythmic timeline
    const spawns = combatResult.events.filter((e) => e.kind === 'spawn');
    const moves = combatResult.events.filter((e) => e.kind === 'move');
    const fires = combatResult.events.filter((e) => e.kind === 'turret_fire');
    const attacks = combatResult.events.filter((e) => e.kind === 'enemy_attack');
    const overclocks = combatResult.events.filter(
      (e) => e.kind === 'overclock_roll'
    );

    let cursorMs = 50;

    if (spawns.length > 0) {
      this.schedule(cursorMs, () => {
        for (const ev of spawns) {
          if (ev.kind !== 'spawn') continue;
          const v = this.state.vertices.get(ev.vertexId);
          if (!v) continue;
          this.spawnBuildPulse(v.x, v.y, ev.isBoss ? 0xf72585 : 0xff595e);
          if (ev.isBoss) {
            this.spawnFloatingText(
              v.x,
              v.y - 18,
              `BOSS: ${ev.enemyName.toUpperCase()}!`,
              '#ff4d6d'
            );
          }
        }
      });
      cursorMs += 260;
    }

    if (moves.length > 0) {
      this.schedule(cursorMs, () => {
        for (const ev of moves) {
          if (ev.kind !== 'move') continue;
          const vFrom = this.state.vertices.get(ev.fromVertexId);
          const vTo = this.state.vertices.get(ev.toVertexId);
          if (!vFrom || !vTo) continue;
          const trail = this.add.graphics();
          trail.lineStyle(2, 0xff595e, 0.45);
          trail.lineBetween(vFrom.x, vFrom.y, vTo.x, vTo.y);
          this.fxLayer.add(trail);
          this.tweens.add({
            targets: trail,
            alpha: 0,
            duration: 320,
            onComplete: () => trail.destroy(),
          });
        }
      });
      cursorMs += 220;
    }

    // Turret firing VFX (already sorted by range 2 -> 1 -> 0)
    fires.forEach((ev) => {
      if (ev.kind !== 'turret_fire') return;
      this.schedule(cursorMs, () => {
        this.playTurretFireVfx(ev);
      });
      cursorMs += 150;
    });

    if (attacks.length > 0) {
      this.schedule(cursorMs, () => {
        let hitCore = false;
        for (const ev of attacks) {
          if (ev.kind !== 'enemy_attack') continue;
          const vFrom = this.state.vertices.get(ev.enemyVertexId);
          const vTo = this.state.vertices.get(ev.targetVertexId);
          if (!vFrom || !vTo) continue;
          if (ev.targetBuildingType === 'core') hitCore = true;

          this.spawnBuildPulse(vTo.x, vTo.y, 0xff3b5c);
          this.spawnFloatingText(
            vTo.x,
            vTo.y - 14,
            ev.destroyed
              ? `-${ev.damage} DESTROYED!`
              : `-${ev.damage}`,
            '#ff3b5c'
          );
        }
        if (hitCore) {
          this.cameras.main.shake(180, 0.009);
        }
      });
      cursorMs += 280;
    }

    if (overclocks.length > 0) {
      this.schedule(cursorMs, () => {
        for (const ev of overclocks) {
          if (ev.kind !== 'overclock_roll') continue;
          const v = this.state.vertices.get(ev.vertexId);
          if (!v) continue;
          if (ev.exploded) {
            this.cameras.main.shake(220, 0.012);
            const blast = this.add.circle(v.x, v.y, 12, 0xff595e, 0.65);
            blast.setStrokeStyle(3, 0xffbe0b, 1);
            this.fxLayer.add(blast);
            this.tweens.add({
              targets: blast,
              scale: 4.5,
              alpha: 0,
              duration: 420,
              onComplete: () => blast.destroy(),
            });
            this.spawnFloatingText(
              v.x,
              v.y - 20,
              `BOOM! -${ev.damage} (${ev.roll1d6}/${ev.thresholdK})`,
              '#ffbe0b'
            );
          } else {
            this.spawnFloatingText(
              v.x,
              v.y - 16,
              `OC SAFE (${ev.roll1d6}>${ev.thresholdK})`,
              '#fde047'
            );
          }
        }
      });
      cursorMs += 320;
    }

    // Finalize board state & notify UI
    this.schedule(Math.min(cursorMs + 220, 2200), () => {
      this.isAnimating = false;
      this.refreshBoard();
      this.emitStateChanged();
    });
  }

  private playTurretFireVfx(
    ev: Extract<CombatEvent, { kind: 'turret_fire' }>
  ): void {
    const vSrc = this.state.vertices.get(ev.turretVertexId);
    const vDst = this.state.vertices.get(ev.targetVertexId);
    if (!vSrc || !vDst) return;

    const beamColor =
      ev.turretType === 'lancer'
        ? 0x00e5ff
        : ev.turretType === 'meltdown'
        ? 0xf15bb5
        : ev.turretType === 'scorch'
        ? 0xff595e
        : 0xffbe0b;

    const g = this.add.graphics();
    this.fxLayer.add(g);

    if (ev.isLine && ev.lineVertexIds && ev.lineVertexIds.length >= 2) {
      g.lineStyle(5, beamColor, 0.35);
      g.beginPath();
      ev.lineVertexIds.forEach((vid, i) => {
        const pt = this.state.vertices.get(vid)!;
        if (i === 0) g.moveTo(pt.x, pt.y);
        else g.lineTo(pt.x, pt.y);
      });
      g.strokePath();

      g.lineStyle(2, 0xffffff, 0.95);
      g.beginPath();
      ev.lineVertexIds.forEach((vid, i) => {
        const pt = this.state.vertices.get(vid)!;
        if (i === 0) g.moveTo(pt.x, pt.y);
        else g.lineTo(pt.x, pt.y);
      });
      g.strokePath();
    } else if (ev.turretType === 'scorch') {
      const ring = this.add.circle(vSrc.x, vSrc.y, 10, 0xff595e, 0.45);
      ring.setStrokeStyle(2.5, 0xffbe0b, 1);
      this.fxLayer.add(ring);
      this.tweens.add({
        targets: ring,
        scale: 2.6,
        alpha: 0,
        duration: 280,
        onComplete: () => ring.destroy(),
      });
    } else {
      // Beam / projectile line from turret to target
      g.lineStyle(ev.turretType === 'meltdown' ? 6 : 2.5, beamColor, 0.9);
      g.lineBetween(vSrc.x, vSrc.y, vDst.x, vDst.y);
      if (ev.isAoE) {
        const blast = this.add.circle(vDst.x, vDst.y, 8, beamColor, 0.45);
        this.fxLayer.add(blast);
        this.tweens.add({
          targets: blast,
          scale: 2.5,
          alpha: 0,
          duration: 300,
          onComplete: () => blast.destroy(),
        });
      }
    }

    this.tweens.add({
      targets: g,
      alpha: 0,
      duration: 260,
      onComplete: () => g.destroy(),
    });

    // Floating damage numbers with CRIT / JAM callouts
    ev.hits.forEach((hit, idx) => {
      const hv = this.state.vertices.get(hit.enemyVertexId);
      if (!hv) return;
      const prefix =
        hit.critState === 'crit'
          ? 'CRIT! '
          : hit.critState === 'jam'
          ? 'JAM '
          : '';
      const color =
        hit.critState === 'crit'
          ? '#ffbe0b'
          : hit.critState === 'jam'
          ? '#94a3b8'
          : '#ffffff';
      this.spawnFloatingText(
        hv.x + (idx % 2 === 0 ? -4 : 4),
        hv.y - 12 - idx * 12,
        `${prefix}-${hit.damage}${hit.killed ? ' ✕' : ''}`,
        color
      );
    });
  }

  private spawnBuildPulse(x: number, y: number, color: number): void {
    const circle = this.add.circle(x, y, 8, color, 0.4);
    circle.setStrokeStyle(2, color, 1);
    this.fxLayer.add(circle);
    this.tweens.add({
      targets: circle,
      scale: 2.4,
      alpha: 0,
      duration: 300,
      onComplete: () => circle.destroy(),
    });
  }

  private spawnFloatingText(
    x: number,
    y: number,
    msg: string,
    color: string
  ): void {
    const txt = this.add
      .text(Phaser.Math.Clamp(x, 45, GAME_WIDTH - 45), y, msg, {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '11px',
        fontStyle: 'bold',
        color,
        stroke: '#070a10',
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    this.floatTextLayer.add(txt);

    this.tweens.add({
      targets: txt,
      y: y - 24,
      alpha: 0,
      duration: 820,
      ease: 'Cubic.easeOut',
      onComplete: () => txt.destroy(),
    });
  }

  private emitStateChanged(): void {
    this.registry.set('gameState', this.state);
    this.game.events.emit('ui:state_changed', this.state);
  }
}

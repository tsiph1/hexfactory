import Phaser from 'phaser';
import {
  BUILDING_SPECS,
  CONVEYOR_SPECS,
  DEFENSE_BUILD_LIST,
  DICE_PROBABILITIES,
  ENEMY_SPECS,
  GAME_WIDTH,
  INDUSTRY_BUILD_LIST,
  RESOURCE_META,
  TERRAIN_META,
  WAVE_CURVE,
} from '../core/constants';
import {
  canBuildOnEdge,
  canBuildOnVertex,
  canRepairBuilding,
} from '../core/EconomyEngine';
import type {
  BuildingType,
  ConveyorType,
  GameState,
  ResourceCost,
  ResourceType,
} from '../core/types';

export class BuildDrawer extends Phaser.GameObjects.Container {
  private activeTab: 'industry' | 'defense' = 'industry';
  private dynamicLayer: Phaser.GameObjects.Container;
  private endBuildBg!: Phaser.GameObjects.Rectangle;
  private endBuildLabel!: Phaser.GameObjects.Text;
  private latestState: GameState | null = null;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 554);
    this.dynamicLayer = scene.add.container(0, 0);
    this.buildShell();
    scene.add.existing(this);
  }

  private buildShell(): void {
    const panelBg = this.scene.add
      .rectangle(GAME_WIDTH / 2, 145, GAME_WIDTH - 14, 280, 0x111827, 0.97)
      .setStrokeStyle(1.5, 0x26354d, 1);
    this.add(panelBg);
    this.add(this.dynamicLayer);

    // Persistent bottom CTA button: End Build Phase -> Wave Combat
    this.endBuildBg = this.scene.add
      .rectangle(GAME_WIDTH / 2, 260, GAME_WIDTH - 30, 38, 0xd97706, 1)
      .setStrokeStyle(1.8, 0xfbbf24, 1)
      .setInteractive({ useHandCursor: true });

    this.endBuildLabel = this.scene.add
      .text(GAME_WIDTH / 2, 260, 'END BUILD → WAVE COMBAT', {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '13px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    this.endBuildBg.on('pointerdown', () => {
      this.scene.game.events.emit('cmd:end_build');
    });

    this.add([this.endBuildBg, this.endBuildLabel]);
  }

  public sync(state: GameState): void {
    this.latestState = state;
    this.dynamicLayer.removeAll(true);

    // Update persistent End Build button label based on wave
    const wave = WAVE_CURVE.find((w) => w.turn === state.turn);
    if (wave && wave.entries.length === 0) {
      this.endBuildLabel.setText(`END BUILD → NEXT TURN (GRACE ${state.turn}/2)`);
      this.endBuildBg
        .setFillStyle(0x059669, 1)
        .setStrokeStyle(1.8, 0x34d399, 1);
    } else if (wave?.isBossWave) {
      this.endBuildLabel.setText(`END BUILD → ⚠ ${wave.label}`);
      this.endBuildBg
        .setFillStyle(0xbe123c, 1)
        .setStrokeStyle(1.8, 0xfb7185, 1);
    } else {
      this.endBuildLabel.setText(`END BUILD → WAVE ${state.turn}`);
      this.endBuildBg
        .setFillStyle(0xd97706, 1)
        .setStrokeStyle(1.8, 0xfbbf24, 1);
    }

    const sel = state.selectedTarget;
    if (!sel) {
      this.renderOverview(state);
      return;
    }

    if (sel.kind === 'vertex') {
      const v = state.vertices.get(sel.id);
      if (!v) {
        this.renderOverview(state);
        return;
      }
      if (v.building) {
        this.renderOccupiedVertex(state, v.id);
      } else {
        this.renderEmptyVertex(state, v.id);
      }
    } else if (sel.kind === 'edge') {
      this.renderEdgeBuilder(state, sel.id);
    } else {
      this.renderHexInspector(state, sel.id);
    }
  }

  private renderHeader(title: string, subtitle: string, showClose = true): void {
    const bar = this.scene.add.rectangle(
      GAME_WIDTH / 2,
      21,
      GAME_WIDTH - 24,
      28,
      0x182336,
      1
    );
    const titleTxt = this.scene.add
      .text(22, 16, title, {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '11.5px',
        fontStyle: 'bold',
        color: '#f8fafc',
      })
      .setOrigin(0, 0.5);

    const subTxt = this.scene.add
      .text(22, 28, subtitle, {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '9px',
        color: '#94a3b8',
      })
      .setOrigin(0, 0.5);

    this.dynamicLayer.add([bar, titleTxt, subTxt]);

    if (showClose) {
      const closeBg = this.scene.add
        .rectangle(GAME_WIDTH - 28, 21, 24, 22, 0x26354d, 1)
        .setStrokeStyle(1, 0x475569, 1)
        .setInteractive({ useHandCursor: true });
      const closeTxt = this.scene.add
        .text(GAME_WIDTH - 28, 21, '✕', {
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: '11px',
          fontStyle: 'bold',
          color: '#e2e8f0',
        })
        .setOrigin(0.5);
      closeBg.on('pointerdown', () => {
        this.scene.game.events.emit('cmd:clear_selection');
      });
      this.dynamicLayer.add([closeBg, closeTxt]);
    }
  }

  private renderOverview(state: GameState): void {
    this.renderHeader(
      'PHASE 3: BUILD & GAMBLE',
      'Tap any Vertex (○) to build structures or Edge (—) for conveyors',
      false
    );

    // Count active structures
    let harvesters = 0;
    let refineries = 0;
    let turrets = 0;
    let overclocked = 0;
    let belts = 0;
    for (const v of state.vertices.values()) {
      const b = v.building;
      if (!b) continue;
      if (b.type === 'harvester' || b.type === 'drill_rig') harvesters++;
      else if (
        b.type === 'smelter_kiln' ||
        b.type === 'aether_reactor' ||
        b.type === 'arc_furnace'
      )
        refineries++;
      else if (b.category === 'defense') turrets++;
      if (b.isOverclocked) overclocked++;
    }
    for (const e of state.edges.values()) {
      if (e.conveyor) belts++;
    }

    // 4 compact stat tiles
    const stats = [
      { label: 'HARVESTERS', val: `${harvesters}`, color: '#52b788' },
      { label: 'REFINERIES', val: `${refineries}`, color: '#f77f00' },
      { label: 'DEFENSES', val: `${turrets}`, color: '#38bdf8' },
      { label: 'CONVEYORS', val: `${belts}`, color: '#ffb703' },
    ];

    stats.forEach((s, i) => {
      const x = 58 + i * 91;
      const box = this.scene.add
        .rectangle(x, 76, 84, 52, 0x0f172a, 1)
        .setStrokeStyle(1, 0x1e293b, 1);
      const valTxt = this.scene.add
        .text(x, 68, s.val, {
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: '18px',
          fontStyle: 'bold',
          color: s.color,
        })
        .setOrigin(0.5);
      const lblTxt = this.scene.add
        .text(x, 89, s.label, {
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: '8px',
          fontStyle: 'bold',
          color: '#94a3b8',
        })
        .setOrigin(0.5);
      this.dynamicLayer.add([box, valTxt, lblTxt]);
    });

    // Upcoming Wave Intel card
    const wave = WAVE_CURVE.find((w) => w.turn === state.turn);
    const waveBox = this.scene.add
      .rectangle(GAME_WIDTH / 2, 152, GAME_WIDTH - 28, 76, 0x0f172a, 1)
      .setStrokeStyle(1.2, wave?.isBossWave ? 0xf43f5e : 0x334155, 1);
    this.dynamicLayer.add(waveBox);

    const waveTitle = wave
      ? `INCOMING TURN ${state.turn} WAVE · ${wave.label.toUpperCase()}`
      : 'INCOMING WAVE';
    const waveDesc =
      wave && wave.entries.length > 0
        ? wave.entries
            .map((e) => {
              const sp = ENEMY_SPECS[e.type];
              return `${e.count}x ${sp.name} (${sp.maxHp}HP/${sp.armor}ARM)`;
            })
            .join('  ·  ')
        : 'No enemies spawn this turn. Expand Harvesters, Belts & Smelters!';

    const activeEnemiesNote =
      state.enemies.length > 0
        ? `Active Enemies on Board: ${state.enemies.length}   |   Overclocked: ${overclocked}`
        : `Active Overclocked Buildings: ${overclocked}   |   Tap any building to toggle ⚡`;

    this.dynamicLayer.add([
      this.scene.add
        .text(26, 128, waveTitle, {
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: '10px',
          fontStyle: 'bold',
          color: wave?.isBossWave ? '#fb7185' : '#fbbf24',
        })
        .setOrigin(0, 0.5),
      this.scene.add
        .text(26, 150, waveDesc, {
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: '10px',
          color: '#e2e8f0',
          wordWrap: { width: GAME_WIDTH - 52 },
        })
        .setOrigin(0, 0.5),
      this.scene.add
        .text(26, 176, activeEnemiesNote, {
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: '9.5px',
          color: '#94a3b8',
        })
        .setOrigin(0, 0.5),
    ]);

    // Quick hint row
    this.dynamicLayer.add(
      this.scene.add
        .text(
          GAME_WIDTH / 2,
          212,
          'Tip: Connect Harvesters & Refineries to Core with Conveyors!',
          {
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: '10px',
            color: '#38bdf8',
          }
        )
        .setOrigin(0.5)
    );
  }

  private renderEmptyVertex(state: GameState, vertexId: string): void {
    const v = state.vertices.get(vertexId)!;
    const adjSummary = v.adjacentHexes
      .map((hid) => {
        const h = state.hexes.get(hid)!;
        const name = TERRAIN_META[h.terrain].name;
        return h.diceNumber ? `${name}(${h.diceNumber})` : name;
      })
      .join(' · ');

    this.renderHeader(
      `BUILD ON VERTEX ${v.isCoastal ? '(COASTAL)' : '(INTERIOR)'}`,
      adjSummary
    );

    // Category tabs: INDUSTRY | DEFENSE
    const tabs: Array<{ id: 'industry' | 'defense'; label: string; x: number }> = [
      { id: 'industry', label: 'INDUSTRY (5)', x: 103 },
      { id: 'defense', label: 'DEFENSE (5)', x: 287 },
    ];
    for (const tab of tabs) {
      const active = this.activeTab === tab.id;
      const bg = this.scene.add
        .rectangle(tab.x, 52, 174, 24, active ? 0x0369a1 : 0x162033, 1)
        .setStrokeStyle(1.2, active ? 0x38bdf8 : 0x334155, 1)
        .setInteractive({ useHandCursor: true });
      const txt = this.scene.add
        .text(tab.x, 52, tab.label, {
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: '10.5px',
          fontStyle: 'bold',
          color: active ? '#ffffff' : '#94a3b8',
        })
        .setOrigin(0.5);
      bg.on('pointerdown', () => {
        this.activeTab = tab.id;
        this.scene.game.events.emit('cmd:preview_range', null);
        if (this.latestState) this.sync(this.latestState);
      });
      this.dynamicLayer.add([bg, txt]);
    }

    // 5 build cards in a crisp 2-column grid (2 + 2 + 1 full-width bottom card)
    const list =
      this.activeTab === 'industry' ? INDUSTRY_BUILD_LIST : DEFENSE_BUILD_LIST;

    list.forEach((bType, idx) => {
      const isLastWide = idx === 4;
      const col = idx % 2;
      const row = Math.floor(idx / 2);

      const cardW = isLastWide ? GAME_WIDTH - 30 : 176;
      const cardH = 50;
      const cx = isLastWide ? GAME_WIDTH / 2 : col === 0 ? 103 : 287;
      const cy = 94 + row * 54;

      this.renderBuildCard(state, vertexId, bType, cx, cy, cardW, cardH);
    });
  }

  private renderBuildCard(
    state: GameState,
    vertexId: string,
    bType: BuildingType,
    cx: number,
    cy: number,
    w: number,
    h: number
  ): void {
    const spec = BUILDING_SPECS[bType];
    const check = canBuildOnVertex(state, vertexId, bType);

    const bg = this.scene.add
      .rectangle(
        cx,
        cy,
        w,
        h,
        check.allowed ? 0x142238 : 0x0d1320,
        1
      )
      .setStrokeStyle(
        1.3,
        check.allowed ? 0x38bdf8 : 0x263245,
        1
      )
      .setInteractive({ useHandCursor: true });

    const left = cx - w / 2;

    const icon = this.scene.add
      .image(left + 20, cy, `bld_${bType}`)
      .setScale(0.75)
      .setAlpha(check.allowed ? 1 : 0.45);

    const nameTxt = this.scene.add
      .text(left + 38, cy - 15, spec.shortName, {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '10.5px',
        fontStyle: 'bold',
        color: check.allowed ? '#f8fafc' : '#64748b',
      })
      .setOrigin(0, 0.5);

    // Compact stat summary
    const statStr = this.compactBuildingStat(bType);
    const statTxt = this.scene.add
      .text(left + 38, cy - 2, statStr, {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '8.5px',
        color: check.allowed ? '#94a3b8' : '#475569',
      })
      .setOrigin(0, 0.5);

    // Cost line or block reason
    const costStr =
      check.reason && check.reason.startsWith('Distance')
        ? '✕ DIST RULE (Adj. Node)'
        : this.formatCostString(spec.cost);

    const costColor =
      check.reason && check.reason.startsWith('Distance')
        ? '#f43f5e'
        : check.allowed
        ? '#34d399'
        : '#f87171';

    const costTxt = this.scene.add
      .text(left + 38, cy + 13, costStr, {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '8.5px',
        fontStyle: 'bold',
        color: costColor,
      })
      .setOrigin(0, 0.5);

    bg.on('pointerover', () => {
      if (spec.range !== undefined) {
        this.scene.game.events.emit('cmd:preview_range', spec.range);
      }
    });

    bg.on('pointerdown', () => {
      if (check.allowed) {
        this.scene.game.events.emit('cmd:preview_range', null);
        this.scene.game.events.emit('cmd:build_vertex', {
          vertexId,
          buildingType: bType,
        });
      } else if (spec.range !== undefined) {
        // Let mobile player preview turret range even before they can afford it
        this.scene.game.events.emit('cmd:preview_range', spec.range);
      }
    });

    this.dynamicLayer.add([bg, icon, nameTxt, statTxt, costTxt]);
  }

  private renderOccupiedVertex(state: GameState, vertexId: string): void {
    const v = state.vertices.get(vertexId)!;
    const b = v.building!;
    const spec = BUILDING_SPECS[b.type];

    this.renderHeader(
      `${spec.name.toUpperCase()}  ·  ${b.hp}/${b.maxHp} HP`,
      spec.description
    );

    // Info card with icon, HP bar, and stat badge
    const infoBox = this.scene.add
      .rectangle(GAME_WIDTH / 2, 74, GAME_WIDTH - 28, 62, 0x0f172a, 1)
      .setStrokeStyle(1.2, b.isOverclocked ? 0xff9f1c : 0x334155, 1);

    const icon = this.scene.add.image(44, 74, `bld_${b.type}`).setScale(1.1);
    const statLine = this.scene.add
      .text(72, 60, this.compactBuildingStat(b.type) || 'Central Command Hub', {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#38bdf8',
      })
      .setOrigin(0, 0.5);

    const statusLine = this.scene.add
      .text(
        72,
        78,
        b.isOverclocked
          ? `⚡ OVERCLOCKED (+100% Output/Fire) · Risk: ${b.overclockHeat}/6 BOOM (50 DMG)`
          : spec.canOverclock
          ? 'Standard Operation · Toggle Overclock below for +100% boost'
          : 'Core / Static Structure',
        {
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: '9px',
          color: b.isOverclocked ? '#ffbe0b' : '#94a3b8',
          wordWrap: { width: GAME_WIDTH - 92 },
        }
      )
      .setOrigin(0, 0.5);

    this.dynamicLayer.add([infoBox, icon, statLine, statusLine]);

    // Action buttons grid (y: 132 & 186)
    let nextRowY = 132;

    if (spec.canOverclock) {
      const ocOn = b.isOverclocked;
      const ocBg = this.scene.add
        .rectangle(
          GAME_WIDTH / 2,
          nextRowY,
          GAME_WIDTH - 28,
          42,
          ocOn ? 0x7c2d12 : 0x1e293b,
          1
        )
        .setStrokeStyle(1.6, ocOn ? 0xff9f1c : 0x475569, 1)
        .setInteractive({ useHandCursor: true });

      const ocLbl = this.scene.add
        .text(
          GAME_WIDTH / 2,
          nextRowY - 6,
          ocOn
            ? `🔥 OVERCLOCK ACTIVE — TAP TO COOL DOWN`
            : `⚡ ENABLE OVERCLOCK (+100% OUTPUT / FIRE RATE)`,
          {
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: '11px',
            fontStyle: 'bold',
            color: ocOn ? '#ffbe0b' : '#f8fafc',
          }
        )
        .setOrigin(0.5);

      const ocSub = this.scene.add
        .text(
          GAME_WIDTH / 2,
          nextRowY + 10,
          ocOn
            ? `End-of-turn explosion roll: ${b.overclockHeat}/6 (50 self & adj. DMG)`
            : 'Starts at 1/6 end-of-turn explosion risk (+1/6 each turn active)',
          {
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: '8.5px',
            color: ocOn ? '#fed7aa' : '#94a3b8',
          }
        )
        .setOrigin(0.5);

      ocBg.on('pointerdown', () => {
        this.scene.game.events.emit('cmd:toggle_overclock', { vertexId });
      });

      this.dynamicLayer.add([ocBg, ocLbl, ocSub]);
      nextRowY += 54;
    }

    // Secondary actions row: Upgrade (if Harvester), Repair (if damaged), Demolish (if non-Core)
    const buttons: Array<{
      label: string;
      sub: string;
      enabled: boolean;
      fill: number;
      stroke: number;
      onClick: () => void;
    }> = [];

    if (b.type === 'harvester') {
      const upCheck = canBuildOnVertex(state, vertexId, 'drill_rig');
      buttons.push({
        label: 'UPGRADE → DRILL RIG',
        sub: '2 STL, 1 BRK (+2 yield)',
        enabled: upCheck.allowed,
        fill: 0x065f46,
        stroke: 0x34d399,
        onClick: () =>
          this.scene.game.events.emit('cmd:build_vertex', {
            vertexId,
            buildingType: 'drill_rig',
          }),
      });
    }

    if (b.hp < b.maxHp) {
      const repCheck = canRepairBuilding(state, vertexId);
      buttons.push({
        label: 'REPAIR (+45 HP)',
        sub: '1 BRK',
        enabled: repCheck.allowed,
        fill: 0x0369a1,
        stroke: 0x38bdf8,
        onClick: () => this.scene.game.events.emit('cmd:repair', { vertexId }),
      });
    }

    if (b.type !== 'core') {
      buttons.push({
        label: 'SALVAGE',
        sub: '50% refund',
        enabled: true,
        fill: 0x3f1d28,
        stroke: 0xf43f5e,
        onClick: () =>
          this.scene.game.events.emit('cmd:demolish', { vertexId }),
      });
    }

    if (buttons.length > 0) {
      const gap = 8;
      const totalW = GAME_WIDTH - 28;
      const btnW = (totalW - gap * (buttons.length - 1)) / buttons.length;
      const startX = 14 + btnW / 2;

      buttons.forEach((btn, idx) => {
        const bx = startX + idx * (btnW + gap);
        const bg = this.scene.add
          .rectangle(
            bx,
            nextRowY,
            btnW,
            40,
            btn.enabled ? btn.fill : 0x111827,
            1
          )
          .setStrokeStyle(1.3, btn.enabled ? btn.stroke : 0x334155, 1)
          .setInteractive({ useHandCursor: true });

        const lbl = this.scene.add
          .text(bx, nextRowY - 6, btn.label, {
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: '10px',
            fontStyle: 'bold',
            color: btn.enabled ? '#ffffff' : '#64748b',
          })
          .setOrigin(0.5);

        const sub = this.scene.add
          .text(bx, nextRowY + 9, btn.sub, {
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: '8.5px',
            color: btn.enabled ? '#e2e8f0' : '#475569',
          })
          .setOrigin(0.5);

        if (btn.enabled) {
          bg.on('pointerdown', btn.onClick);
        }

        this.dynamicLayer.add([bg, lbl, sub]);
      });
    }
  }

  private renderEdgeBuilder(state: GameState, edgeId: string): void {
    const edge = state.edges.get(edgeId);
    if (!edge) {
      this.renderOverview(state);
      return;
    }

    const currStatus = edge.conveyor
      ? `Installed: ${CONVEYOR_SPECS[edge.conveyor].name}`
      : 'Empty Edge — Connect Harvesters & Refineries to Core';

    this.renderHeader('CONVEYOR EDGE BUILDER', currStatus);

    const conveyors: ConveyorType[] = ['conveyor_mk1', 'conveyor_mk2'];
    conveyors.forEach((cType, idx) => {
      const spec = CONVEYOR_SPECS[cType];
      const check = canBuildOnEdge(state, edgeId, cType);
      const cy = 90 + idx * 78;
      const isMk2 = cType === 'conveyor_mk2';

      const bg = this.scene.add
        .rectangle(
          GAME_WIDTH / 2,
          cy,
          GAME_WIDTH - 28,
          66,
          check.allowed ? 0x142238 : 0x0f172a,
          1
        )
        .setStrokeStyle(
          1.5,
          check.allowed ? (isMk2 ? 0x00e5ff : 0xffb703) : 0x334155,
          1
        )
        .setInteractive({ useHandCursor: true });

      const icon = this.scene.add
        .image(40, cy, isMk2 ? 'arrow_mk2' : 'arrow_mk1')
        .setScale(2.1)
        .setAlpha(check.allowed ? 1 : 0.4);

      const title = this.scene.add
        .text(68, cy - 16, spec.name.toUpperCase(), {
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: '12px',
          fontStyle: 'bold',
          color: check.allowed ? '#f8fafc' : '#64748b',
        })
        .setOrigin(0, 0.5);

      const desc = this.scene.add
        .text(68, cy + 1, spec.description, {
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: '10px',
          color: check.allowed ? '#cbd5e1' : '#475569',
        })
        .setOrigin(0, 0.5);

      const statusText =
        edge.conveyor === cType
          ? '✓ INSTALLED'
          : check.allowed
          ? `COST: ${this.formatCostString(spec.cost)}  ·  TAP TO BUILD`
          : `COST: ${this.formatCostString(spec.cost)}  (${check.reason ?? 'Locked'})`;

      const cost = this.scene.add
        .text(68, cy + 18, statusText, {
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: '9.5px',
          fontStyle: 'bold',
          color:
            edge.conveyor === cType
              ? '#34d399'
              : check.allowed
              ? '#34d399'
              : '#f87171',
        })
        .setOrigin(0, 0.5);

      if (check.allowed) {
        bg.on('pointerdown', () => {
          this.scene.game.events.emit('cmd:build_edge', {
            edgeId,
            conveyorType: cType,
          });
        });
      }

      this.dynamicLayer.add([bg, icon, title, desc, cost]);
    });
  }

  private renderHexInspector(state: GameState, hexId: string): void {
    const hex = state.hexes.get(hexId);
    if (!hex) {
      this.renderOverview(state);
      return;
    }

    const meta = TERRAIN_META[hex.terrain];
    const prob = hex.diceNumber
      ? `${DICE_PROBABILITIES[hex.diceNumber]?.ways ?? 0}/36 chance`
      : 'No production';

    this.renderHeader(
      `${meta.name.toUpperCase()} HEX`,
      hex.resource
        ? `Yields ${RESOURCE_META[hex.resource].name} on Roll ${hex.diceNumber} (${prob})`
        : 'Center Wasteland · Borders Central Core'
    );

    const card = this.scene.add
      .rectangle(GAME_WIDTH / 2, 118, GAME_WIDTH - 28, 110, 0x0f172a, 1)
      .setStrokeStyle(1.2, meta.borderColor, 1);

    const tip = this.scene.add
      .text(
        GAME_WIDTH / 2,
        118,
        hex.resource
          ? `Build a Harvester Node or Drill Rig on any of\nthis hex's 6 corners (○) and link it to the Core\nwith Conveyors (—) to harvest ${RESOURCE_META[hex.resource].name} on ${hex.diceNumber}!`
          : `The Central Desert produces no raw resources.\nDefend your Core vertex and route belts inward!`,
        {
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: '11px',
          align: 'center',
          color: '#cbd5e1',
          lineSpacing: 5,
        }
      )
      .setOrigin(0.5);

    this.dynamicLayer.add([card, tip]);
  }

  private compactBuildingStat(bType: BuildingType): string {
    const s = BUILDING_SPECS[bType];
    switch (bType) {
      case 'harvester':
        return '+1/hex · 60 HP · Dist Rule';
      case 'drill_rig':
        return '+2/hex · 90 HP · Heavy';
      case 'smelter_kiln':
        return 'Brick & Steel · 80 HP';
      case 'aether_reactor':
        return 'Power Cell · 80 HP';
      case 'arc_furnace':
        return 'Silicon (2 Ore+1 Aet)';
      case 'barricade':
        return '120 HP · Blocks March';
      case 'duo_turret':
        return 'Rng 1 · 15x2 DMG · 60 HP';
      case 'scorch':
        return 'Rng 0 AoE · 35 DMG · 90 HP';
      case 'lancer':
        return 'Rng 2 Line · 60 DMG · 100% Prc';
      case 'meltdown':
        return 'Rng 2 AoE · 110 DMG · 50% Prc';
      default:
        return `${s.maxHp} HP`;
    }
  }

  private formatCostString(cost: ResourceCost): string {
    return (Object.entries(cost) as Array<[ResourceType, number]>)
      .map(([res, amt]) => `${amt} ${RESOURCE_META[res].short}`)
      .join(' · ');
  }
}

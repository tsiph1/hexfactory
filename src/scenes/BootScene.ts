import Phaser from 'phaser';
import {
  ENEMY_SPECS,
  HEX_RADIUS,
  RESOURCE_META,
  TERRAIN_META,
} from '../core/constants';
import type { EnemyType, ResourceType, TerrainType } from '../core/types';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  create(): void {
    this.generateHexTextures();
    this.generateResourceIcons();
    this.generateConveyorArrows();
    this.generateBuildingIcons();
    this.generateEnemySprites();
    this.generateDiceFaces();
    this.generateFxTextures();

    this.scene.start('GameScene');
    this.scene.launch('UIScene');
  }

  private generateHexTextures(): void {
    const r = HEX_RADIUS;
    const w = Math.ceil(Math.sqrt(3) * r) + 6;
    const h = Math.ceil(2 * r) + 6;
    const cx = w / 2;
    const cy = h / 2;

    const terrains: TerrainType[] = [
      'forest',
      'hills',
      'mountains',
      'fields',
      'pasture',
      'desert',
    ];

    for (const terrain of terrains) {
      const meta = TERRAIN_META[terrain];
      const g = this.add.graphics();

      const outerPts = this.hexPoints(cx, cy, r - 1.5);
      const innerPts = this.hexPoints(cx, cy, r - 5.5);

      // Base hex fill
      g.fillStyle(meta.fillColor, 1);
      g.fillPoints(outerPts, true);

      // Subtle inner bevel highlight
      g.lineStyle(1.5, meta.accentColor, 0.28);
      g.strokePoints(innerPts, true);

      // Terrain geometric motif (placed slightly above center so dice token sits cleanly below)
      this.drawTerrainMotif(g, terrain, cx, cy - 11, meta.accentColor);

      // Crisp outer border
      g.lineStyle(2, meta.borderColor, 0.9);
      g.strokePoints(outerPts, true);

      g.generateTexture(`hex_${terrain}`, w, h);
      g.destroy();
    }
  }

  private hexPoints(cx: number, cy: number, radius: number): Phaser.Geom.Point[] {
    const pts: Phaser.Geom.Point[] = [];
    for (let i = 0; i < 6; i++) {
      const rad = ((60 * i - 30) * Math.PI) / 180;
      pts.push(
        new Phaser.Geom.Point(
          cx + radius * Math.cos(rad),
          cy + radius * Math.sin(rad)
        )
      );
    }
    return pts;
  }

  private drawTerrainMotif(
    g: Phaser.GameObjects.Graphics,
    terrain: TerrainType,
    cx: number,
    cy: number,
    color: number
  ): void {
    g.fillStyle(color, 0.55);
    g.lineStyle(1.5, color, 0.8);

    switch (terrain) {
      case 'forest': {
        // Three pine silhouettes
        const offsets = [
          [-9, 3, 7],
          [0, -2, 9],
          [9, 3, 7],
        ];
        for (const [ox, oy, sz] of offsets) {
          g.fillTriangle(
            cx + ox,
            cy + oy - sz,
            cx + ox - sz * 0.65,
            cy + oy + 4,
            cx + ox + sz * 0.65,
            cy + oy + 4
          );
        }
        break;
      }
      case 'hills': {
        // Layered clay terraces / mesas
        g.fillRoundedRect(cx - 14, cy, 14, 7, 3);
        g.fillRoundedRect(cx - 2, cy - 5, 16, 10, 4);
        break;
      }
      case 'mountains': {
        // Twin sharp ore peaks + snow/crystal cap
        g.fillTriangle(cx - 13, cy + 6, cx - 3, cy - 9, cx + 6, cy + 6);
        g.fillTriangle(cx - 2, cy + 6, cx + 8, cy - 12, cx + 16, cy + 6);
        g.fillStyle(0xdbe9f4, 0.7);
        g.fillTriangle(cx + 5, cy - 6, cx + 8, cy - 12, cx + 11, cy - 6);
        break;
      }
      case 'fields': {
        // Stylized golden grain furrows / stalks
        for (let i = -10; i <= 10; i += 5) {
          g.lineBetween(cx + i, cy + 6, cx + i + 2, cy - 7);
          g.fillCircle(cx + i + 2, cy - 8, 1.8);
        }
        break;
      }
      case 'pasture': {
        // Glowing aether crystals
        g.fillTriangle(cx, cy - 11, cx - 5, cy + 4, cx + 5, cy + 4);
        g.fillTriangle(cx - 9, cy - 4, cx - 12, cy + 5, cx - 5, cy + 5);
        g.fillTriangle(cx + 9, cy - 4, cx + 5, cy + 5, cx + 12, cy + 5);
        break;
      }
      case 'desert': {
        // Wasteland cracked crater / hazard ring
        g.strokeCircle(cx, cy + 10, 12);
        g.lineBetween(cx - 8, cy + 4, cx + 8, cy + 16);
        g.lineBetween(cx + 8, cy + 4, cx - 8, cy + 16);
        break;
      }
    }
  }

  private generateResourceIcons(): void {
    const resources = Object.keys(RESOURCE_META) as ResourceType[];
    const size = 18;
    const c = size / 2;

    for (const res of resources) {
      const meta = RESOURCE_META[res];
      const g = this.add.graphics();

      // Dark backing pill for high contrast
      g.fillStyle(0x0b101a, 0.9);
      g.fillCircle(c, c, 8);
      g.lineStyle(1.4, meta.color, 1);
      g.strokeCircle(c, c, 7.5);

      g.fillStyle(meta.color, 1);
      switch (res) {
        case 'timber':
          g.fillTriangle(c, 3, c - 4.5, 13, c + 4.5, 13);
          break;
        case 'clay':
          g.fillRoundedRect(4.5, 6, 9, 6, 2);
          break;
        case 'ore':
          g.fillPoints(
            [
              new Phaser.Geom.Point(c, 3.5),
              new Phaser.Geom.Point(14, c),
              new Phaser.Geom.Point(c, 14.5),
              new Phaser.Geom.Point(4, c),
            ],
            true
          );
          break;
        case 'grain':
          g.fillEllipse(c, c, 5, 10);
          break;
        case 'aether':
          g.fillTriangle(c, 3, 13, 12, 5, 12);
          g.fillTriangle(c, 15, 13, 6, 5, 6);
          break;
        case 'brick':
          g.fillRect(4, 5, 4.5, 3);
          g.fillRect(9.5, 5, 4.5, 3);
          g.fillRect(6.5, 9.5, 5, 3.5);
          break;
        case 'steel':
          g.fillPoints(
            [
              new Phaser.Geom.Point(5, 5.5),
              new Phaser.Geom.Point(13, 5.5),
              new Phaser.Geom.Point(14.5, 12.5),
              new Phaser.Geom.Point(3.5, 12.5),
            ],
            true
          );
          break;
        case 'powerCell':
          g.fillRect(6, 4.5, 6, 9.5);
          g.fillStyle(0xffffff, 0.9);
          g.fillRect(7.5, 3, 3, 2);
          break;
        case 'silicon':
          g.fillRect(5, 5, 8, 8);
          g.lineStyle(1.2, 0xffffff, 0.9);
          g.strokeRect(6.5, 6.5, 5, 5);
          break;
      }

      g.generateTexture(`res_${res}`, size, size);
      g.destroy();
    }
  }

  private generateConveyorArrows(): void {
    const specs: Array<{ key: string; color: number }> = [
      { key: 'arrow_mk1', color: 0xffb703 },
      { key: 'arrow_mk2', color: 0x00e5ff },
    ];
    for (const s of specs) {
      const g = this.add.graphics();
      g.lineStyle(2.2, s.color, 1);
      g.beginPath();
      g.moveTo(2, 2);
      g.lineTo(8, 6);
      g.lineTo(2, 10);
      g.strokePath();
      g.generateTexture(s.key, 12, 12);
      g.destroy();
    }
  }

  private generateBuildingIcons(): void {
    const size = 34;
    const c = size / 2;

    const makeIcon = (
      key: string,
      drawFn: (g: Phaser.GameObjects.Graphics) => void
    ) => {
      const g = this.add.graphics();
      drawFn(g);
      g.generateTexture(key, size, size);
      g.destroy();
    };

    // Central Core: golden/cyan octagonal reactor core
    makeIcon('bld_core', (g) => {
      g.fillStyle(0x0f1c2e, 1);
      g.fillCircle(c, c, 14);
      g.lineStyle(2.5, 0x00e5ff, 1);
      g.strokeCircle(c, c, 13.5);
      g.fillStyle(0xffb703, 1);
      g.fillPoints(
        [
          new Phaser.Geom.Point(c, 6),
          new Phaser.Geom.Point(27, c),
          new Phaser.Geom.Point(c, 28),
          new Phaser.Geom.Point(7, c),
        ],
        true
      );
      g.fillStyle(0x00e5ff, 1);
      g.fillCircle(c, c, 4.5);
    });

    // Harvester Node: emerald hexagonal extractor
    makeIcon('bld_harvester', (g) => {
      g.fillStyle(0x132a1e, 1);
      g.fillCircle(c, c, 11.5);
      g.lineStyle(2, 0x52b788, 1);
      g.strokeCircle(c, c, 11);
      g.fillStyle(0x95d5b2, 1);
      g.fillRect(c - 4, c - 4, 8, 8);
      g.fillStyle(0x132a1e, 1);
      g.fillCircle(c, c, 2.2);
    });

    // Drill Rig: heavy dual-ring steel drill
    makeIcon('bld_drill_rig', (g) => {
      g.fillStyle(0x1b263b, 1);
      g.fillRoundedRect(5, 5, 24, 24, 5);
      g.lineStyle(2, 0x00f5d4, 1);
      g.strokeRoundedRect(5.5, 5.5, 23, 23, 5);
      g.fillStyle(0xf4c430, 1);
      g.fillCircle(c, c, 6);
      g.lineStyle(2, 0x0b101a, 1);
      g.lineBetween(c - 5, c, c + 5, c);
      g.lineBetween(c, c - 5, c, c + 5);
    });

    // Smelter / Kiln: furnace square with fiery core
    makeIcon('bld_smelter_kiln', (g) => {
      g.fillStyle(0x2d1810, 1);
      g.fillRoundedRect(5, 5, 24, 24, 4);
      g.lineStyle(2, 0xf77f00, 1);
      g.strokeRoundedRect(5.5, 5.5, 23, 23, 4);
      g.fillStyle(0xffbe0b, 1);
      g.fillTriangle(c, 9, 10, 23, 24, 23);
      g.fillStyle(0xd62828, 1);
      g.fillTriangle(c, 14, 13, 23, 21, 23);
    });

    // Aether Reactor: violet/cyan energy torus
    makeIcon('bld_aether_reactor', (g) => {
      g.fillStyle(0x211138, 1);
      g.fillCircle(c, c, 12);
      g.lineStyle(2, 0xb388ff, 1);
      g.strokeCircle(c, c, 11.5);
      g.lineStyle(2, 0x00e5ff, 1);
      g.strokeCircle(c, c, 6);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(c, c, 2.5);
    });

    // Arc Furnace: magenta silicon crucible
    makeIcon('bld_arc_furnace', (g) => {
      g.fillStyle(0x2c102d, 1);
      g.fillRoundedRect(5, 5, 24, 24, 6);
      g.lineStyle(2, 0xf15bb5, 1);
      g.strokeRoundedRect(5.5, 5.5, 23, 23, 6);
      g.lineStyle(2, 0x00e5ff, 1);
      g.beginPath();
      g.moveTo(11, 22);
      g.lineTo(15, 15);
      g.lineTo(19, 18);
      g.lineTo(23, 10);
      g.strokePath();
    });

    // Barricade: thick armored hexagonal shield wall
    makeIcon('bld_barricade', (g) => {
      g.fillStyle(0x4a2c20, 1);
      g.fillRoundedRect(5, 6, 24, 22, 3);
      g.lineStyle(2.5, 0xe76f51, 1);
      g.strokeRoundedRect(5.5, 6.5, 23, 21, 3);
      g.lineStyle(1.8, 0xf4a261, 0.9);
      g.lineBetween(7, 13, 27, 13);
      g.lineBetween(7, 21, 27, 21);
      g.lineBetween(17, 7, 17, 13);
      g.lineBetween(12, 13, 12, 21);
      g.lineBetween(22, 13, 22, 21);
    });

    // Duo Turret: twin-barrel amber gun mount
    makeIcon('bld_duo_turret', (g) => {
      g.fillStyle(0x262d3d, 1);
      g.fillCircle(c, c + 1, 10.5);
      g.lineStyle(2, 0xf4a261, 1);
      g.strokeCircle(c, c + 1, 10);
      g.fillStyle(0xe9c46a, 1);
      g.fillRect(c - 5, 4, 3.5, 12);
      g.fillRect(c + 1.5, 4, 3.5, 12);
      g.fillCircle(c, c + 2, 4.5);
    });

    // Scorch: close-range flame ring emitter
    makeIcon('bld_scorch', (g) => {
      g.fillStyle(0x3a1712, 1);
      g.fillCircle(c, c, 11.5);
      g.lineStyle(2.2, 0xff595e, 1);
      g.strokeCircle(c, c, 11);
      g.fillStyle(0xff9f1c, 1);
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        g.fillCircle(c + Math.cos(a) * 6.5, c + Math.sin(a) * 6.5, 2.2);
      }
      g.fillStyle(0xffffff, 0.95);
      g.fillCircle(c, c, 3);
    });

    // Lancer: sleek high-pierce cyan railgun
    makeIcon('bld_lancer', (g) => {
      g.fillStyle(0x10253a, 1);
      g.fillCircle(c, c + 2, 10.5);
      g.lineStyle(2, 0x00e5ff, 1);
      g.strokeCircle(c, c + 2, 10);
      g.fillStyle(0x90e0ef, 1);
      g.fillTriangle(c, 2, c - 5, 18, c + 5, 18);
      g.fillStyle(0x00e5ff, 1);
      g.fillRect(c - 1.5, 4, 3, 18);
    });

    // Meltdown: massive heavy plasma cannon
    makeIcon('bld_meltdown', (g) => {
      g.fillStyle(0x280d2d, 1);
      g.fillCircle(c, c, 13.5);
      g.lineStyle(2.5, 0xf15bb5, 1);
      g.strokeCircle(c, c, 13);
      g.fillStyle(0x00e5ff, 1);
      g.fillRect(c - 5.5, 3, 11, 13);
      g.fillStyle(0xf15bb5, 1);
      g.fillCircle(c, c + 2, 6);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(c, c + 2, 2.8);
    });
  }

  private generateEnemySprites(): void {
    const types = Object.keys(ENEMY_SPECS) as EnemyType[];
    for (const type of types) {
      const spec = ENEMY_SPECS[type];
      const size = spec.isBoss ? 36 : 26;
      const c = size / 2;
      const g = this.add.graphics();

      // Dark outer halo for instant readability over hexes
      g.fillStyle(0x090b12, 0.85);
      g.fillCircle(c, c, spec.radius + 2);

      g.fillStyle(spec.color, 1);
      g.lineStyle(1.8, spec.accentColor, 1);

      switch (type) {
        case 'crawler':
          g.fillCircle(c, c, 6);
          g.strokeCircle(c, c, 6);
          // Legs
          g.lineBetween(c - 9, c - 4, c + 9, c + 4);
          g.lineBetween(c - 9, c + 4, c + 9, c - 4);
          break;
        case 'dagger':
          g.fillTriangle(c, c - 8, c - 7, c + 7, c + 7, c + 7);
          g.strokeTriangle(c, c - 8, c - 7, c + 7, c + 7, c + 7);
          break;
        case 'mace':
          g.fillRoundedRect(c - 7, c - 7, 14, 14, 3);
          g.strokeRoundedRect(c - 7, c - 7, 14, 14, 3);
          g.fillStyle(0xffffff, 0.85);
          g.fillCircle(c, c, 2.5);
          break;
        case 'fortress':
          g.fillPoints(
            [
              new Phaser.Geom.Point(c, c - 10),
              new Phaser.Geom.Point(c + 9, c - 3),
              new Phaser.Geom.Point(c + 7, c + 9),
              new Phaser.Geom.Point(c - 7, c + 9),
              new Phaser.Geom.Point(c - 9, c - 3),
            ],
            true
          );
          g.strokePath();
          g.fillStyle(spec.accentColor, 1);
          g.fillRect(c - 3, c - 3, 6, 6);
          break;
        case 'spiroct':
          // Mid-boss spider mech
          g.lineStyle(2.5, spec.accentColor, 1);
          for (let i = 0; i < 6; i++) {
            const a = (i * Math.PI) / 3;
            g.lineBetween(
              c,
              c,
              c + Math.cos(a) * 14,
              c + Math.sin(a) * 14
            );
          }
          g.fillCircle(c, c, 9);
          g.strokeCircle(c, c, 9);
          g.fillStyle(0xffffff, 1);
          g.fillCircle(c - 3, c - 2, 1.8);
          g.fillCircle(c + 3, c - 2, 1.8);
          break;
        case 'eclipse':
          // Final Boss winged dreadnought
          g.fillTriangle(c, 2, 3, c + 10, size - 3, c + 10);
          g.strokeTriangle(c, 2, 3, c + 10, size - 3, c + 10);
          g.fillStyle(0xff006e, 1);
          g.fillCircle(c, c + 2, 6);
          g.fillStyle(0xffffff, 1);
          g.fillCircle(c, c + 2, 2.8);
          break;
      }

      g.generateTexture(`enemy_${type}`, size, size);
      g.destroy();
    }
  }

  private generateDiceFaces(): void {
    const size = 46;
    const pipCoords: Record<number, Array<[number, number]>> = {
      1: [[23, 23]],
      2: [
        [13, 13],
        [33, 33],
      ],
      3: [
        [13, 13],
        [23, 23],
        [33, 33],
      ],
      4: [
        [13, 13],
        [33, 13],
        [13, 33],
        [33, 33],
      ],
      5: [
        [13, 13],
        [33, 13],
        [23, 23],
        [13, 33],
        [33, 33],
      ],
      6: [
        [13, 11],
        [33, 11],
        [13, 23],
        [33, 23],
        [13, 35],
        [33, 35],
      ],
    };

    for (let face = 1; face <= 6; face++) {
      const g = this.add.graphics();
      g.fillStyle(0x162033, 1);
      g.fillRoundedRect(2, 2, size - 4, size - 4, 9);
      g.lineStyle(2, 0x4cc9f0, 0.9);
      g.strokeRoundedRect(2, 2, size - 4, size - 4, 9);

      const pipColor = face === 6 ? 0xff4d6d : 0xf8fafc;
      g.fillStyle(pipColor, 1);
      for (const [px, py] of pipCoords[face]) {
        g.fillCircle(px, py, 3.8);
      }

      g.generateTexture(`die_${face}`, size, size);
      g.destroy();
    }
  }

  private generateFxTextures(): void {
    // Soft glow orb for resource packets and flashes
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 0.25);
    g.fillCircle(10, 10, 10);
    g.fillStyle(0xffffff, 0.65);
    g.fillCircle(10, 10, 6);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(10, 10, 3);
    g.generateTexture('glow_dot', 20, 20);
    g.destroy();
  }
}

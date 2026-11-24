import Phaser from 'phaser';
import {
  ENEMY_SPECS,
  GAME_WIDTH,
  WAVE_CURVE,
} from '../core/constants';
import type {
  DiceRollResult,
  GameState,
  MagneticBiasMode,
} from '../core/types';

export class DiceOverlay extends Phaser.GameObjects.Container {
  private biasMode: MagneticBiasMode = 'none';
  private isRolling = false;

  private waveBannerText!: Phaser.GameObjects.Text;
  private overclockText!: Phaser.GameObjects.Text;
  private resultText!: Phaser.GameObjects.Text;

  private dieSprites: Phaser.GameObjects.Image[] = [];
  private droppedCross!: Phaser.GameObjects.Text;

  private biasButtons = new Map<
    MagneticBiasMode,
    {
      bg: Phaser.GameObjects.Rectangle;
      label: Phaser.GameObjects.Text;
    }
  >();

  private rollBtnBg!: Phaser.GameObjects.Rectangle;
  private rollBtnLabel!: Phaser.GameObjects.Text;

  private tumbleTimerId: number | null = null;
  private latestState: GameState | null = null;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 554);
    this.buildUI();
    scene.add.existing(this);
  }

  private buildUI(): void {
    // Panel background
    const panelBg = this.scene.add
      .rectangle(GAME_WIDTH / 2, 145, GAME_WIDTH - 14, 280, 0x111827, 0.96)
      .setStrokeStyle(1.5, 0x26354d, 1);
    this.add(panelBg);

    // Top phase header & upcoming wave intel
    const headerBar = this.scene.add.rectangle(
      GAME_WIDTH / 2,
      20,
      GAME_WIDTH - 24,
      26,
      0x182336,
      1
    );
    this.add(headerBar);

    this.waveBannerText = this.scene.add
      .text(GAME_WIDTH / 2, 20, 'PHASE 1: ROLL & HARVEST', {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#e2e8f0',
      })
      .setOrigin(0.5);
    this.add(this.waveBannerText);

    // Dice tray
    const trayBg = this.scene.add
      .rectangle(GAME_WIDTH / 2, 74, GAME_WIDTH - 32, 66, 0x0b101b, 0.95)
      .setStrokeStyle(1, 0x1e293b, 1);
    this.add(trayBg);

    const dieX = [GAME_WIDTH / 2 - 58, GAME_WIDTH / 2, GAME_WIDTH / 2 + 58];
    for (let i = 0; i < 3; i++) {
      const sprite = this.scene.add.image(dieX[i], 70, `die_${(i % 6) + 1}`);
      this.dieSprites.push(sprite);
      this.add(sprite);
    }

    this.droppedCross = this.scene.add
      .text(0, 0, '✕', {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '28px',
        fontStyle: 'bold',
        color: '#ff3b5c',
        stroke: '#070a10',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setVisible(false);
    this.add(this.droppedCross);

    this.resultText = this.scene.add
      .text(GAME_WIDTH / 2, 118, 'Tap ROLL 2d6 to harvest matching hexes', {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#94a3b8',
      })
      .setOrigin(0.5);
    this.add(this.resultText);

    // Magnetic Bias gamble selector row
    const biasTitle = this.scene.add
      .text(22, 138, 'MAGNETIC BIAS (1 PWR · 3d6 drop mismatched parity):', {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '9.5px',
        fontStyle: 'bold',
        color: '#38bdf8',
      })
      .setOrigin(0, 0.5);
    this.add(biasTitle);

    const modes: Array<{ mode: MagneticBiasMode; text: string; x: number }> = [
      { mode: 'none', text: 'NORMAL 2d6', x: 74 },
      { mode: 'even', text: 'EVEN (1 PWR)', x: 195 },
      { mode: 'odd', text: 'ODD (1 PWR)', x: 316 },
    ];

    for (const m of modes) {
      const bg = this.scene.add
        .rectangle(m.x, 165, 112, 32, 0x162033, 1)
        .setStrokeStyle(1.4, 0x334155, 1)
        .setInteractive({ useHandCursor: true });

      const label = this.scene.add
        .text(m.x, 165, m.text, {
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: '10.5px',
          fontStyle: 'bold',
          color: '#cbd5e1',
        })
        .setOrigin(0.5);

      bg.on('pointerdown', () => {
        if (this.isRolling || !this.latestState) return;
        if (m.mode !== 'none' && this.latestState.resources.powerCell < 1) {
          return;
        }
        this.biasMode = m.mode;
        this.refreshBiasUI();
      });

      this.biasButtons.set(m.mode, { bg, label });
      this.add([bg, label]);
    }

    // Overclock active reminder
    this.overclockText = this.scene.add
      .text(GAME_WIDTH / 2, 198, '', {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '10px',
        fontStyle: 'bold',
        color: '#ffbe0b',
      })
      .setOrigin(0.5);
    this.add(this.overclockText);

    // Primary ROLL button
    this.rollBtnBg = this.scene.add
      .rectangle(GAME_WIDTH / 2, 244, GAME_WIDTH - 36, 48, 0x0284c7, 1)
      .setStrokeStyle(2, 0x38bdf8, 1)
      .setInteractive({ useHandCursor: true });

    this.rollBtnLabel = this.scene.add
      .text(GAME_WIDTH / 2, 244, 'ROLL 2d6', {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    this.rollBtnBg.on('pointerdown', () => {
      if (this.isRolling) return;
      this.isRolling = true;
      this.rollBtnBg.setFillStyle(0x1e3a5f, 1);
      this.scene.game.events.emit('cmd:roll', this.biasMode);
    });

    this.add([this.rollBtnBg, this.rollBtnLabel]);
  }

  public sync(state: GameState): void {
    this.latestState = state;

    if (state.phase === 'ROLL_AND_HARVEST') {
      this.isRolling = false;
      this.droppedCross.setVisible(false);
      // Reset bias to none if player no longer has Power Cell
      if (this.biasMode !== 'none' && state.resources.powerCell < 1) {
        this.biasMode = 'none';
      }

      const wave = WAVE_CURVE.find((w) => w.turn === state.turn);
      if (wave) {
        if (wave.entries.length === 0) {
          this.waveBannerText
            .setText(`TURN ${state.turn}/12 · ${wave.label}`)
            .setColor('#52b788');
        } else {
          const summary = wave.entries
            .map((e) => `${e.count}x ${ENEMY_SPECS[e.type].name}`)
            .join(', ');
          this.waveBannerText
            .setText(
              `T${state.turn} ${wave.isBossWave ? '⚠ ' : ''}${wave.label}: ${summary}`
            )
            .setColor(wave.isBossWave ? '#ff4d6d' : '#f8fafc');
        }
      }

      let ocCount = 0;
      for (const v of state.vertices.values()) {
        if (v.building?.isOverclocked) ocCount++;
      }
      this.overclockText.setText(
        ocCount > 0
          ? `⚡ ${ocCount} Building${ocCount > 1 ? 's' : ''} Overclocked (+100% Harvest/Fire)`
          : 'Tip: Matching hexes feed belted Harvesters · 7 = Core Siphon'
      );
      this.overclockText.setColor(ocCount > 0 ? '#ffbe0b' : '#64748b');

      this.resultText
        .setText('Choose Magnetic Bias (optional) & roll!')
        .setColor('#94a3b8');

      this.refreshBiasUI();
    }
  }

  public playRollAnimation(result: DiceRollResult): void {
    this.isRolling = true;
    this.droppedCross.setVisible(false);

    const isThreeDice = result.rawDice.length === 3;
    this.layoutDiceSlots(isThreeDice);

    if (this.tumbleTimerId !== null) {
      window.clearInterval(this.tumbleTimerId);
      this.tumbleTimerId = null;
    }

    let ticks = 0;
    this.tumbleTimerId = window.setInterval(() => {
      if (!this.scene || !this.scene.sys || !this.scene.sys.isActive()) {
        if (this.tumbleTimerId !== null) {
          window.clearInterval(this.tumbleTimerId);
          this.tumbleTimerId = null;
        }
        return;
      }
      ticks++;
      if (ticks < 6) {
        for (let i = 0; i < (isThreeDice ? 3 : 2); i++) {
          const randFace = Phaser.Math.Between(1, 6);
          this.dieSprites[i].setTexture(`die_${randFace}`);
          this.dieSprites[i].setAngle(Phaser.Math.Between(-14, 14));
        }
      } else {
        if (this.tumbleTimerId !== null) {
          window.clearInterval(this.tumbleTimerId);
          this.tumbleTimerId = null;
        }
        // Land on final dice values
        for (let i = 0; i < result.rawDice.length; i++) {
          const sp = this.dieSprites[i];
          sp.setTexture(`die_${result.rawDice[i]}`);
          sp.setAngle(0);
          const isDropped = result.droppedIndex === i;
          sp.setAlpha(isDropped ? 0.35 : 1);
          if (isDropped) {
            this.droppedCross.setPosition(sp.x, sp.y).setVisible(true);
          }
        }

        const isHot = result.total === 6 || result.total === 8;
        const totalLabel =
          result.total === 7
            ? 'ROLLED 7 — CORE SIPHON!'
            : `ROLLED ${result.total} (${result.keptDice[0]} + ${result.keptDice[1]}) · ${result.harvestEvents.length} HARVEST${result.harvestEvents.length === 1 ? '' : 'S'}`;
        this.resultText
          .setText(totalLabel)
          .setColor(
            result.total === 7 ? '#00e5ff' : isHot ? '#ff4d6d' : '#f8fafc'
          );
      }
    }, 60);
  }

  private layoutDiceSlots(threeDice: boolean): void {
    if (threeDice) {
      const xs = [GAME_WIDTH / 2 - 64, GAME_WIDTH / 2, GAME_WIDTH / 2 + 64];
      this.dieSprites.forEach((sp, i) => {
        sp.setVisible(true).setAlpha(1).setPosition(xs[i], 70).setAngle(0);
      });
    } else {
      this.dieSprites[0]
        .setVisible(true)
        .setAlpha(1)
        .setPosition(GAME_WIDTH / 2 - 36, 70)
        .setAngle(0);
      this.dieSprites[1]
        .setVisible(true)
        .setAlpha(1)
        .setPosition(GAME_WIDTH / 2 + 36, 70)
        .setAngle(0);
      this.dieSprites[2].setVisible(false);
    }
  }

  private refreshBiasUI(): void {
    const hasPower = (this.latestState?.resources.powerCell ?? 0) >= 1;
    this.layoutDiceSlots(this.biasMode !== 'none');

    for (const [mode, btn] of this.biasButtons.entries()) {
      const selected = this.biasMode === mode;
      const disabled = mode !== 'none' && !hasPower;

      if (selected) {
        btn.bg.setFillStyle(0x0369a1, 1).setStrokeStyle(1.8, 0x00e5ff, 1);
        btn.label.setColor('#ffffff');
      } else if (disabled) {
        btn.bg.setFillStyle(0x0f172a, 0.7).setStrokeStyle(1, 0x1e293b, 1);
        btn.label.setColor('#475569');
      } else {
        btn.bg.setFillStyle(0x162033, 1).setStrokeStyle(1.2, 0x334155, 1);
        btn.label.setColor('#cbd5e1');
      }
    }

    const btnText =
      this.biasMode === 'none'
        ? 'ROLL 2d6'
        : `ROLL 3d6 (${this.biasMode.toUpperCase()} BIAS)`;
    this.rollBtnLabel.setText(btnText);
    this.rollBtnBg.setFillStyle(
      this.biasMode === 'none' ? 0x0284c7 : 0x7c3aed,
      1
    );
    this.rollBtnBg.setStrokeStyle(
      2,
      this.biasMode === 'none' ? 0x38bdf8 : 0xc084fc,
      1
    );
  }
}

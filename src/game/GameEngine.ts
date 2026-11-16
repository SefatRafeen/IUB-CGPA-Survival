import { hapticService } from '../audio/HapticService';
import { soundEngine } from '../audio/SoundEngine';
import {
  ActiveBuffTimer,
  BossIntroState,
  CloneAlly,
  Enemy,
  GhostEventTag,
  GhostPathSample,
  HudSnapshot,
  LevelId,
  Particle,
  PlayerTrailNode,
  POWER_UP_CATALOG,
  PowerUpType,
  Projectile,
  ScreenShakeMode,
  TelegraphZone,
} from '../types/game';
import { updateBoss } from './BossManager';
import { buildLevel, LevelData } from './LevelManager';
import { renderGameScene } from './Renderer';

export interface InputActions {
  left: boolean;
  right: boolean;
  jumpPressed: boolean;
  meleePressed: boolean;
  rangedPressed: boolean;
  dashPressed: boolean;
  slot1Pressed: boolean;
  slot2Pressed: boolean;
  slot3Pressed: boolean;
}

export class GameEngine {
  private level: LevelData;
  private player = {
    x: 120,
    y: 522,
    w: 36,
    h: 58,
    vx: 0,
    vy: 0,
    facing: 1 as 1 | -1,
    grounded: true,
    jumpsRemaining: 2,
    coyoteTimer: 0,
    hp: 100,
    maxHp: 100,
    stamina: 100,
    maxStamina: 100,
    cgpa: 3.5,
    dashing: false,
    dashTimer: 0,
    dashCooldown: 0,
    invulnTimer: 0,
    meleeTimer: 0,
    meleeCooldown: 0,
    rangedCooldown: 0,
    hasAssignmentKey: false,
    hasBonusMarkShield: false,
    inventory: ['CHA_ESPRESSO', 'BONUS_MARK', 'FRIENDS_NOTES'] as (PowerUpType | null)[],
    animTime: 0,
    researchMomentum: 0,
    comboCount: 0,
    comboStep: 1 as 1 | 2 | 3,
    comboDecayTimer: 0,
    comboChainWindow: 0,
    trailNodes: [] as PlayerTrailNode[],
    trailSampleTimer: 0,
  };

  private buffs: Map<ActiveBuffTimer['type'], ActiveBuffTimer> = new Map();
  private clones: CloneAlly[] = [];
  private projectiles: Projectile[] = [];
  private telegraphs: TelegraphZone[] = [];
  private particles: Particle[] = [];

  private camX: number = 0;
  private camY: number = 0;
  private shakeIntensity: number = 0;
  private shakeMode: ScreenShakeMode = 'STANDARD';
  private shakePhase: number = 0;
  private wallSparkCooldown: number = 0;

  // Player Game-Over Shattering Animation State
  private playerShattering: boolean = false;
  private playerShatterTimer: number = 0;
  private readonly playerShatterDuration: number = 1.45;
  private playerShatterBurstSpawned: boolean = false;
  private pendingGameOverReason: string = '';

  // Boss Arrival Sequence State
  private bossIntro: BossIntroState | null = null;
  private bossIntroCompleted: boolean = false;
  private bossIntroRoarTriggered: boolean = false;

  // Dynamic CGPA Enemy Spawn & Probation Environmental Hazard Timers
  private dynamicEnemySpawnTimer: number = 6.5;
  private probationHazardTimer: number = 4.2;
  private lastSyncedCgpa: number = -1;

  // 5-Second Ghost Path Movement Buffer & Frozen Death Snapshot
  private ghostHistory: { timestamp: number; sample: GhostPathSample }[] = [];
  private ghostSampleTimer: number = 0;
  private deathGhostPath: GhostPathSample[] = [];
  private isGameOverState: boolean = false;

  private hitstopTimer: number = 0;
  private elapsedSeconds: number = 0;
  private totalTime: number = 0;
  private notification: string | null = null;
  private notificationTimer: number = 0;
  private enemySpeedMultiplier: number = 1;

  private onHudUpdate: (snapshot: HudSnapshot) => void;
  private onVictory: (finalCgpa: number, elapsedSeconds: number) => void;
  private onGameOver: (reason: string) => void;
  private onLevelUnlock?: (unlockedLevel: LevelId) => void;
  private hudSyncAccum: number = 0;

  constructor(
    initialLevel: LevelId,
    onHudUpdate: (snapshot: HudSnapshot) => void,
    onVictory: (finalCgpa: number, elapsedSeconds: number) => void,
    onGameOver: (reason: string) => void,
    onLevelUnlock?: (unlockedLevel: LevelId) => void
  ) {
    this.onHudUpdate = onHudUpdate;
    this.onVictory = onVictory;
    this.onGameOver = onGameOver;
    this.onLevelUnlock = onLevelUnlock;
    this.level = buildLevel(initialLevel);
    this.resetPlayerForLevel(initialLevel, true);
  }

  public loadLevel(levelId: LevelId, fullReset: boolean = false): void {
    this.level = buildLevel(levelId);
    this.resetPlayerForLevel(levelId, fullReset);
    soundEngine.setBossSilence(false);
    soundEngine.setArenaShrinkFactor(0);
    soundEngine.startMusic(levelId);
    this.notify(`ENTERED ${this.level.name.toUpperCase()}`);
    this.emitHud();
  }

  private resetPlayerForLevel(levelId: LevelId, fullReset: boolean): void {
    this.player.x = 120;
    this.player.y = this.level.floorY - this.player.h;
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.facing = 1;
    this.player.grounded = true;
    this.player.jumpsRemaining = 2;
    this.player.hasAssignmentKey = false;
    this.player.dashing = false;
    this.player.dashTimer = 0;
    this.player.meleeTimer = 0;
    this.player.invulnTimer = 1.0;
    this.player.comboCount = 0;
    this.player.comboStep = 1;
    this.player.comboDecayTimer = 0;
    this.player.comboChainWindow = 0;
    this.player.trailNodes = [];
    this.player.trailSampleTimer = 0;

    this.playerShattering = false;
    this.playerShatterTimer = 0;
    this.playerShatterBurstSpawned = false;
    this.pendingGameOverReason = '';
    this.isGameOverState = false;
    this.bossIntro = null;
    this.bossIntroCompleted = false;
    this.bossIntroRoarTriggered = false;
    this.ghostHistory = [];
    this.deathGhostPath = [];
    this.ghostSampleTimer = 0;
    this.dynamicEnemySpawnTimer = 6.0;
    this.probationHazardTimer = 3.8;
    this.lastSyncedCgpa = -1;

    if (fullReset) {
      this.player.researchMomentum = 0;
      this.player.hp = 100;
      this.player.stamina = 100;
      this.player.cgpa = 3.5;
      this.player.hasBonusMarkShield = false;
      this.player.inventory = ['CHA_ESPRESSO', 'BONUS_MARK', 'FRIENDS_NOTES'];
      this.elapsedSeconds = 0;
      this.buffs.clear();
    } else {
      // Floor transition bonus: heal 35 HP and +0.15 CGPA
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 35);
      this.player.stamina = this.player.maxStamina;
      this.player.cgpa = Math.min(4.0, +(this.player.cgpa + 0.15).toFixed(2));
    }

    // Store baseMaxHp on level enemies so CGPA scaling can dynamically adjust All-Nighter & Blank Sheet HP
    for (const e of this.level.enemies) {
      e.baseMaxHp = e.maxHp;
    }
    this.syncEnemyStatsToCgpa();

    this.clones = [];
    this.projectiles = [];
    this.telegraphs = [];
    this.particles = [];
    this.enemySpeedMultiplier = 1;
    this.camX = 0;
    this.camY = 0;
    this.level.id = levelId;
    this.recordGhostSample('NONE', true);
  }

  public getDeathGhostPath(): GhostPathSample[] {
    return this.deathGhostPath;
  }

  public getCgpaDifficultyModifiers(): {
    enemyHpMultiplier: number;
    enemySpawnRateMultiplier: number;
    hazardFrequencyMultiplier: number;
    regimeLabel: string;
  } {
    const cgpa = this.player.cgpa;
    // Higher CGPA yields higher enemy HP and faster All-Nighter / Blank Sheet spawn rate
    const enemyHpMultiplier = +(
      Math.max(0.8, Math.min(1.55, 1.0 + (cgpa - 2.6) * 0.36))
    ).toFixed(2);
    const enemySpawnRateMultiplier = +(
      Math.max(0.7, Math.min(1.9, 1.0 + (cgpa - 2.6) * 0.62))
    ).toFixed(2);

    // Lower CGPA (especially on Academic Probation < 2.00 or < 2.50) triggers environmental hazards much more frequently
    const hazardFrequencyMultiplier = +(
      cgpa < 2.5
        ? Math.min(2.4, 1.28 + (2.5 - cgpa) * 0.56)
        : Math.max(0.85, 1.0 - (cgpa - 2.5) * 0.1)
    ).toFixed(2);

    const regimeLabel =
      cgpa >= 3.5
        ? "DEAN'S LIST PRESSURE (High Enemy HP & Spawn)"
        : cgpa < 2.0
        ? 'PROBATION CRISIS (2x Hazard Surge)'
        : cgpa < 2.5
        ? 'PROBATION WARNING (Elevated Hazards)'
        : 'STANDARD ACADEMIC STANDING';

    return {
      enemyHpMultiplier,
      enemySpawnRateMultiplier,
      hazardFrequencyMultiplier,
      regimeLabel,
    };
  }

  private syncEnemyStatsToCgpa(): void {
    if (Math.abs(this.player.cgpa - this.lastSyncedCgpa) < 0.01) return;
    this.lastSyncedCgpa = this.player.cgpa;
    const { enemyHpMultiplier } = this.getCgpaDifficultyModifiers();

    for (const e of this.level.enemies) {
      if (e.kind === 'ALL_NIGHTER' || e.kind === 'BLANK_SHEET') {
        const base = e.baseMaxHp ?? e.maxHp;
        e.baseMaxHp = base;
        const hpRatio = e.maxHp > 0 ? e.hp / e.maxHp : 1;
        const scaledMax = Math.max(20, Math.round(base * enemyHpMultiplier));
        e.maxHp = scaledMax;
        e.hp = Math.max(1, Math.round(scaledMax * hpRatio));
      }
    }
  }

  private recordGhostSample(event: GhostEventTag = 'NONE', force: boolean = false): void {
    if (!force && this.ghostSampleTimer > 0 && event === 'NONE') return;
    this.ghostSampleTimer = 0.075;

    this.ghostHistory.push({
      timestamp: this.elapsedSeconds,
      sample: {
        timeOffset: 0,
        x: Math.round(this.player.x),
        y: Math.round(this.player.y),
        w: this.player.w,
        h: this.player.h,
        vx: Math.round(this.player.vx),
        vy: Math.round(this.player.vy),
        facing: this.player.facing,
        grounded: this.player.grounded,
        dashing: this.player.dashing,
        melee: this.player.meleeTimer > 0,
        hp: Math.round(this.player.hp),
        cgpa: this.player.cgpa,
        event,
      },
    });

    // Keep only the last 5.0 seconds of movement history
    const cutoff = this.elapsedSeconds - 5.05;
    while (this.ghostHistory.length > 0 && this.ghostHistory[0].timestamp < cutoff) {
      this.ghostHistory.shift();
    }
  }

  public notify(msg: string, duration: number = 3.2): void {
    this.notification = msg;
    this.notificationTimer = duration;
  }

  public triggerScreenShake(intensity: number, mode: ScreenShakeMode = 'STANDARD'): void {
    if (mode === 'LOW_FREQ_HEAVY' || this.shakeMode !== 'LOW_FREQ_HEAVY' || intensity >= this.shakeIntensity) {
      this.shakeMode = mode;
    }
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
    if (mode === 'LOW_FREQ_HEAVY' || intensity >= 14) {
      hapticService.bossSlam(intensity >= 20);
    }
  }

  public stepGhostReplay(rawDt: number, viewW: number, viewH: number): void {
    const dt = Math.min(rawDt, 0.05);
    this.totalTime += dt;
    this.updateParticles(dt);

    if (this.deathGhostPath.length > 0) {
      const playheadTime = -5.0 + (this.totalTime % 5.0);
      let activeSample = this.deathGhostPath[0];
      for (let i = 0; i < this.deathGhostPath.length; i++) {
        if (this.deathGhostPath[i].timeOffset <= playheadTime) {
          activeSample = this.deathGhostPath[i];
        } else {
          break;
        }
      }
      const targetCamX = Math.max(
        0,
        Math.min(this.level.worldWidth - viewW, activeSample.x + activeSample.w * 0.5 - viewW * 0.5)
      );
      const isPortraitView = viewH > viewW;
      const floorScreenRatio = isPortraitView ? 0.68 : 0.82;
      const targetCamY = Math.max(
        -720,
        Math.min(180, this.level.floorY - viewH * floorScreenRatio)
      );
      this.camX += (targetCamX - this.camX) * Math.min(1, dt * 4.5);
      this.camY += (targetCamY - this.camY) * Math.min(1, dt * 4.5);
    }
  }

  public step(rawDt: number, input: InputActions, viewW: number, viewH: number): void {
    const dt = Math.min(rawDt, 0.05);
    this.totalTime += dt;

    if (this.wallSparkCooldown > 0) {
      this.wallSparkCooldown = Math.max(0, this.wallSparkCooldown - dt);
    }

    if (this.notificationTimer > 0) {
      this.notificationTimer -= dt;
      if (this.notificationTimer <= 0) {
        this.notification = null;
      }
    }

    // Frequency-aware Screen Shake Decay
    if (this.shakeIntensity > 0) {
      this.shakePhase += dt;
      const decayRate =
        this.shakeMode === 'HIGH_FREQ_JITTER'
          ? 44 // Crisp fast decay for subtle high-frequency player damage jitters
          : this.shakeMode === 'LOW_FREQ_HEAVY'
          ? 18 // Longer seismic rumble decay for Academic Dismissal hydraulic slams
          : 30;
      this.shakeIntensity = Math.max(0, this.shakeIntensity - dt * decayRate);
    }

    // Update Particles even during player shattering sequence
    this.updateParticles(dt);

    // Modulate procedural distance-based ambient soundscapes (Cafeteria lecture chatter, Admin vent/sand, 10th Floor Roof wind howling)
    soundEngine.updateAmbience(
      this.level.id,
      this.player.x,
      this.player.y,
      this.level.worldWidth,
      this.level.floorY,
      this.totalTime
    );

    // Handle Player Game-Over White-Void Shattering Sequence
    if (this.playerShattering) {
      this.playerShatterTimer += dt;
      const progress = this.playerShatterTimer / this.playerShatterDuration;
      if (progress >= 0.25 && !this.playerShatterBurstSpawned) {
        this.playerShatterBurstSpawned = true;
        this.spawnPlayerVoidShards(
          this.player.x + this.player.w * 0.5,
          this.player.y + this.player.h * 0.5,
          34
        );
        this.triggerScreenShake(18, 'LOW_FREQ_HEAVY');
      }
      if (this.playerShatterTimer >= this.playerShatterDuration) {
        this.playerShattering = false;
        this.isGameOverState = true;
        soundEngine.playGameOverMusic();
        this.onGameOver(this.pendingGameOverReason);
      }
      return;
    }

    // Handle 'Boss Arrival' Sequence (Camera pans to Boss, HUD dims, and displays IUB: Hollow Campus title card before combat)
    if (this.bossIntro && this.bossIntro.active) {
      this.bossIntro.timer -= dt;
      this.player.vx = 0;
      this.player.vy = 0;
      this.player.invulnTimer = Math.max(this.player.invulnTimer, 0.65);

      const progress = Math.max(
        0,
        Math.min(1, 1 - this.bossIntro.timer / Math.max(0.01, this.bossIntro.duration))
      );
      const bossCenterX = this.level.boss.x + this.level.boss.w * 0.5;
      const bossCenterY = this.level.boss.y + this.level.boss.h * 0.5;
      const playerCenterX = this.player.x + this.player.w * 0.5;

      // Trigger Boss Arrival roar/slam pose & shockwave particles when camera locks onto Boss (~26% into sequence)
      if (progress >= 0.26 && !this.bossIntroRoarTriggered) {
        this.bossIntroRoarTriggered = true;
        this.level.boss.state = 'ATTACK';
        this.level.boss.hitFlash = 0.16;
        if (this.level.id === 1) {
          soundEngine.play('syllabus_slam');
          this.spawnPaperConfetti(bossCenterX, bossCenterY, 26);
        } else if (this.level.id === 2) {
          soundEngine.play('probation_beep');
          this.spawnBurst(bossCenterX, bossCenterY, '#84cc16', 24);
        } else {
          soundEngine.play('dismissal_stamp');
          this.spawnBloodPaperConfetti(bossCenterX, bossCenterY, 28);
        }
        this.triggerScreenShake(15, 'LOW_FREQ_HEAVY');
      } else if (progress >= 0.68) {
        this.level.boss.state = 'IDLE';
      }

      // Compute final combat camera target so the transition at the end of Boss Arrival is 100% seamless
      const arenaW = this.level.bossArenaRightX - this.level.bossArenaLeftX;
      let combatCamX = (this.level.bossArenaLeftX + this.level.bossArenaRightX - viewW) * 0.5;
      if (viewW < arenaW) {
        const combatFocusX = playerCenterX * 0.7 + bossCenterX * 0.3;
        combatCamX = Math.max(
          this.level.bossArenaLeftX - 24,
          Math.min(this.level.bossArenaRightX - viewW + 24, combatFocusX - viewW * 0.5)
        );
      }
      combatCamX = Math.max(0, Math.min(this.level.worldWidth - viewW, combatCamX));

      const bossFocusCamX = Math.max(
        0,
        Math.min(this.level.worldWidth - viewW, bossCenterX - viewW * 0.5)
      );

      // Smooth cubic S-curve pan: Player (0.0 -> 0.24) -> Hold on Boss (0.24 -> 0.78) -> Smoothly frame Combat Arena (0.78 -> 1.0)
      const smoothstep = (t: number) => t * t * (3 - 2 * t);
      let desiredIntroCamX = bossFocusCamX;
      let panElevation = 1;
      if (progress < 0.24) {
        const t = smoothstep(progress / 0.24);
        const startCamX = Math.max(
          0,
          Math.min(this.level.worldWidth - viewW, playerCenterX - viewW * 0.38)
        );
        desiredIntroCamX = startCamX * (1 - t) + bossFocusCamX * t;
        panElevation = t;
      } else if (progress > 0.78) {
        const t = smoothstep((progress - 0.78) / 0.22);
        desiredIntroCamX = bossFocusCamX * (1 - t) + combatCamX * t;
        panElevation = 1 - t;
      }

      const isPortraitView = viewH > viewW;
      const floorScreenRatio = isPortraitView ? 0.68 : 0.82;
      const desiredIntroCamY = Math.max(
        -720,
        Math.min(180, this.level.floorY - viewH * floorScreenRatio - panElevation * 28)
      );

      this.camX += (desiredIntroCamX - this.camX) * Math.min(1, dt * 8.5);
      this.camY += (desiredIntroCamY - this.camY) * Math.min(1, dt * 8.5);

      if (this.bossIntro.timer <= 0) {
        this.bossIntro = null;
        this.bossIntroCompleted = true;
        this.level.boss.active = true;
        this.level.boss.state = 'IDLE';
        this.notify(`COMBAT BEGINS: ${this.level.boss.name.toUpperCase()}!`);
        this.triggerScreenShake(10, 'STANDARD');
        this.emitHud();
        return;
      }

      this.hudSyncAccum += rawDt;
      if (this.hudSyncAccum >= 0.05) {
        this.hudSyncAccum = 0;
        this.emitHud();
      }
      return;
    }

    this.elapsedSeconds += dt;
    this.ghostSampleTimer = Math.max(0, this.ghostSampleTimer - dt);
    this.syncEnemyStatsToCgpa();
    this.recordGhostSample('NONE', false);

    // Brief hitstop on heavy impacts for Hollow-Knight combat feel
    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= dt;
      return;
    }

    // 1. Update Active Buff Timers
    for (const [key, buff] of this.buffs.entries()) {
      buff.remaining -= dt;
      if (buff.remaining <= 0) {
        this.buffs.delete(key);
        if (key === 'CHA_ESPRESSO') {
          // 2s post-espresso crash slowdown
          this.addBuff('CHA_CRASH', 'Caffeine Crash (0.6x Speed)', 2.0, '#94a3b8');
        }
      }
    }

    // 2. Handle Consumable Slots (1 / 2 / 3)
    if (input.slot1Pressed) this.useInventorySlot(0);
    if (input.slot2Pressed) this.useInventorySlot(1);
    if (input.slot3Pressed) this.useInventorySlot(2);

    const timeScale = this.buffs.has('GRACE_PERIOD') ? 0.5 : 1.0;
    const chaActive = this.buffs.has('CHA_ESPRESSO');
    const chaCrash = this.buffs.has('CHA_CRASH');
    const jittersActive = this.buffs.has('ALL_NIGHTER_JITTERS');
    const silenced = this.buffs.has('BLANK_SILENCE');
    const extraSheetActive = this.buffs.has('EXTRA_SHEET');
    const revisionActive = this.buffs.has('ONE_NIGHT_REVISION');
    const medicalActive = this.buffs.has('MEDICAL_CERT');
    const questionBankActive = this.buffs.has('PAST_QUESTION_BANK');

    // 3. Stamina Regeneration
    if (chaActive) {
      this.player.stamina = this.player.maxStamina;
    } else if (!this.player.dashing) {
      this.player.stamina = Math.min(this.player.maxStamina, this.player.stamina + 22 * dt);
    }

    // 4. Player Movement, Jump, Dash & Attacks
    this.player.animTime += dt;
    if (this.player.invulnTimer > 0) this.player.invulnTimer = Math.max(0, this.player.invulnTimer - dt);
    if (this.player.dashCooldown > 0) this.player.dashCooldown = Math.max(0, this.player.dashCooldown - dt);
    if (this.player.meleeCooldown > 0) this.player.meleeCooldown = Math.max(0, this.player.meleeCooldown - dt);
    if (this.player.rangedCooldown > 0) this.player.rangedCooldown = Math.max(0, this.player.rangedCooldown - dt);
    if (this.player.meleeTimer > 0) this.player.meleeTimer = Math.max(0, this.player.meleeTimer - dt);
    if (this.player.comboChainWindow > 0) {
      this.player.comboChainWindow = Math.max(0, this.player.comboChainWindow - dt);
    }

    // Update Melee Combo & Research Momentum Decay
    if (this.player.comboDecayTimer > 0) {
      this.player.comboDecayTimer = Math.max(0, this.player.comboDecayTimer - dt);
      if (this.player.comboDecayTimer <= 0) {
        this.player.comboCount = 0;
        this.player.comboStep = 1;
      }
    } else if (this.player.researchMomentum > 0) {
      this.player.researchMomentum = Math.max(0, this.player.researchMomentum - 15 * dt);
    }

    // Update Player Trail Nodes for Research Momentum visual afterimages & spectral ribbon
    for (let i = this.player.trailNodes.length - 1; i >= 0; i--) {
      this.player.trailNodes[i].alpha -= dt * 3.6;
      if (this.player.trailNodes[i].alpha <= 0) {
        this.player.trailNodes.splice(i, 1);
      }
    }
    this.player.trailSampleTimer -= dt;
    const isMovingOrAttacking =
      Math.abs(this.player.vx) > 25 ||
      Math.abs(this.player.vy) > 25 ||
      this.player.dashing ||
      this.player.meleeTimer > 0;
    if (
      this.player.trailSampleTimer <= 0 &&
      isMovingOrAttacking &&
      (this.player.researchMomentum > 5 || this.player.dashing)
    ) {
      this.player.trailSampleTimer = this.player.dashing ? 0.018 : 0.028;
      this.player.trailNodes.unshift({
        x: this.player.x,
        y: this.player.y,
        facing: this.player.facing,
        alpha: 1.0,
        comboStep: this.player.comboStep,
        momentumRatio: this.player.researchMomentum / 100,
      });
      if (this.player.trailNodes.length > 8) {
        this.player.trailNodes.pop();
      }

      // Emit subtle momentum trail motes when Research Momentum is high (>= 50%)
      if (this.player.researchMomentum >= 50 && Math.random() < 0.55) {
        const moteColor =
          this.player.researchMomentum >= 80
            ? '#fbbf24'
            : this.player.researchMomentum >= 50
            ? '#c084fc'
            : '#38bdf8';
        this.particles.push({
          x: this.player.x + this.player.w * 0.5 + (Math.random() - 0.5) * 18,
          y: this.player.y + this.player.h * (0.25 + Math.random() * 0.6),
          vx: -this.player.facing * (35 + Math.random() * 65),
          vy: -25 - Math.random() * 45,
          size: 2.2 + Math.random() * 2.2,
          color: moteColor,
          alpha: 0.9,
          life: 0.28 + Math.random() * 0.2,
          maxLife: 0.48,
          shape: 'SPARK',
        });
      }
    }

    // Dash ability (Shift)
    if (input.dashPressed && !silenced && this.player.dashCooldown <= 0 && !this.player.dashing) {
      const staminaCost = chaActive ? 0 : 24;
      if (this.player.stamina >= staminaCost) {
        this.player.stamina -= staminaCost;
        this.player.dashing = true;
        this.player.dashTimer = 0.19;
        this.player.dashCooldown = 0.45;
        this.player.invulnTimer = Math.max(this.player.invulnTimer, 0.23);
        this.player.vx = this.player.facing * 720;
        this.player.vy = 0;
        soundEngine.play('player_dash');
        this.recordGhostSample('DASH', true);
        this.spawnBurst(this.player.x + this.player.w * 0.5, this.player.y + this.player.h * 0.5, '#38bdf8', 8);
      }
    }

    if (this.player.dashing) {
      this.player.dashTimer -= dt;
      this.player.vx = this.player.facing * 720;
      this.player.vy = 0;
      if (this.player.dashTimer <= 0) {
        this.player.dashing = false;
      }
    } else {
      let baseSpeed = 285;
      if (chaActive) baseSpeed *= 1.85;
      else if (chaCrash) baseSpeed *= 0.65;
      if (jittersActive) baseSpeed *= 1.35;

      let moveDir = 0;
      if (input.left) moveDir -= 1;
      if (input.right) moveDir += 1;

      if (moveDir !== 0) {
        this.player.facing = moveDir > 0 ? 1 : -1;
        this.player.vx = moveDir * baseSpeed;
      } else {
        this.player.vx *= Math.pow(0.001, dt);
        if (Math.abs(this.player.vx) < 8) this.player.vx = 0;
      }

      // Gravity
      this.player.vy = Math.min(920, this.player.vy + 1680 * dt);
    }

    // Coyote time & Jump / Double-Jump (W or Space)
    if (this.player.grounded) {
      this.player.coyoteTimer = 0.11;
      this.player.jumpsRemaining = 2;
    } else {
      this.player.coyoteTimer = Math.max(0, this.player.coyoteTimer - dt);
    }

    if (input.jumpPressed) {
      if (this.player.coyoteTimer > 0 || this.player.jumpsRemaining > 0) {
        const isDouble = !this.player.grounded && this.player.coyoteTimer <= 0;
        this.player.vy = isDouble ? -600 : -650;
        this.player.grounded = false;
        this.player.coyoteTimer = 0;
        this.player.jumpsRemaining = Math.max(0, (isDouble ? 1 : 2) - 1);
        soundEngine.play('player_jump');
        this.recordGhostSample('JUMP', true);
        this.spawnBurst(this.player.x + this.player.w * 0.5, this.player.y + this.player.h, '#e2e8f0', 6);
      }
    }

    // Melee Attack (J or Z): 3-Stage Lab Report Combo with Research Momentum scaling
    if (input.meleePressed && this.player.meleeCooldown <= 0) {
      if (this.player.comboChainWindow > 0) {
        this.player.comboStep = ((this.player.comboStep % 3) + 1) as 1 | 2 | 3;
      } else {
        this.player.comboStep = 1;
      }
      this.player.comboChainWindow = 0.85;
      this.player.meleeTimer = 0.18;
      // Slightly faster recovery on steps 1 & 2, heavier cadence on step 3 finisher
      this.player.meleeCooldown = this.player.comboStep === 3 ? 0.31 : 0.23;
      soundEngine.play('player_melee');
      soundEngine.playMeleeSwing(this.player.comboStep, this.player.researchMomentum / 100);
      hapticService.meleeSwing(this.player.comboStep);
      this.recordGhostSample('MELEE', true);
      this.performMeleeHitCheck(extraSheetActive, revisionActive, questionBankActive);
    }

    // Ranged Attack (K or X): Crumpled paper projectiles (uses stamina)
    if (input.rangedPressed && !silenced && this.player.rangedCooldown <= 0) {
      const staminaCost = chaActive ? 0 : 16;
      if (this.player.stamina >= staminaCost) {
        this.player.stamina -= staminaCost;
        this.player.rangedCooldown = 0.26;
        soundEngine.play('player_ranged');
        const dmg = Math.round(24 * (revisionActive ? 2.5 : 1));
        this.projectiles.push({
          id: `paper-${Date.now()}-${Math.random()}`,
          x: this.player.x + (this.player.facing > 0 ? this.player.w + 6 : -6),
          y: this.player.y + this.player.h * 0.42,
          vx: this.player.facing * 640,
          vy: -25,
          radius: 9,
          damage: dmg,
          fromPlayer: true,
          kind: 'CRUMPLED_PAPER',
          color: revisionActive ? '#fda4af' : '#f8fafc',
          life: 1.5,
        });
      }
    }

    // 5. Integrate Player Position & Resolve Platform / Wall Collisions
    const prevX = this.player.x;
    const prevBottom = this.player.y + this.player.h;
    const wasDashing = this.player.dashing;
    this.player.x += this.player.vx * dt;
    this.player.y += this.player.vy * dt;
    this.player.grounded = false;

    for (const plat of this.level.platforms) {
      // Update erased platforms (Boss 3 Eraser Sweep)
      if (plat.erasedTimer && plat.erasedTimer > 0) {
        plat.erasedTimer = Math.max(0, plat.erasedTimer - dt);
        continue;
      }

      // Update Grade Drop collapsing platforms (collapses faster & triggers proximity tremors when CGPA is low on Probation!)
      if (plat.kind === 'GRADE_DROP') {
        const { hazardFrequencyMultiplier } = this.getCgpaDifficultyModifiers();
        const collapseThreshold = Math.max(0.38, 0.8 / hazardFrequencyMultiplier);

        // When on Probation (CGPA < 2.25), nearby Grade Drop platforms can start shaking spontaneously!
        if (
          plat.collapseState === 'IDLE' &&
          this.player.cgpa < 2.25 &&
          Math.abs(this.player.x + this.player.w * 0.5 - (plat.x + plat.w * 0.5)) < 82 &&
          Math.abs(this.player.y + this.player.h - plat.y) < 42 &&
          Math.random() < dt * 1.8 * hazardFrequencyMultiplier
        ) {
          plat.collapseState = 'SHAKING';
          plat.collapseTimer = 0;
          soundEngine.play('grade_drop_crack');
        }

        if (plat.collapseState === 'SHAKING') {
          plat.collapseTimer = (plat.collapseTimer || 0) + dt * timeScale;
          if (plat.collapseTimer >= collapseThreshold) {
            plat.collapseState = 'COLLAPSED';
            plat.respawnTimer = Math.max(1.8, 3.2 / hazardFrequencyMultiplier);
            soundEngine.playBookSlam();
            this.spawnBurst(plat.x + plat.w * 0.5, plat.y, '#fb7185', 10);
            continue;
          }
        } else if (plat.collapseState === 'COLLAPSED') {
          plat.respawnTimer = (plat.respawnTimer || 0) - dt;
          if (plat.respawnTimer <= 0) {
            plat.collapseState = 'IDLE';
            plat.collapseTimer = 0;
          }
          continue;
        }
      }

      // Prerequisite Gate Door collision (solid vertical wall)
      if (plat.kind === 'GATE_DOOR') {
        const horizontalOverlap =
          this.player.x + this.player.w > plat.x && this.player.x < plat.x + plat.w;
        const verticalOverlap =
          this.player.y + this.player.h > plat.y && this.player.y < plat.y + plat.h;
        if (horizontalOverlap && verticalOverlap) {
          if (this.player.vx > 0) {
            this.player.x = plat.x - this.player.w;
            if (wasDashing) {
              this.triggerWallDashSparks(plat.x, this.player.y + this.player.h * 0.45, -1);
            }
          } else {
            this.player.x = plat.x + plat.w;
            if (wasDashing) {
              this.triggerWallDashSparks(plat.x + plat.w, this.player.y + this.player.h * 0.45, 1);
            }
          }
          this.player.vx = 0;
          this.player.dashing = false;
        }
        continue;
      }

      // Solid platform side-wall collision when dashing into a thick brick wall/ledge
      if (plat.kind === 'SOLID') {
        const verticalBodyOverlap =
          this.player.y + this.player.h > plat.y + 10 && this.player.y < plat.y + plat.h - 4;
        const horizontalOverlap =
          this.player.x + this.player.w > plat.x && this.player.x < plat.x + plat.w;

        if (verticalBodyOverlap && horizontalOverlap && prevBottom > plat.y + 12) {
          if (prevX + this.player.w <= plat.x + 8 && this.player.vx > 0) {
            this.player.x = plat.x - this.player.w;
            if (wasDashing) {
              this.triggerWallDashSparks(plat.x, this.player.y + this.player.h * 0.5, -1);
            }
            this.player.vx = 0;
            this.player.dashing = false;
            continue;
          } else if (prevX >= plat.x + plat.w - 8 && this.player.vx < 0) {
            this.player.x = plat.x + plat.w;
            if (wasDashing) {
              this.triggerWallDashSparks(plat.x + plat.w, this.player.y + this.player.h * 0.5, 1);
            }
            this.player.vx = 0;
            this.player.dashing = false;
            continue;
          }
        }
      }

      // Landing on top of platform
      const withinX =
        this.player.x + this.player.w > plat.x + 4 && this.player.x < plat.x + plat.w - 4;
      const newBottom = this.player.y + this.player.h;
      if (withinX && this.player.vy >= 0 && prevBottom <= plat.y + 14 && newBottom >= plat.y) {
        this.player.y = plat.y - this.player.h;
        this.player.vy = 0;
        this.player.grounded = true;

        if (plat.kind === 'GRADE_DROP' && plat.collapseState === 'IDLE') {
          plat.collapseState = 'SHAKING';
          plat.collapseTimer = 0;
          soundEngine.play('grade_drop_crack');
        }
      }
    }

    // Pitfall check (between floor slabs)
    if (this.player.y > this.level.floorY + 140) {
      this.player.y = this.level.floorY - this.player.h - 60;
      this.player.vy = -320;
      this.player.x = Math.max(80, this.player.x - 180);
      this.damagePlayer(18, 0.25, 'Fell into Broken Campus Chasm');
    }

    // Clamp player within level or active Boss Arena walls & trigger wall-dash sparks on boundary impact!
    const minX = this.level.boss.active
      ? this.level.bossArenaLeftX + this.level.boss.arenaLeftOffset
      : 20;
    const maxX = this.level.boss.active
      ? this.level.bossArenaRightX - this.level.boss.arenaRightOffset - this.player.w
      : this.level.worldWidth - this.player.w - 20;

    if (this.player.x <= minX) {
      if (wasDashing && this.player.vx < 0) {
        this.triggerWallDashSparks(minX, this.player.y + this.player.h * 0.45, 1);
        this.player.dashing = false;
      }
      this.player.x = minX;
    } else if (this.player.x >= maxX) {
      if (wasDashing && this.player.vx > 0) {
        this.triggerWallDashSparks(maxX + this.player.w, this.player.y + this.player.h * 0.45, -1);
        this.player.dashing = false;
      }
      this.player.x = maxX;
    }

    // 6. Trigger 'Boss Arrival' Sequence when player crosses bossArenaTriggerX
    if (
      !this.level.boss.active &&
      !this.level.boss.defeated &&
      !this.bossIntro &&
      !this.bossIntroCompleted &&
      this.player.x >= this.level.bossArenaTriggerX
    ) {
      this.level.bellCurve.active = false;
      this.bossIntroRoarTriggered = false;
      this.bossIntro = {
        active: true,
        timer: 3.4,
        duration: 3.4,
        bossName: this.level.boss.name,
        bossSubtitle: this.level.boss.subtitle,
        floorTitle: this.level.name,
        level: this.level.id,
      };
      soundEngine.startBossMusic(this.level.id);
      if (this.level.id === 1) {
        soundEngine.play('syllabus_slice');
      } else if (this.level.id === 2) {
        soundEngine.play('probation_chain');
      } else {
        soundEngine.play('prerequisite_lock');
      }
      this.triggerScreenShake(9, 'STANDARD');
      this.emitHud();
      return;
    }

    // 6b. Dynamic CGPA-Based Enemy Spawn & Probation Environmental Hazard Surge
    this.updateDynamicCgpaSpawnsAndHazards(dt * timeScale);

    // 7. Update The Bell Curve Sweeping Wave Hazard
    this.updateBellCurve(dt * timeScale);

    // 8. Update Retake Rune Traps
    for (const trap of this.level.retakeTraps) {
      if (trap.triggeredCooldown > 0) {
        trap.triggeredCooldown -= dt;
        continue;
      }
      const hitTrap =
        this.player.x + this.player.w > trap.x &&
        this.player.x < trap.x + trap.w &&
        this.player.y + this.player.h >= trap.y - 6 &&
        this.player.y <= trap.y + trap.h;

      if (hitTrap) {
        trap.triggeredCooldown = 3.0;
        if (medicalActive) {
          this.notify('MEDICAL CERTIFICATE BLOCKED RETAKE RUNE TRAP!');
        } else {
          soundEngine.play('retake_warp');
          this.player.x = trap.rewindX;
          this.player.y = trap.rewindY;
          this.enemySpeedMultiplier = Math.min(1.6, this.enemySpeedMultiplier + 0.22);
          this.spawnBurst(this.player.x, this.player.y, '#e879f9', 16);
          this.notify('RETAKE RUNE TRIGGERED! TELEPORTED BACK & ENEMIES ACCELERATED!');
        }
      }
    }

    // 9. Update Collectibles (Power-Ups & Assignment Keys)
    for (const item of this.level.collectibles) {
      if (item.collected) continue;
      const dx = this.player.x + this.player.w * 0.5 - item.x;
      const dy = this.player.y + this.player.h * 0.5 - item.y;
      if (dx * dx + dy * dy < 38 * 38) {
        item.collected = true;
        soundEngine.play('powerup_pickup');
        if (item.kind === 'ASSIGNMENT_KEY') {
          this.player.hasAssignmentKey = true;
          this.notify('COLLECTED ASSIGNMENT KEY! APPROACH THE PREREQUISITE GOLEM TO UNLOCK.');
          this.spawnFloatingText(item.x, item.y - 10, 'ASSIGNMENT KEY', '#fbbf24');
        } else if (item.powerUpType) {
          const meta = POWER_UP_CATALOG[item.powerUpType];
          const emptyIdx = this.player.inventory.findIndex((s) => s === null);
          if (emptyIdx !== -1) {
            this.player.inventory[emptyIdx] = item.powerUpType;
            this.notify(`STORED [${meta.shortName.toUpperCase()}] IN SLOT ${emptyIdx + 1}`);
          } else {
            // Inventory full -> activate immediately so nothing is wasted!
            this.activatePowerUp(item.powerUpType);
          }
          this.spawnFloatingText(item.x, item.y - 10, `+${meta.shortName}`, meta.color);
        }
      }
    }

    // 10. Update Group Study AI Classmate Clones
    this.updateClones(dt);

    // 11. Update Enemies
    this.updateEnemies(dt * timeScale, chaActive);

    // 12. Update Boss & Telegraphs
    this.updateTelegraphs(dt * timeScale);
    updateBoss(this.level.boss, {
      dt,
      timeScale,
      playerX: this.player.x,
      playerY: this.player.y,
      playerW: this.player.w,
      playerH: this.player.h,
      floorY: this.level.floorY,
      arenaLeftX: this.level.bossArenaLeftX,
      arenaRightX: this.level.bossArenaRightX,
      platforms: this.level.platforms,
      projectiles: this.projectiles,
      telegraphs: this.telegraphs,
      particles: this.particles,
      onDamagePlayer: (hp, cgpa, reason, isUlt) => this.damagePlayer(hp, cgpa, reason, isUlt),
      onScreenShake: (intensity, mode) => this.triggerScreenShake(intensity, mode),
      onNotify: (msg) => this.notify(msg),
    });

    // 13. Update Projectiles
    this.updateProjectiles(dt, questionBankActive, revisionActive);

    // 15. Smooth Camera Tracking (Portrait & Landscape Adaptive)
    let desiredCamX = this.player.x + this.player.w * 0.5 - viewW * 0.38;
    if (this.level.boss.active) {
      const arenaW = this.level.bossArenaRightX - this.level.bossArenaLeftX;
      if (viewW >= arenaW) {
        desiredCamX = (this.level.bossArenaLeftX + this.level.bossArenaRightX - viewW) * 0.5;
      } else {
        // In narrower portrait viewports, track the player within the boss arena bounds
        const focusX = (this.player.x + this.player.w * 0.5) * 0.7 + (this.level.boss.x + this.level.boss.w * 0.5) * 0.3;
        desiredCamX = Math.max(
          this.level.bossArenaLeftX - 24,
          Math.min(this.level.bossArenaRightX - viewW + 24, focusX - viewW * 0.5)
        );
      }
    }
    const targetCamX = Math.max(0, Math.min(this.level.worldWidth - viewW, desiredCamX));

    const isPortraitView = viewH > viewW;
    const floorScreenRatio = isPortraitView ? 0.68 : 0.82;
    const baseCamY = this.level.floorY - viewH * floorScreenRatio;
    const verticalFollowOffset = Math.min(0, (this.player.y - (this.level.floorY - 140)) * 0.25);
    const targetCamY = Math.max(-720, Math.min(180, baseCamY + verticalFollowOffset));

    this.camX += (targetCamX - this.camX) * Math.min(1, dt * 7);
    this.camY += (targetCamY - this.camY) * Math.min(1, dt * 7);

    // Sync HUD periodically (~15Hz) so React never bottlenecks 60fps Canvas
    this.hudSyncAccum += rawDt;
    if (this.hudSyncAccum >= 0.065) {
      this.hudSyncAccum = 0;
      this.emitHud();
    }
  }

  private updateParticles(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      if (pt.drag) {
        const damp = Math.max(0, 1 - pt.drag * dt);
        pt.vx *= damp;
      }
      if (pt.gravity) {
        pt.vy += pt.gravity * dt;
      }
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      if (pt.rotation !== undefined && pt.vRot !== undefined) {
        pt.rotation += pt.vRot * dt;
      }
      pt.life -= dt;
      if (pt.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  private computeShakeOffsets(): { x: number; y: number } {
    if (this.shakeIntensity <= 0) return { x: 0, y: 0 };

    if (this.shakeMode === 'HIGH_FREQ_JITTER') {
      // Subtle, high-frequency camera jitters (~62Hz) when the player takes damage
      const freq = 62 * Math.PI * 2;
      const sx = Math.sin(this.shakePhase * freq) * this.shakeIntensity + (Math.random() - 0.5) * this.shakeIntensity * 0.6;
      const sy = Math.cos(this.shakePhase * freq * 1.17) * this.shakeIntensity * 0.85;
      return { x: sx, y: sy };
    }

    if (this.shakeMode === 'LOW_FREQ_HEAVY') {
      // Heavy, low-frequency seismic screen shake (~11Hz) during Academic Dismissal hydraulic slams
      const lowFreq = 11 * Math.PI * 2;
      const sx = Math.sin(this.shakePhase * lowFreq) * this.shakeIntensity * 0.85;
      const sy = Math.cos(this.shakePhase * lowFreq * 0.85) * this.shakeIntensity * 1.35;
      return { x: sx, y: sy };
    }

    // Standard balanced shake
    return {
      x: (Math.random() - 0.5) * this.shakeIntensity * 2,
      y: (Math.random() - 0.5) * this.shakeIntensity * 2,
    };
  }

  public render(ctx: CanvasRenderingContext2D, viewW: number, viewH: number): void {
    if (this.elapsedSeconds === 0) {
      const isPortraitView = viewH > viewW;
      const floorScreenRatio = isPortraitView ? 0.68 : 0.82;
      this.camY = Math.max(-720, Math.min(180, this.level.floorY - viewH * floorScreenRatio));
    }
    const { x: shakeX, y: shakeY } = this.computeShakeOffsets();

    renderGameScene({
      ctx,
      viewW,
      viewH,
      camX: this.camX + shakeX,
      camY: this.camY + shakeY,
      levelId: this.level.id,
      floorY: this.level.floorY,
      arenaLeftX: this.level.bossArenaLeftX,
      arenaRightX: this.level.bossArenaRightX,
      player: {
        x: this.player.x,
        y: this.player.y,
        w: this.player.w,
        h: this.player.h,
        vx: this.player.vx,
        vy: this.player.vy,
        facing: this.player.facing,
        grounded: this.player.grounded,
        dashing: this.player.dashing,
        meleeTimer: this.player.meleeTimer,
        meleeRange: this.buffs.has('EXTRA_SHEET') ? 132 : 76,
        invulnTimer: this.player.invulnTimer,
        hasBonusMark: this.player.hasBonusMarkShield,
        silenced: this.buffs.has('BLANK_SILENCE'),
        chaActive: this.buffs.has('CHA_ESPRESSO'),
        revisionActive: this.buffs.has('ONE_NIGHT_REVISION'),
        medicalActive: this.buffs.has('MEDICAL_CERT'),
        questionBankActive: this.buffs.has('PAST_QUESTION_BANK'),
        animTime: this.player.animTime,
        shattering: this.playerShattering,
        shatterProgress: this.playerShattering
          ? Math.min(1, this.playerShatterTimer / this.playerShatterDuration)
          : 0,
        researchMomentum: this.player.researchMomentum,
        comboCount: this.player.comboCount,
        comboStep: this.player.comboStep,
        trailNodes: this.player.trailNodes,
      },
      platforms: this.level.platforms,
      enemies: this.level.enemies,
      retakeTraps: this.level.retakeTraps,
      collectibles: this.level.collectibles,
      bellCurve: this.level.bellCurve,
      clones: this.clones,
      projectiles: this.projectiles,
      telegraphs: this.telegraphs,
      boss: this.level.boss,
      bossIntro: this.bossIntro,
      ghostPath: this.deathGhostPath,
      showGhostOverlay: this.isGameOverState,
      particles: this.particles,
      time: this.totalTime,
    });
  }

  private registerMeleeComboHit(hitX: number, hitY: number): { damageMultiplier: number; momentumRatio: number } {
    const prevMomentum = this.player.researchMomentum;
    this.player.comboCount += 1;
    const momentumGain = this.player.comboStep === 3 ? 22 : 14;
    this.player.researchMomentum = Math.min(100, this.player.researchMomentum + momentumGain);
    this.player.comboDecayTimer = 3.8;

    const momentumRatio = this.player.researchMomentum / 100;
    // Research Momentum scales melee damage up to 2.0x at 100% + 1.25x finisher bonus on 3rd combo step
    const stepBonus = this.player.comboStep === 3 ? 1.25 : this.player.comboStep === 2 ? 1.1 : 1.0;
    const damageMultiplier = (1 + momentumRatio * 1.0) * stepBonus;

    // Visual burst of momentum sparks along the weapon arc
    const sparkColor =
      momentumRatio >= 0.8 ? '#fbbf24' : momentumRatio >= 0.4 ? '#c084fc' : '#38bdf8';
    this.spawnBurst(hitX, hitY, sparkColor, this.player.comboStep === 3 ? 12 : 6);

    if (prevMomentum < 100 && this.player.researchMomentum >= 100) {
      this.notify('MAX RESEARCH MOMENTUM (2.0x MELEE DAMAGE & THESIS OVERDRIVE TRAIL)!');
      this.spawnFloatingText(this.player.x + this.player.w * 0.5, this.player.y - 26, 'THESIS OVERDRIVE!', '#fbbf24');
    } else if (this.player.comboCount >= 2) {
      const label =
        this.player.comboStep === 3
          ? `${this.player.comboCount}x FINISHER!`
          : `${this.player.comboCount}x COMBO`;
      this.spawnFloatingText(hitX, hitY - 22, label, sparkColor);
    }

    return { damageMultiplier, momentumRatio };
  }

  private performMeleeHitCheck(
    extraSheetActive: boolean,
    revisionActive: boolean,
    questionBankActive: boolean
  ): void {
    const baseReach = extraSheetActive ? 132 : 76;
    const reach = Math.round(baseReach * (this.player.comboStep === 3 ? 1.18 : 1.0));
    const hitboxX =
      this.player.facing > 0
        ? this.player.x + this.player.w * 0.5
        : this.player.x + this.player.w * 0.5 - reach;
    const hitboxY = this.player.y - 10;
    const hitboxW = reach;
    const hitboxH = this.player.h + 20;

    let baseDamage = 32;
    if (revisionActive) baseDamage = Math.round(baseDamage * 2.5);

    let comboRegisteredForSwing = false;
    let swingDamage = baseDamage;
    let swingMomentumRatio = this.player.researchMomentum / 100;

    // Check enemies
    for (let i = this.level.enemies.length - 1; i >= 0; i--) {
      const e = this.level.enemies[i];
      const overlap =
        hitboxX + hitboxW > e.x &&
        hitboxX < e.x + e.w &&
        hitboxY + hitboxH > e.y &&
        hitboxY < e.y + e.h;

      if (!overlap) continue;

      if (e.kind === 'PREREQUISITE') {
        if (this.player.hasAssignmentKey) {
          this.unlockPrerequisite(e);
        } else {
          soundEngine.play('prerequisite_lock');
          this.spawnFloatingText(e.x + e.w * 0.5, e.y, 'NEED KEY OR CHIT!', '#fbbf24');
        }
        continue;
      }

      if (e.kind === 'DEANS_LIST') {
        // Only takes damage from behind or while boosted (One-Night Revision)
        const playerCenter = this.player.x + this.player.w * 0.5;
        const enemyCenter = e.x + e.w * 0.5;
        const hitFromBehind =
          (e.facing === 1 && playerCenter < enemyCenter) ||
          (e.facing === -1 && playerCenter > enemyCenter);

        if (!hitFromBehind && !revisionActive) {
          soundEngine.playArmorClang();
          this.spawnFloatingText(e.x + e.w * 0.5, e.y, 'BLOCKED! HIT FROM BEHIND', '#fde047');
          continue;
        }
      }

      if (!comboRegisteredForSwing) {
        comboRegisteredForSwing = true;
        const { damageMultiplier, momentumRatio } = this.registerMeleeComboHit(
          e.x + e.w * 0.5,
          e.y + e.h * 0.45
        );
        swingDamage = Math.round(baseDamage * damageMultiplier);
        swingMomentumRatio = momentumRatio;
      }

      e.hp -= swingDamage;
      e.hitFlash = 0.14;
      this.hitstopTimer = this.player.comboStep === 3 ? 0.05 : 0.035;
      soundEngine.playHitImpact(
        revisionActive || this.player.comboStep === 3,
        this.player.comboCount,
        swingMomentumRatio
      );
      hapticService.meleeHit(
        revisionActive || this.player.comboStep === 3,
        this.player.comboCount
      );
      this.spawnBloodPaperConfetti(
        e.x + e.w * 0.5,
        e.y + e.h * 0.45,
        revisionActive || this.player.comboStep === 3 ? 20 : 14
      );
      this.spawnFloatingText(
        e.x + e.w * 0.5,
        e.y,
        `-${swingDamage}`,
        this.player.comboStep === 3 ? '#fde047' : '#fda4af'
      );

      if (e.hp <= 0) {
        this.spawnBloodPaperConfetti(e.x + e.w * 0.5, e.y + e.h * 0.5, 24);
        this.level.enemies.splice(i, 1);
        this.player.cgpa = Math.min(4.0, +(this.player.cgpa + 0.05).toFixed(2));
        this.spawnFloatingText(e.x + e.w * 0.5, e.y - 16, '+0.05 CGPA', '#4ade80');
      }
    }

    // Check Boss
    const boss = this.level.boss;
    if (boss.active && !boss.defeated) {
      const overlap =
        hitboxX + hitboxW > boss.x &&
        hitboxX < boss.x + boss.w &&
        hitboxY + hitboxH > boss.y &&
        hitboxY < boss.y + boss.h;
      if (overlap) {
        const hitX = hitboxX + hitboxW * 0.5;
        const hitY = hitboxY + hitboxH * 0.5;
        if (!comboRegisteredForSwing) {
          comboRegisteredForSwing = true;
          const { damageMultiplier } = this.registerMeleeComboHit(hitX, hitY);
          swingDamage = Math.round(baseDamage * damageMultiplier);
        }
        this.applyBossDamage(swingDamage, hitX, hitY, questionBankActive, revisionActive);
      }
    }
  }

  private applyBossDamage(
    rawDamage: number,
    hitX: number,
    hitY: number,
    questionBankActive: boolean,
    revisionActive: boolean
  ): void {
    const boss = this.level.boss;
    let dmg = rawDamage;
    // One-Night Revision is extra effective against The Syllabus
    if (boss.level === 1 && revisionActive) {
      dmg = Math.round(dmg * 1.35);
    }

    // Check weak spot critical hit
    const wx = boss.x + boss.weakSpotOffset.x;
    const wy = boss.y + boss.weakSpotOffset.y;
    const ww = boss.weakSpotOffset.w;
    const wh = boss.weakSpotOffset.h;
    const inWeakSpot = hitX >= wx - 16 && hitX <= wx + ww + 16 && hitY >= wy - 16 && hitY <= wy + wh + 16;
    const isCrit = questionBankActive || inWeakSpot;
    if (isCrit) {
      dmg = Math.round(dmg * (questionBankActive ? 2.0 : 1.4));
    }

    boss.hp = Math.max(0, boss.hp - dmg);
    boss.hitFlash = 0.12;
    this.hitstopTimer = 0.04;
    soundEngine.playHitImpact(
      isCrit,
      this.player.comboCount,
      this.player.researchMomentum / 100
    );
    hapticService.meleeHit(isCrit || this.player.comboStep === 3, this.player.comboCount);

    // Trigger blood-red paper confetti on boss damage (mixed with yellowing scroll confetti on Syllabus)
    this.spawnBloodPaperConfetti(hitX, hitY, isCrit ? 18 : 12);
    if (boss.level === 1) {
      this.spawnPaperConfetti(hitX, hitY, 10);
    }
    this.spawnFloatingText(hitX, boss.y - 8, isCrit ? `CRIT -${dmg}!` : `-${dmg}`, isCrit ? '#e9d5ff' : '#fda4af');

    if (boss.hp <= 0 && !boss.defeated) {
      boss.defeated = true;
      boss.active = false;
      this.telegraphs = [];
      this.projectiles = [];
      soundEngine.setBossSilence(false);
      this.triggerScreenShake(22, 'LOW_FREQ_HEAVY');
      this.spawnBloodPaperConfetti(boss.x + boss.w * 0.5, boss.y + boss.h * 0.5, 32);
      this.spawnPaperConfetti(boss.x + boss.w * 0.5, boss.y + boss.h * 0.5, 28);

      if (this.level.id < 3) {
        const nextLevel = (this.level.id + 1) as LevelId;
        this.onLevelUnlock?.(nextLevel);
        this.notify(`${boss.name} DEFEATED! FLOOR ${nextLevel} UNLOCKED — ADVANCING...`);
        window.setTimeout(() => {
          this.loadLevel(nextLevel, false);
        }, 1200);
      } else {
        this.player.cgpa = Math.min(4.0, +(this.player.cgpa + 0.35).toFixed(2));
        soundEngine.playVictoryMusic();
        this.emitHud();
        this.onVictory(this.player.cgpa, this.elapsedSeconds);
      }
    }
  }

  private unlockPrerequisite(prereq: Enemy): void {
    this.player.hasAssignmentKey = false;
    soundEngine.play('prerequisite_lock');
    soundEngine.playPowerUpUse();
    this.spawnBurst(prereq.x + prereq.w * 0.5, prereq.y + prereq.h * 0.5, '#fbbf24', 20);
    this.level.enemies = this.level.enemies.filter((e) => e.id !== prereq.id);
    this.level.platforms = this.level.platforms.filter((p) => p.lockedById !== prereq.id);
    this.notify('PREREQUISITE GOLEM UNLOCKED! GATEWAY OPENED.');
  }

  private updateBellCurve(dt: number): void {
    const wave = this.level.bellCurve;
    if (!wave.active && this.player.x >= wave.startX && this.player.x < wave.endX) {
      wave.active = true;
      wave.x = wave.startX - 180;
      soundEngine.play('bell_curve_hum');
      this.notify('WARNING: THE BELL CURVE WAVE IS SWEEPING BEHIND YOU! KEEP MOVING!');
    }

    if (wave.active) {
      const { hazardFrequencyMultiplier } = this.getCgpaDifficultyModifiers();
      // Group Study clones push back The Bell Curve wave; lower CGPA (Probation) accelerates the wave!
      const pushback =
        this.clones.length > 0 ? -45 : wave.speed * hazardFrequencyMultiplier;
      wave.x += pushback * dt;
      if (this.player.x >= wave.endX) {
        wave.active = false;
      } else if (this.player.x < wave.x) {
        this.player.vx = 380;
        this.player.x = wave.x + 28;
        this.damagePlayer(18, 0.25, 'Crushed by The Bell Curve Wave');
      }
    }
  }

  private updateDynamicCgpaSpawnsAndHazards(dt: number): void {
    // Do not spawn corridor waves once inside the Boss Arena
    if (this.level.boss.active || this.bossIntro?.active) return;

    const {
      enemyHpMultiplier,
      enemySpawnRateMultiplier,
      hazardFrequencyMultiplier,
    } = this.getCgpaDifficultyModifiers();

    // 1. Dynamic All-Nighter & Blank Sheet Spawn Rate scaled by CGPA (higher CGPA -> faster spawns & higher HP)
    this.dynamicEnemySpawnTimer -= dt * enemySpawnRateMultiplier;
    if (this.dynamicEnemySpawnTimer <= 0) {
      // Base interval is ~10.5s, reduced when enemySpawnRateMultiplier > 1
      this.dynamicEnemySpawnTimer = 10.5;
      const activeDynamicCount = this.level.enemies.filter(
        (e) => e.kind === 'ALL_NIGHTER' || e.kind === 'BLANK_SHEET'
      ).length;
      const maxCorridorEnemies = this.player.cgpa >= 3.3 ? 9 : 6;

      if (
        activeDynamicCount < maxCorridorEnemies &&
        this.player.x < this.level.bossArenaTriggerX - 280
      ) {
        const spawnKind = Math.random() < 0.58 ? 'ALL_NIGHTER' : 'BLANK_SHEET';
        const spawnX = Math.min(
          this.level.bossArenaTriggerX - 140,
          this.player.x + 290 + Math.random() * 140
        );
        const baseHp = spawnKind === 'ALL_NIGHTER' ? 56 : 64;
        const scaledHp = Math.round(baseHp * enemyHpMultiplier);
        const h = spawnKind === 'ALL_NIGHTER' ? 56 : 58;

        this.level.enemies.push({
          id: `cgpa-spawn-${Date.now()}-${Math.random()}`,
          kind: spawnKind,
          x: spawnX,
          y: this.level.floorY - h,
          w: 40,
          h,
          vx: spawnKind === 'ALL_NIGHTER' ? 145 : 115,
          vy: 0,
          hp: scaledHp,
          maxHp: scaledHp,
          baseMaxHp: baseHp,
          facing: -1,
          patrolMinX: Math.max(60, spawnX - 220),
          patrolMaxX: Math.min(this.level.bossArenaTriggerX - 80, spawnX + 220),
          stateTimer: 0,
          attackCooldown: 0,
          hitFlash: 0,
          isDynamicSpawn: true,
        });

        this.spawnBurst(spawnX + 20, this.level.floorY - 30, '#c084fc', 14);
        if (this.player.cgpa >= 3.4) {
          this.spawnFloatingText(
            spawnX + 20,
            this.level.floorY - 68,
            `DEAN'S LIST CHALLENGER (${enemyHpMultiplier}x HP)`,
            '#c084fc'
          );
        }
      }
    }

    // 2. Probation Environmental Hazard Surge (Lower CGPA triggers frequent environmental hazards)
    if (this.player.cgpa < 2.65) {
      this.probationHazardTimer -= dt * hazardFrequencyMultiplier;
      if (this.probationHazardTimer <= 0) {
        this.probationHazardTimer = 5.4;
        const hazardX = Math.max(
          80,
          Math.min(
            this.level.bossArenaTriggerX - 120,
            this.player.x + this.player.vx * 0.35 - 35 + (Math.random() - 0.5) * 90
          )
        );
        const teleDur = Math.max(0.65, 1.05 / Math.sqrt(hazardFrequencyMultiplier));
        soundEngine.play('probation_beep');
        this.telegraphs.push({
          id: `prob-hazard-${Date.now()}`,
          x: hazardX,
          y: this.level.floorY - 290,
          w: 92,
          h: 290,
          timer: teleDur,
          duration: teleDur,
          kind: 'PROBATION_FALLING_HAZARD',
          color: '#f59e0b',
          label: 'PROBATION HAZARD · FALLING DEBRIS',
        });
      }
    }
  }

  private updateClones(dt: number): void {
    for (let i = this.clones.length - 1; i >= 0; i--) {
      const c = this.clones[i];
      c.remaining -= dt;
      if (c.remaining <= 0) {
        this.clones.splice(i, 1);
        continue;
      }
      const targetX = this.player.x + (c.offsetIndex === 0 ? -48 : 48);
      const targetY = this.player.y - 24;
      c.x += (targetX - c.x) * Math.min(1, dt * 8);
      c.y += (targetY - c.y) * Math.min(1, dt * 8);

      c.fireCooldown -= dt;
      if (c.fireCooldown <= 0) {
        c.fireCooldown = 0.65;
        this.projectiles.push({
          id: `clone-proj-${Date.now()}-${i}`,
          x: c.x,
          y: c.y,
          vx: this.player.facing * 560,
          vy: 0,
          radius: 7,
          damage: 18,
          fromPlayer: true,
          kind: 'CRUMPLED_PAPER',
          color: '#d8b4fe',
          life: 1.3,
        });
      }
    }
  }

  private updateEnemies(dt: number, chaActive: boolean): void {
    for (let i = this.level.enemies.length - 1; i >= 0; i--) {
      const e = this.level.enemies[i];
      if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);

      // Auto-unlock Prerequisite if player walks close while holding Assignment Key
      if (e.kind === 'PREREQUISITE') {
        const dist = Math.abs(this.player.x + this.player.w * 0.5 - (e.x + e.w * 0.5));
        if (dist < 85 && this.player.hasAssignmentKey) {
          this.unlockPrerequisite(e);
          continue;
        }
      } else {
        e.x += e.vx * e.facing * this.enemySpeedMultiplier * dt;
        if (e.x <= e.patrolMinX) {
          e.x = e.patrolMinX;
          e.facing = 1;
        } else if (e.x + e.w >= e.patrolMaxX) {
          e.x = e.patrolMaxX - e.w;
          e.facing = -1;
        }
      }

      // Check contact with player
      const overlap =
        this.player.x + this.player.w > e.x + 4 &&
        this.player.x < e.x + e.w - 4 &&
        this.player.y + this.player.h > e.y + 4 &&
        this.player.y < e.y + e.h - 4;

      if (!overlap) continue;

      if (e.kind === 'ALL_NIGHTER') {
        // Rapidly drains stamina while temporarily boosting player speed
        if (!chaActive) {
          this.player.stamina = Math.max(0, this.player.stamina - 52 * dt);
        }
        if (!this.buffs.has('ALL_NIGHTER_JITTERS')) {
          soundEngine.play('all_nighter_screech');
        }
        this.addBuff('ALL_NIGHTER_JITTERS', 'All-Nighter Jitters (+35% Speed / Stamina Drain)', 2.2, '#ef4444');
        this.damagePlayer(10, 0.14, 'Drained by All-Nighter Shadow Wraith');
      } else if (e.kind === 'BLANK_SHEET') {
        // Disables ranged/dash abilities on hit until cured by Friend's Notes or timed out
        if (!this.buffs.has('BLANK_SILENCE')) {
          soundEngine.play('blank_sheet_erase');
        }
        this.addBuff('BLANK_SILENCE', 'Blank Sheet Silence (No Dash/Ranged)', 5.5, '#f8fafc');
        this.damagePlayer(14, 0.18, 'Abilities Erased by Blank Sheet Mimic');
      } else if (e.kind === 'DEANS_LIST') {
        this.damagePlayer(20, 0.24, "Struck by Dean's List Honor Guard");
      } else if (e.kind === 'PREREQUISITE') {
        soundEngine.play('prerequisite_lock');
        if (this.player.dashing) {
          const normalDir = this.player.x < e.x ? -1 : 1;
          this.triggerWallDashSparks(
            normalDir < 0 ? e.x : e.x + e.w,
            this.player.y + this.player.h * 0.45,
            normalDir
          );
          this.player.dashing = false;
        }
        this.player.vx = -this.player.facing * 260;
      }
    }
  }

  private updateTelegraphs(dt: number): void {
    for (let i = this.telegraphs.length - 1; i >= 0; i--) {
      const t = this.telegraphs[i];
      t.timer -= dt;
      if (t.timer <= 0) {
        // Check if player is inside telegraph impact zone when it fires
        const hit =
          this.player.x + this.player.w > t.x &&
          this.player.x < t.x + t.w &&
          this.player.y + this.player.h > t.y &&
          this.player.y < t.y + t.h;

        if (hit) {
          if (t.kind === 'ULTIMATE_DISMISSED') {
            // Phase 2 Ultimate "DISMISSED" screen-wide slam:
            // Survived if standing on high floating platform (player.y + player.h <= 390), dashing invulnerability, or Bonus Mark shield!
            const onHighPlatform = this.player.y + this.player.h <= 395;
            if (!onHighPlatform) {
              this.damagePlayer(100, 3.5, 'STAMPED: ACADEMICALLY DISMISSED!', true);
            } else {
              this.notify('EVADED ULTIMATE DISMISSAL SLAM ON HIGH PLATFORM!');
            }
          } else if (t.kind === 'TEXTBOOK_SLAM') {
            this.damagePlayer(24, 0.3, 'Crushed by Hardcover Textbook Slam');
          } else if (t.kind === 'CHAIN_LASER') {
            this.damagePlayer(20, 0.25, 'Scortched by Probation Warning Laser');
          } else if (t.kind === 'STAMP_SHOCKWAVE') {
            this.damagePlayer(24, 0.3, 'Crushed by Hydraulic Red Stamp');
          } else if (t.kind === 'ERASER_SWEEP') {
            this.damagePlayer(18, 0.22, 'Sliced by Razor Eraser Blade');
          } else if (t.kind === 'PROBATION_FALLING_HAZARD') {
            this.damagePlayer(15, 0.18, 'Struck by Probation Falling Ceiling Hazard');
          }
        }
        if (t.kind === 'PROBATION_FALLING_HAZARD') {
          soundEngine.play('grade_drop_crack');
          this.spawnBurst(t.x + t.w * 0.5, this.level.floorY - 12, '#f59e0b', 10);
        }
        this.telegraphs.splice(i, 1);
      }
    }
  }

  private updateProjectiles(dt: number, questionBankActive: boolean, revisionActive: boolean): void {
    const boss = this.level.boss;

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) {
        this.projectiles.splice(i, 1);
        continue;
      }

      if (p.fromPlayer) {
        let consumed = false;
        // Hit enemy
        for (let j = this.level.enemies.length - 1; j >= 0; j--) {
          const e = this.level.enemies[j];
          if (p.x >= e.x && p.x <= e.x + e.w && p.y >= e.y && p.y <= e.y + e.h) {
            if (e.kind === 'PREREQUISITE') {
              soundEngine.playArmorClang();
              consumed = true;
              break;
            }
            if (e.kind === 'DEANS_LIST') {
              const hitBehind = (e.facing === 1 && p.vx > 0) || (e.facing === -1 && p.vx < 0);
              if (!hitBehind && !revisionActive) {
                soundEngine.playArmorClang();
                consumed = true;
                break;
              }
            }
            e.hp -= p.damage;
            e.hitFlash = 0.1;
            soundEngine.playHitImpact(false);
            this.spawnBloodPaperConfetti(p.x, p.y, 12);
            if (e.hp <= 0) {
              this.spawnBloodPaperConfetti(e.x + e.w * 0.5, e.y + e.h * 0.5, 22);
              this.level.enemies.splice(j, 1);
              this.player.cgpa = Math.min(4.0, +(this.player.cgpa + 0.05).toFixed(2));
            }
            consumed = true;
            break;
          }
        }

        // Hit Boss
        if (!consumed && boss.active && !boss.defeated) {
          if (p.x >= boss.x && p.x <= boss.x + boss.w && p.y >= boss.y && p.y <= boss.y + boss.h) {
            this.applyBossDamage(p.damage, p.x, p.y, questionBankActive, revisionActive);
            consumed = true;
          }
        }

        if (consumed) {
          this.projectiles.splice(i, 1);
        }
      } else {
        // Enemy/Boss projectile hitting Player
        const hitPlayer =
          p.x + p.radius > this.player.x &&
          p.x - p.radius < this.player.x + this.player.w &&
          p.y + p.radius > this.player.y &&
          p.y - p.radius < this.player.y + this.player.h;

        if (hitPlayer) {
          this.damagePlayer(p.damage, 0.2, 'Hit by Boss Projectile');
          if (!p.pierce) {
            this.projectiles.splice(i, 1);
          }
        }
      }
    }
  }

  public useInventorySlot(slotIndex: number): void {
    const type = this.player.inventory[slotIndex];
    if (!type) return;
    this.player.inventory[slotIndex] = null;
    this.activatePowerUp(type);
    this.emitHud();
  }

  private activatePowerUp(type: PowerUpType): void {
    soundEngine.playPowerUpUse();
    const meta = POWER_UP_CATALOG[type];

    switch (type) {
      case 'CHA_ESPRESSO':
        this.player.stamina = this.player.maxStamina;
        this.addBuff('CHA_ESPRESSO', '3 AM Cha (2x Speed & Infinite Stamina)', 6.0, meta.color);
        this.notify('3 AM CHA ACTIVATED: 2x SPEED & INFINITE STAMINA FOR 6S!');
        break;
      case 'EXTRA_SHEET':
        this.player.stamina = this.player.maxStamina;
        this.addBuff('EXTRA_SHEET', 'Extra Sheet (2x Melee Reach)', 10.0, meta.color);
        this.notify('EXTRA SHEET: STAMINA REFILLED & 2x LAB REPORT REACH!');
        break;
      case 'ONE_NIGHT_REVISION':
        this.addBuff('ONE_NIGHT_REVISION', 'One-Night Revision (2.5x Damage)', 8.0, meta.color);
        this.notify('ONE-NIGHT REVISION: 2.5x DAMAGE BOOST FOR 8S!');
        break;
      case 'BONUS_MARK':
        this.player.hasBonusMarkShield = true;
        this.notify('FACULTY BONUS MARK ACTIVE: ABSORBS NEXT LETHAL HIT OR DISMISSAL!');
        break;
      case 'GROUP_STUDY':
        this.clones = [
          { id: 'c1', x: this.player.x - 40, y: this.player.y - 20, vx: 0, vy: 0, remaining: 10.0, fireCooldown: 0.2, offsetIndex: 0 },
          { id: 'c2', x: this.player.x + 40, y: this.player.y - 20, vx: 0, vy: 0, remaining: 10.0, fireCooldown: 0.45, offsetIndex: 1 },
        ];
        this.addBuff('GROUP_STUDY', 'Group Study (2 AI Clones)', 10.0, meta.color);
        this.notify('GROUP STUDY: 2 AI CLASSMATE CLONES SPAWNED FOR 10S!');
        break;
      case 'CHIT': {
        const prereq = this.level.enemies.find((e) => e.kind === 'PREREQUISITE');
        if (prereq) {
          this.unlockPrerequisite(prereq);
        }
        // Spawns fast patrol guards for 10s
        this.addBuff('CHIT', 'Chit Alert (Fast Patrol Guards)', 10.0, meta.color);
        this.level.enemies.push({
          id: `patrol-${Date.now()}`,
          kind: 'ALL_NIGHTER',
          x: Math.min(this.level.worldWidth - 120, this.player.x + 260),
          y: this.level.floorY - 56,
          w: 40,
          h: 56,
          vx: 195,
          vy: 0,
          hp: 40,
          maxHp: 40,
          facing: -1,
          patrolMinX: Math.max(40, this.player.x - 300),
          patrolMaxX: Math.min(this.level.worldWidth - 60, this.player.x + 360),
          stateTimer: 0,
          attackCooldown: 0,
          hitFlash: 0,
          isPatrolSpawn: true,
        });
        this.notify('CHIT USED! PREREQUISITE BYPASSED, INVIGILATOR PATROL ALERTED!');
        break;
      }
      case 'GRACE_PERIOD':
        this.addBuff('GRACE_PERIOD', 'Grace Period (50% Slow Time)', 7.0, meta.color);
        this.notify('GRACE PERIOD: ENEMIES & COLLAPSING PLATFORMS SLOWED 50% FOR 7S!');
        break;
      case 'MEDICAL_CERT':
        this.addBuff('MEDICAL_CERT', 'Medical Certificate (Invulnerable)', 5.0, meta.color);
        this.player.invulnTimer = Math.max(this.player.invulnTimer, 5.0);
        this.notify('SIGNED MEDICAL CERTIFICATE: 5S INVULNERABILITY & TRAP IMMUNITY!');
        break;
      case 'FRIENDS_NOTES':
        this.buffs.delete('BLANK_SILENCE');
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + 20);
        this.player.cgpa = Math.min(4.0, +(this.player.cgpa + 0.15).toFixed(2));
        this.notify("FRIEND'S NOTES: ABILITIES RESTORED, +20 HP & +0.15 CGPA!");
        break;
      case 'PAST_QUESTION_BANK':
        this.addBuff('PAST_QUESTION_BANK', 'Question Bank (2x Boss Crit & Sightlines)', 12.0, meta.color);
        this.notify('PAST QUESTION BANK: BOSS WEAK SPOT HIGHLIGHTED FOR 2x CRIT DAMAGE!');
        break;
    }
  }

  private addBuff(
    type: ActiveBuffTimer['type'],
    label: string,
    duration: number,
    color: string
  ): void {
    this.buffs.set(type, {
      type,
      label,
      remaining: duration,
      duration,
      color,
    });
  }

  private damagePlayer(
    hpLoss: number,
    cgpaLoss: number,
    reason: string,
    isUltimate: boolean = false
  ): void {
    if (this.playerShattering) return;
    if (!isUltimate && (this.player.invulnTimer > 0 || this.buffs.has('MEDICAL_CERT'))) {
      return;
    }
    if (isUltimate && (this.player.dashing || this.buffs.has('MEDICAL_CERT'))) {
      this.notify('PERFECT DASH! DODGED ACADEMIC DISMISSAL SLAM!');
      return;
    }

    // Check Bonus Mark Shield (absorbs one lethal hit or saves from 0.00 CGPA / Ultimate)
    if (
      this.player.hasBonusMarkShield &&
      (isUltimate || this.player.hp - hpLoss <= 0 || this.player.cgpa - cgpaLoss <= 0.01)
    ) {
      this.player.hasBonusMarkShield = false;
      this.player.invulnTimer = 1.6;
      soundEngine.playPowerUpUse();
      this.triggerScreenShake(12, 'STANDARD');
      this.spawnBurst(this.player.x + this.player.w * 0.5, this.player.y + this.player.h * 0.5, '#fbbf24', 24);
      this.notify('BONUS MARK SHIELD ABSORBED LETHAL DISMISSAL HIT!');
      this.emitHud();
      return;
    }

    this.player.hp = Math.max(0, this.player.hp - hpLoss);
    this.player.cgpa = Math.max(0, +(this.player.cgpa - cgpaLoss).toFixed(2));
    this.player.invulnTimer = 1.05;

    soundEngine.play('player_hurt');
    hapticService.playerDamage();
    this.recordGhostSample('HURT', true);
    // Subtle, high-frequency camera jitter when the player takes damage
    this.triggerScreenShake(6.5, 'HIGH_FREQ_JITTER');
    this.spawnBurst(this.player.x + this.player.w * 0.5, this.player.y + this.player.h * 0.5, '#ef4444', 14);
    this.spawnFloatingText(
      this.player.x + this.player.w * 0.5,
      this.player.y - 12,
      `-${cgpaLoss.toFixed(2)} CGPA`,
      '#f43f5e'
    );

    if (this.player.hp <= 0 || this.player.cgpa <= 0.0) {
      this.player.cgpa = 0.0;
      this.player.hp = 0;
      soundEngine.setBossSilence(false);
      this.emitHud();
      this.startPlayerShatter(reason);
    }
  }

  private startPlayerShatter(reason: string): void {
    if (this.playerShattering) return;
    this.recordGhostSample('FATAL', true);
    // Freeze the last 5.0 seconds of movement with relative timeOffsets (-5.0s to 0.0s)
    const deathTime = this.elapsedSeconds;
    this.deathGhostPath = this.ghostHistory.map((entry, idx, arr) => ({
      ...entry.sample,
      timeOffset: +(entry.timestamp - deathTime).toFixed(2),
      event: idx === arr.length - 1 ? 'FATAL' : entry.sample.event,
    }));

    this.playerShattering = true;
    this.playerShatterTimer = 0;
    this.playerShatterBurstSpawned = false;
    this.pendingGameOverReason = reason;
    this.player.vx = 0;
    this.player.vy = 0;
    soundEngine.playPlayerShatter();
    hapticService.playerShatter();
    this.triggerScreenShake(9, 'HIGH_FREQ_JITTER');
    this.notify('CGPA 0.00 — VESSEL FRACTURING INTO THE VOID...');
  }

  private triggerWallDashSparks(wallX: number, hitY: number, normalDir: 1 | -1): void {
    if (this.wallSparkCooldown > 0) return;
    this.wallSparkCooldown = 0.12;
    soundEngine.playWallSpark();
    hapticService.wallSpark();
    this.triggerScreenShake(4.5, 'HIGH_FREQ_JITTER');

    const sparkColors = ['#fbbf24', '#fde047', '#38bdf8', '#f8fafc', '#fb923c'];
    for (let i = 0; i < 18; i++) {
      // Fan sparks outward along wall normal + upward/downward spray
      const spreadAngle = (Math.random() - 0.55) * 1.65;
      const baseAngle = normalDir > 0 ? spreadAngle : Math.PI - spreadAngle;
      const speed = 190 + Math.random() * 340;
      this.particles.push({
        x: wallX + normalDir * 3,
        y: hitY + (Math.random() - 0.5) * 26,
        vx: Math.cos(baseAngle) * speed,
        vy: Math.sin(baseAngle) * speed - 60,
        size: 2.2 + Math.random() * 2.4,
        color: sparkColors[i % sparkColors.length],
        alpha: 1,
        life: 0.24 + Math.random() * 0.26,
        maxLife: 0.5,
        shape: 'SPARK',
        gravity: 980,
        drag: 2.2,
      });
    }
  }

  private spawnBloodPaperConfetti(x: number, y: number, count: number): void {
    // Blood-red & crimson F-graded paper slips that burst and flutter when enemies take damage
    const bloodPaperPalette = ['#dc2626', '#b91c1c', '#ef4444', '#991b1b', '#f43f5e', '#fecdd3'];
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 95 + Math.random() * 260;
      this.particles.push({
        x: x + (Math.random() - 0.5) * 12,
        y: y + (Math.random() - 0.5) * 12,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 110,
        size: 5.5 + Math.random() * 4.5,
        color: bloodPaperPalette[i % bloodPaperPalette.length],
        strokeColor: '#450a0a',
        alpha: 1,
        life: 0.55 + Math.random() * 0.5,
        maxLife: 1.05,
        shape: 'PAPER',
        rotation: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 16,
        gravity: 420,
        drag: 2.8,
      });
    }
  }

  private spawnPlayerVoidShards(x: number, y: number, count: number): void {
    const shardStrokes = ['#38bdf8', '#e0f2fe', '#c084fc', '#f43f5e'];
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.25;
      const spd = 75 + Math.random() * 310;
      const radius = 5 + Math.random() * 8;
      // Generate a 4-vertex jagged polygon shard
      const vertices = [
        { x: 0, y: -radius * (0.9 + Math.random() * 0.4) },
        { x: radius * (0.6 + Math.random() * 0.5), y: radius * (0.1 + Math.random() * 0.3) },
        { x: radius * (0.1 - Math.random() * 0.4), y: radius * (0.8 + Math.random() * 0.4) },
        { x: -radius * (0.6 + Math.random() * 0.5), y: -radius * (0.1 + Math.random() * 0.3) },
      ];

      this.particles.push({
        x: x + (Math.random() - 0.5) * 18,
        y: y + (Math.random() - 0.5) * 28,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 90,
        size: radius,
        color: i % 5 === 0 ? '#09080c' : '#f8fafc',
        strokeColor: shardStrokes[i % shardStrokes.length],
        alpha: 1,
        life: 1.05 + Math.random() * 0.35,
        maxLife: 1.4,
        shape: 'VOID_SHARD',
        rotation: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 14,
        gravity: 340,
        drag: 1.4,
        vertices,
      });
    }
  }

  private spawnBurst(x: number, y: number, color: string, count: number): void {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 60 + Math.random() * 210;
      this.particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 40,
        size: 3 + Math.random() * 4,
        color,
        alpha: 1,
        life: 0.35 + Math.random() * 0.3,
        maxLife: 0.65,
        shape: 'SQUARE',
      });
    }
  }

  private spawnPaperConfetti(x: number, y: number, count: number): void {
    const colors = ['#fef08a', '#f8fafc', '#fde047', '#fca5a5'];
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 80 + Math.random() * 240;
      this.particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 80,
        size: 6 + Math.random() * 5,
        color: colors[i % colors.length],
        alpha: 1,
        life: 0.55 + Math.random() * 0.45,
        maxLife: 1.0,
        shape: 'PAPER',
        rotation: Math.random() * Math.PI,
        vRot: (Math.random() - 0.5) * 12,
        gravity: 380,
        drag: 2.4,
      });
    }
  }

  private spawnFloatingText(x: number, y: number, text: string, color: string): void {
    this.particles.push({
      x,
      y,
      vx: 0,
      vy: -48,
      size: 13,
      color,
      alpha: 1,
      life: 0.85,
      maxLife: 0.85,
      shape: 'TEXT',
      text,
    });
  }

  public emitHud(): void {
    const boss = this.level.boss;
    this.onHudUpdate({
      hp: Math.round(this.player.hp),
      maxHp: this.player.maxHp,
      stamina: Math.round(this.player.stamina),
      maxStamina: this.player.maxStamina,
      cgpa: this.player.cgpa,
      researchMomentum: Math.round(this.player.researchMomentum),
      comboCount: this.player.comboCount,
      level: this.level.id,
      levelName: this.level.name,
      hasAssignmentKey: this.player.hasAssignmentKey,
      hasBonusMarkShield: this.player.hasBonusMarkShield,
      abilitiesSilenced: this.buffs.has('BLANK_SILENCE'),
      inventory: [...this.player.inventory],
      activeBuffs: Array.from(this.buffs.values()),
      boss: boss.active
        ? {
            active: true,
            name: boss.name,
            subtitle: boss.subtitle,
            hp: Math.round(boss.hp),
            maxHp: boss.maxHp,
            phase: boss.phase,
            silenceWarning: boss.silenceActive,
          }
        : null,
      bossIntro: this.bossIntro ? { ...this.bossIntro } : null,
      cgpaDifficulty: this.getCgpaDifficultyModifiers(),
      elapsedSeconds: this.elapsedSeconds,
      notification: this.notification,
    });
  }
}

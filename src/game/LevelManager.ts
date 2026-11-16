import {
  BellCurveWave,
  BossState,
  CollectibleItem,
  Enemy,
  LevelId,
  Platform,
  RetakeTrap,
} from '../types/game';

export interface LevelData {
  id: LevelId;
  name: string;
  subtitle: string;
  worldWidth: number;
  floorY: number;
  bossArenaTriggerX: number;
  bossArenaLeftX: number;
  bossArenaRightX: number;
  platforms: Platform[];
  enemies: Enemy[];
  retakeTraps: RetakeTrap[];
  collectibles: CollectibleItem[];
  bellCurve: BellCurveWave;
  boss: BossState;
}

export function buildLevel(levelId: LevelId): LevelData {
  const floorY = 640;

  if (levelId === 1) {
    // LEVEL 1: The Ruined Cafeteria & Lower Floors
    const worldWidth = 4400;
    const bossArenaLeftX = 3350;
    const bossArenaRightX = 4320;

    const platforms: Platform[] = [
      // Main ground slabs
      { id: 'f1-ground-1', x: 0, y: floorY, w: 1200, h: 120, kind: 'SOLID' },
      { id: 'f1-ground-2', x: 1320, y: floorY, w: 980, h: 120, kind: 'SOLID' },
      { id: 'f1-ground-3', x: 2420, y: floorY, w: 1980, h: 120, kind: 'SOLID' },

      // Overturned cafeteria tables & spiral ramp ledges
      { id: 'f1-p1', x: 260, y: 530, w: 160, h: 18, kind: 'ONE_WAY' },
      { id: 'f1-p2', x: 480, y: 440, w: 170, h: 18, kind: 'GRADE_DROP', collapseState: 'IDLE', collapseTimer: 0, respawnTimer: 0 },
      { id: 'f1-p3', x: 710, y: 360, w: 180, h: 18, kind: 'ONE_WAY' },
      { id: 'f1-p4', x: 960, y: 470, w: 160, h: 18, kind: 'ONE_WAY' },

      // Gap bridge of Grade Drop cracked platforms
      { id: 'f1-gd-bridge', x: 1210, y: 590, w: 100, h: 18, kind: 'GRADE_DROP', collapseState: 'IDLE', collapseTimer: 0, respawnTimer: 0 },

      // Mid-level spiral ramp up to Assignment Key
      { id: 'f1-p5', x: 1460, y: 510, w: 180, h: 18, kind: 'ONE_WAY' },
      { id: 'f1-p6', x: 1690, y: 410, w: 150, h: 18, kind: 'GRADE_DROP', collapseState: 'IDLE', collapseTimer: 0, respawnTimer: 0 },
      { id: 'f1-p7', x: 1890, y: 310, w: 210, h: 18, kind: 'SOLID' }, // Assignment Key perch

      // Prerequisite Gate Door blocking passage at x=2180
      { id: 'f1-gate', x: 2180, y: floorY - 220, w: 34, h: 220, kind: 'GATE_DOOR', lockedById: 'f1-prereq' },

      // Second gap Grade Drop
      { id: 'f1-gd-bridge2', x: 2310, y: 580, w: 100, h: 18, kind: 'GRADE_DROP', collapseState: 'IDLE', collapseTimer: 0, respawnTimer: 0 },

      // Bell Curve sprint section ledges
      { id: 'f1-p8', x: 2560, y: 515, w: 170, h: 18, kind: 'ONE_WAY' },
      { id: 'f1-p9', x: 2810, y: 430, w: 160, h: 18, kind: 'GRADE_DROP', collapseState: 'IDLE', collapseTimer: 0, respawnTimer: 0 },
      { id: 'f1-p10', x: 3050, y: 510, w: 190, h: 18, kind: 'ONE_WAY' },

      // Boss Arena aerial platforms (vital when Syllabus unrolls spiked parchment carpet in Phase 2!)
      { id: 'f1-boss-p1', x: 3470, y: 500, w: 165, h: 18, kind: 'ONE_WAY' },
      { id: 'f1-boss-p2', x: 3740, y: 395, w: 180, h: 18, kind: 'ONE_WAY' },
      { id: 'f1-boss-p3', x: 4020, y: 500, w: 165, h: 18, kind: 'ONE_WAY' },
    ];

    const enemies: Enemy[] = [
      {
        id: 'f1-e1',
        kind: 'ALL_NIGHTER',
        x: 560,
        y: floorY - 56,
        w: 40,
        h: 56,
        vx: 110,
        vy: 0,
        hp: 45,
        maxHp: 45,
        facing: 1,
        patrolMinX: 380,
        patrolMaxX: 880,
        stateTimer: 0,
        attackCooldown: 0,
        hitFlash: 0,
      },
      {
        id: 'f1-e2',
        kind: 'BLANK_SHEET',
        x: 1040,
        y: floorY - 60,
        w: 42,
        h: 60,
        vx: 85,
        vy: 0,
        hp: 55,
        maxHp: 55,
        facing: -1,
        patrolMinX: 890,
        patrolMaxX: 1170,
        stateTimer: 0,
        attackCooldown: 0,
        hitFlash: 0,
      },
      {
        id: 'f1-e3',
        kind: 'ALL_NIGHTER',
        x: 1620,
        y: floorY - 56,
        w: 40,
        h: 56,
        vx: 120,
        vy: 0,
        hp: 50,
        maxHp: 50,
        facing: 1,
        patrolMinX: 1380,
        patrolMaxX: 1920,
        stateTimer: 0,
        attackCooldown: 0,
        hitFlash: 0,
      },
      // The Prerequisite Miniboss Gatekeeper
      {
        id: 'f1-prereq',
        kind: 'PREREQUISITE',
        x: 2105,
        y: floorY - 96,
        w: 64,
        h: 96,
        vx: 0,
        vy: 0,
        hp: 180,
        maxHp: 180,
        facing: -1,
        patrolMinX: 2050,
        patrolMaxX: 2150,
        stateTimer: 0,
        attackCooldown: 0,
        hitFlash: 0,
      },
      {
        id: 'f1-e4',
        kind: 'BLANK_SHEET',
        x: 2880,
        y: floorY - 60,
        w: 42,
        h: 60,
        vx: 95,
        vy: 0,
        hp: 60,
        maxHp: 60,
        facing: -1,
        patrolMinX: 2620,
        patrolMaxX: 3180,
        stateTimer: 0,
        attackCooldown: 0,
        hitFlash: 0,
      },
    ];

    const retakeTraps: RetakeTrap[] = [
      {
        id: 'f1-trap-1',
        x: 910,
        y: floorY - 10,
        w: 68,
        h: 10,
        rewindX: 140,
        rewindY: floorY - 80,
        triggeredCooldown: 0,
        pulsePhase: 0,
      },
      {
        id: 'f1-trap-2',
        x: 2740,
        y: floorY - 10,
        w: 68,
        h: 10,
        rewindX: 2450,
        rewindY: floorY - 80,
        triggeredCooldown: 0,
        pulsePhase: 1.5,
      },
    ];

    const collectibles: CollectibleItem[] = [
      { id: 'f1-c1', x: 320, y: 490, kind: 'POWER_UP', powerUpType: 'CHA_ESPRESSO', collected: false, bobPhase: 0 },
      { id: 'f1-c2', x: 780, y: 320, kind: 'POWER_UP', powerUpType: 'EXTRA_SHEET', collected: false, bobPhase: 1.1 },
      { id: 'f1-c3', x: 1120, y: 590, kind: 'POWER_UP', powerUpType: 'FRIENDS_NOTES', collected: false, bobPhase: 2.0 },
      { id: 'f1-key', x: 1990, y: 265, kind: 'ASSIGNMENT_KEY', collected: false, bobPhase: 0.4 },
      { id: 'f1-c4', x: 1540, y: 470, kind: 'POWER_UP', powerUpType: 'CHIT', collected: false, bobPhase: 2.8 },
      { id: 'f1-c5', x: 2630, y: 475, kind: 'POWER_UP', powerUpType: 'GROUP_STUDY', collected: false, bobPhase: 0.9 },
      { id: 'f1-c6', x: 3130, y: 470, kind: 'POWER_UP', powerUpType: 'ONE_NIGHT_REVISION', collected: false, bobPhase: 1.7 },
      { id: 'f1-c7', x: 3530, y: 460, kind: 'POWER_UP', powerUpType: 'PAST_QUESTION_BANK', collected: false, bobPhase: 2.3 },
    ];

    const bellCurve: BellCurveWave = {
      active: false,
      x: 2360,
      startX: 2380,
      endX: 3320,
      speed: 102,
      height: 460,
    };

    const boss: BossState = {
      level: 1,
      name: 'THE SYLLABUS',
      subtitle: 'The Unending Scroll · Ch. 1–99',
      x: 4080,
      y: floorY - 150,
      w: 104,
      h: 150,
      vx: 0,
      vy: 0,
      hp: 520,
      maxHp: 520,
      phase: 1,
      active: false,
      defeated: false,
      state: 'IDLE',
      stateTimer: 1.2,
      attackIndex: 0,
      hitFlash: 0,
      facing: -1,
      chapterNumber: 1,
      parchmentSpikesActive: false,
      arenaLeftOffset: 0,
      arenaRightOffset: 0,
      weakSpotOffset: { x: 22, y: 28, w: 60, h: 48 },
      wingsActive: false,
      silenceActive: false,
    };

    return {
      id: 1,
      name: 'Floor 1 · The Ruined Cafeteria',
      subtitle: 'Ground & Lower Plaza · Overturned Tables & Broken Spiral Ramps',
      worldWidth,
      floorY,
      bossArenaTriggerX: 3420,
      bossArenaLeftX,
      bossArenaRightX,
      platforms,
      enemies,
      retakeTraps,
      collectibles,
      bellCurve,
      boss,
    };
  }

  if (levelId === 2) {
    // LEVEL 2: The Admin Corridor & Probation Zone
    const worldWidth = 4500;
    const bossArenaLeftX = 3400;
    const bossArenaRightX = 4420;

    const platforms: Platform[] = [
      { id: 'f2-ground-1', x: 0, y: floorY, w: 1120, h: 120, kind: 'SOLID' },
      { id: 'f2-ground-2', x: 1260, y: floorY, w: 1020, h: 120, kind: 'SOLID' },
      { id: 'f2-ground-3', x: 2420, y: floorY, w: 2080, h: 120, kind: 'SOLID' },

      // Admin corridor upper walkways & Grade Drop traps
      { id: 'f2-p1', x: 240, y: 520, w: 150, h: 18, kind: 'GRADE_DROP', collapseState: 'IDLE', collapseTimer: 0, respawnTimer: 0 },
      { id: 'f2-p2', x: 450, y: 420, w: 175, h: 18, kind: 'ONE_WAY' },
      { id: 'f2-p3', x: 700, y: 340, w: 165, h: 18, kind: 'GRADE_DROP', collapseState: 'IDLE', collapseTimer: 0, respawnTimer: 0 },
      { id: 'f2-p4', x: 930, y: 450, w: 160, h: 18, kind: 'ONE_WAY' },

      { id: 'f2-gd-gap1', x: 1140, y: 575, w: 105, h: 18, kind: 'GRADE_DROP', collapseState: 'IDLE', collapseTimer: 0, respawnTimer: 0 },

      // Registrar vault climb for Assignment Key
      { id: 'f2-p5', x: 1420, y: 500, w: 165, h: 18, kind: 'ONE_WAY' },
      { id: 'f2-p6', x: 1640, y: 395, w: 155, h: 18, kind: 'GRADE_DROP', collapseState: 'IDLE', collapseTimer: 0, respawnTimer: 0 },
      { id: 'f2-p7', x: 1860, y: 295, w: 200, h: 18, kind: 'SOLID' },

      // Prerequisite Gate Door at x=2210
      { id: 'f2-gate', x: 2210, y: floorY - 220, w: 34, h: 220, kind: 'GATE_DOOR', lockedById: 'f2-prereq' },

      { id: 'f2-gd-gap2', x: 2300, y: 575, w: 105, h: 18, kind: 'GRADE_DROP', collapseState: 'IDLE', collapseTimer: 0, respawnTimer: 0 },

      // Bell Curve & Probation gauntlet platforms
      { id: 'f2-p8', x: 2560, y: 500, w: 165, h: 18, kind: 'GRADE_DROP', collapseState: 'IDLE', collapseTimer: 0, respawnTimer: 0 },
      { id: 'f2-p9', x: 2810, y: 410, w: 180, h: 18, kind: 'ONE_WAY' },
      { id: 'f2-p10', x: 3080, y: 500, w: 170, h: 18, kind: 'ONE_WAY' },

      // Probation Boss Arena platforms (centered so they remain accessible as arena walls shrink inward!)
      { id: 'f2-boss-p1', x: 3680, y: 500, w: 150, h: 18, kind: 'ONE_WAY' },
      { id: 'f2-boss-p2', x: 3840, y: 390, w: 140, h: 18, kind: 'ONE_WAY' },
      { id: 'f2-boss-p3', x: 3980, y: 500, w: 150, h: 18, kind: 'ONE_WAY' },
    ];

    const enemies: Enemy[] = [
      {
        id: 'f2-e1',
        kind: 'ALL_NIGHTER',
        x: 520,
        y: floorY - 56,
        w: 40,
        h: 56,
        vx: 130,
        vy: 0,
        hp: 55,
        maxHp: 55,
        facing: 1,
        patrolMinX: 300,
        patrolMaxX: 820,
        stateTimer: 0,
        attackCooldown: 0,
        hitFlash: 0,
      },
      {
        id: 'f2-e2',
        kind: 'BLANK_SHEET',
        x: 960,
        y: floorY - 60,
        w: 42,
        h: 60,
        vx: 105,
        vy: 0,
        hp: 65,
        maxHp: 65,
        facing: -1,
        patrolMinX: 780,
        patrolMaxX: 1090,
        stateTimer: 0,
        attackCooldown: 0,
        hitFlash: 0,
      },
      {
        id: 'f2-e3',
        kind: 'BLANK_SHEET',
        x: 1680,
        y: floorY - 60,
        w: 42,
        h: 60,
        vx: 105,
        vy: 0,
        hp: 65,
        maxHp: 65,
        facing: 1,
        patrolMinX: 1350,
        patrolMaxX: 1960,
        stateTimer: 0,
        attackCooldown: 0,
        hitFlash: 0,
      },
      {
        id: 'f2-prereq',
        kind: 'PREREQUISITE',
        x: 2130,
        y: floorY - 96,
        w: 64,
        h: 96,
        vx: 0,
        vy: 0,
        hp: 210,
        maxHp: 210,
        facing: -1,
        patrolMinX: 2070,
        patrolMaxX: 2180,
        stateTimer: 0,
        attackCooldown: 0,
        hitFlash: 0,
      },
      {
        id: 'f2-e4',
        kind: 'ALL_NIGHTER',
        x: 2820,
        y: floorY - 56,
        w: 40,
        h: 56,
        vx: 140,
        vy: 0,
        hp: 60,
        maxHp: 60,
        facing: -1,
        patrolMinX: 2520,
        patrolMaxX: 3120,
        stateTimer: 0,
        attackCooldown: 0,
        hitFlash: 0,
      },
      {
        id: 'f2-e5',
        kind: 'DEANS_LIST',
        x: 3220,
        y: floorY - 76,
        w: 50,
        h: 76,
        vx: 75,
        vy: 0,
        hp: 130,
        maxHp: 130,
        facing: -1,
        patrolMinX: 3020,
        patrolMaxX: 3340,
        stateTimer: 0,
        attackCooldown: 0,
        hitFlash: 0,
      },
    ];

    const retakeTraps: RetakeTrap[] = [
      {
        id: 'f2-trap-1',
        x: 780,
        y: floorY - 10,
        w: 70,
        h: 10,
        rewindX: 140,
        rewindY: floorY - 80,
        triggeredCooldown: 0,
        pulsePhase: 0,
      },
      {
        id: 'f2-trap-2',
        x: 1750,
        y: floorY - 10,
        w: 70,
        h: 10,
        rewindX: 1310,
        rewindY: floorY - 80,
        triggeredCooldown: 0,
        pulsePhase: 1.2,
      },
      {
        id: 'f2-trap-3',
        x: 2940,
        y: floorY - 10,
        w: 70,
        h: 10,
        rewindX: 2460,
        rewindY: floorY - 80,
        triggeredCooldown: 0,
        pulsePhase: 2.4,
      },
    ];

    const collectibles: CollectibleItem[] = [
      { id: 'f2-c1', x: 510, y: 380, kind: 'POWER_UP', powerUpType: 'GRACE_PERIOD', collected: false, bobPhase: 0.2 },
      { id: 'f2-c2', x: 990, y: 410, kind: 'POWER_UP', powerUpType: 'MEDICAL_CERT', collected: false, bobPhase: 1.0 },
      { id: 'f2-key', x: 1950, y: 250, kind: 'ASSIGNMENT_KEY', collected: false, bobPhase: 0.7 },
      { id: 'f2-c3', x: 1490, y: 460, kind: 'POWER_UP', powerUpType: 'CHIT', collected: false, bobPhase: 1.8 },
      { id: 'f2-c4', x: 2630, y: 460, kind: 'POWER_UP', powerUpType: 'GROUP_STUDY', collected: false, bobPhase: 2.5 },
      { id: 'f2-c5', x: 2890, y: 370, kind: 'POWER_UP', powerUpType: 'FRIENDS_NOTES', collected: false, bobPhase: 0.4 },
      { id: 'f2-c6', x: 3150, y: 460, kind: 'POWER_UP', powerUpType: 'PAST_QUESTION_BANK', collected: false, bobPhase: 1.5 },
      { id: 'f2-c7', x: 3910, y: 350, kind: 'POWER_UP', powerUpType: 'BONUS_MARK', collected: false, bobPhase: 2.1 },
    ];

    const bellCurve: BellCurveWave = {
      active: false,
      x: 2380,
      startX: 2400,
      endX: 3350,
      speed: 118,
      height: 460,
    };

    const boss: BossState = {
      level: 2,
      name: 'PROBATION',
      subtitle: 'The Shrinking Void · CGPA < 2.00',
      x: 3910,
      y: floorY - 210,
      w: 96,
      h: 136,
      vx: 95,
      vy: 0,
      hp: 640,
      maxHp: 640,
      phase: 1,
      active: false,
      defeated: false,
      state: 'MOVE',
      stateTimer: 1.5,
      attackIndex: 0,
      hitFlash: 0,
      facing: -1,
      chapterNumber: 1,
      parchmentSpikesActive: false,
      arenaLeftOffset: 0,
      arenaRightOffset: 0,
      // Cracked 1.99 digital CGPA chest meter weak spot
      weakSpotOffset: { x: 20, y: 44, w: 56, h: 42 },
      wingsActive: false,
      silenceActive: false,
    };

    return {
      id: 2,
      name: 'Floor 2 · The Admin Corridor & Probation Zone',
      subtitle: 'Registrar Vaults · Cracked Spiral Ramps & Corrosive Sand',
      worldWidth,
      floorY,
      bossArenaTriggerX: 3470,
      bossArenaLeftX,
      bossArenaRightX,
      platforms,
      enemies,
      retakeTraps,
      collectibles,
      bellCurve,
      boss,
    };
  }

  // LEVEL 3: The 10th Floor Roof (Final Boss)
  const worldWidth = 4600;
  const bossArenaLeftX = 3420;
  const bossArenaRightX = 4520;

  const platforms: Platform[] = [
    { id: 'f3-ground-1', x: 0, y: floorY, w: 1150, h: 120, kind: 'SOLID' },
    { id: 'f3-ground-2', x: 1290, y: floorY, w: 1050, h: 120, kind: 'SOLID' },
    { id: 'f3-ground-3', x: 2470, y: floorY, w: 2130, h: 120, kind: 'SOLID' },

    // Rooftop skylight frames & Grade Drop ledges
    { id: 'f3-p1', x: 280, y: 515, w: 165, h: 18, kind: 'ONE_WAY' },
    { id: 'f3-p2', x: 510, y: 410, w: 160, h: 18, kind: 'GRADE_DROP', collapseState: 'IDLE', collapseTimer: 0, respawnTimer: 0 },
    { id: 'f3-p3', x: 750, y: 325, w: 180, h: 18, kind: 'ONE_WAY' },
    { id: 'f3-p4', x: 970, y: 455, w: 150, h: 18, kind: 'GRADE_DROP', collapseState: 'IDLE', collapseTimer: 0, respawnTimer: 0 },

    { id: 'f3-gd-gap1', x: 1170, y: 575, w: 100, h: 18, kind: 'GRADE_DROP', collapseState: 'IDLE', collapseTimer: 0, respawnTimer: 0 },

    // Upper clocktower parapet for Assignment Key
    { id: 'f3-p5', x: 1440, y: 500, w: 170, h: 18, kind: 'ONE_WAY' },
    { id: 'f3-p6', x: 1670, y: 390, w: 160, h: 18, kind: 'GRADE_DROP', collapseState: 'IDLE', collapseTimer: 0, respawnTimer: 0 },
    { id: 'f3-p7', x: 1890, y: 285, w: 210, h: 18, kind: 'SOLID' },

    // Prerequisite Gate Door at x=2240
    { id: 'f3-gate', x: 2240, y: floorY - 220, w: 34, h: 220, kind: 'GATE_DOOR', lockedById: 'f3-prereq' },

    { id: 'f3-gd-gap2', x: 2355, y: 575, w: 95, h: 18, kind: 'GRADE_DROP', collapseState: 'IDLE', collapseTimer: 0, respawnTimer: 0 },

    // Dean's List Honor Guard Courtyard before Final Boss
    { id: 'f3-p8', x: 2630, y: 490, w: 180, h: 18, kind: 'ONE_WAY' },
    { id: 'f3-p9', x: 2920, y: 395, w: 190, h: 18, kind: 'ONE_WAY' },
    { id: 'f3-p10', x: 3180, y: 490, w: 170, h: 18, kind: 'ONE_WAY' },

    // Final Boss Arena Lower & High Floating Platforms
    // Lower platforms can be temporarily erased by Academic Dismissal's Eraser Blade sweep!
    // High BOSS_HIGH platforms allow surviving the Phase 2 screen-wide "DISMISSED" one-hit-kill slam!
    { id: 'f3-boss-low1', x: 3540, y: 515, w: 170, h: 18, kind: 'ONE_WAY', erasedTimer: 0 },
    { id: 'f3-boss-low2', x: 3880, y: 515, w: 170, h: 18, kind: 'ONE_WAY', erasedTimer: 0 },
    { id: 'f3-boss-low3', x: 4210, y: 515, w: 170, h: 18, kind: 'ONE_WAY', erasedTimer: 0 },

    { id: 'f3-boss-high1', x: 3670, y: 370, w: 165, h: 18, kind: 'BOSS_HIGH' },
    { id: 'f3-boss-high2', x: 4060, y: 370, w: 165, h: 18, kind: 'BOSS_HIGH' },
  ];

  const enemies: Enemy[] = [
    {
      id: 'f3-e1',
      kind: 'ALL_NIGHTER',
      x: 560,
      y: floorY - 56,
      w: 40,
      h: 56,
      vx: 145,
      vy: 0,
      hp: 65,
      maxHp: 65,
      facing: 1,
      patrolMinX: 320,
      patrolMaxX: 900,
      stateTimer: 0,
      attackCooldown: 0,
      hitFlash: 0,
    },
    {
      id: 'f3-e2',
      kind: 'BLANK_SHEET',
      x: 1580,
      y: floorY - 60,
      w: 42,
      h: 60,
      vx: 115,
      vy: 0,
      hp: 70,
      maxHp: 70,
      facing: -1,
      patrolMinX: 1350,
      patrolMaxX: 1920,
      stateTimer: 0,
      attackCooldown: 0,
      hitFlash: 0,
    },
    {
      id: 'f3-prereq',
      kind: 'PREREQUISITE',
      x: 2155,
      y: floorY - 96,
      w: 64,
      h: 96,
      vx: 0,
      vy: 0,
      hp: 230,
      maxHp: 230,
      facing: -1,
      patrolMinX: 2100,
      patrolMaxX: 2210,
      stateTimer: 0,
      attackCooldown: 0,
      hitFlash: 0,
    },
    // Two Dean's List Elite Knights guarding the Final Boss Room!
    {
      id: 'f3-deans-1',
      kind: 'DEANS_LIST',
      x: 2820,
      y: floorY - 78,
      w: 52,
      h: 78,
      vx: 85,
      vy: 0,
      hp: 150,
      maxHp: 150,
      facing: -1,
      patrolMinX: 2560,
      patrolMaxX: 3020,
      stateTimer: 0,
      attackCooldown: 0,
      hitFlash: 0,
    },
    {
      id: 'f3-deans-2',
      kind: 'DEANS_LIST',
      x: 3240,
      y: floorY - 78,
      w: 52,
      h: 78,
      vx: 90,
      vy: 0,
      hp: 165,
      maxHp: 165,
      facing: -1,
      patrolMinX: 3040,
      patrolMaxX: 3370,
      stateTimer: 0,
      attackCooldown: 0,
      hitFlash: 0,
    },
  ];

  const retakeTraps: RetakeTrap[] = [
    {
      id: 'f3-trap-1',
      x: 840,
      y: floorY - 10,
      w: 72,
      h: 10,
      rewindX: 140,
      rewindY: floorY - 80,
      triggeredCooldown: 0,
      pulsePhase: 0.5,
    },
    {
      id: 'f3-trap-2',
      x: 2740,
      y: floorY - 10,
      w: 72,
      h: 10,
      rewindX: 2500,
      rewindY: floorY - 80,
      triggeredCooldown: 0,
      pulsePhase: 1.9,
    },
  ];

  const collectibles: CollectibleItem[] = [
    { id: 'f3-c1', x: 350, y: 475, kind: 'POWER_UP', powerUpType: 'CHA_ESPRESSO', collected: false, bobPhase: 0.1 },
    { id: 'f3-c2', x: 820, y: 285, kind: 'POWER_UP', powerUpType: 'EXTRA_SHEET', collected: false, bobPhase: 0.9 },
    { id: 'f3-key', x: 1990, y: 240, kind: 'ASSIGNMENT_KEY', collected: false, bobPhase: 1.5 },
    { id: 'f3-c3', x: 1520, y: 460, kind: 'POWER_UP', powerUpType: 'MEDICAL_CERT', collected: false, bobPhase: 2.2 },
    { id: 'f3-c4', x: 2690, y: 450, kind: 'POWER_UP', powerUpType: 'ONE_NIGHT_REVISION', collected: false, bobPhase: 0.6 },
    { id: 'f3-c5', x: 2990, y: 355, kind: 'POWER_UP', powerUpType: 'PAST_QUESTION_BANK', collected: false, bobPhase: 1.3 },
    { id: 'f3-c6', x: 3250, y: 450, kind: 'POWER_UP', powerUpType: 'BONUS_MARK', collected: false, bobPhase: 2.0 },
    { id: 'f3-c7', x: 3740, y: 330, kind: 'POWER_UP', powerUpType: 'BONUS_MARK', collected: false, bobPhase: 2.7 },
  ];

  const bellCurve: BellCurveWave = {
    active: false,
    x: 1260,
    startX: 1290,
    endX: 2200,
    speed: 122,
    height: 460,
  };

  const boss: BossState = {
    level: 3,
    name: 'ACADEMIC DISMISSAL',
    subtitle: 'The Red Stamp · Permanent Expulsion',
    x: 4220,
    y: floorY - 176,
    w: 116,
    h: 176,
    vx: 0,
    vy: 0,
    hp: 820,
    maxHp: 820,
    phase: 1,
    active: false,
    defeated: false,
    state: 'IDLE',
    stateTimer: 1.2,
    attackIndex: 0,
    hitFlash: 0,
    facing: -1,
    chapterNumber: 99,
    parchmentSpikesActive: false,
    arenaLeftOffset: 0,
    arenaRightOffset: 0,
    weakSpotOffset: { x: 28, y: 34, w: 60, h: 48 },
    wingsActive: false,
    silenceActive: false,
  };

  return {
    id: 3,
    name: 'Floor 3 · The 10th Floor Roof',
    subtitle: 'Shattered Skylights · Dean’s List Guard & The Final Stamp',
    worldWidth,
    floorY,
    bossArenaTriggerX: 3480,
    bossArenaLeftX,
    bossArenaRightX,
    platforms,
    enemies,
    retakeTraps,
    collectibles,
    bellCurve,
    boss,
  };
}

export type GameScreenState = 'TITLE' | 'PLAYING' | 'PAUSED' | 'VICTORY' | 'GAME_OVER';
export type LevelId = 1 | 2 | 3;

export type PowerUpType =
  | 'CHA_ESPRESSO'       // 3 AM Cha / Double Espresso: Freezes stamina drain + 2x speed for 6s, then 2s slowdown
  | 'EXTRA_SHEET'        // Doubles melee attack range and refills stamina instantly
  | 'ONE_NIGHT_REVISION' // 2.5x damage boost for 8s (extra effective vs Syllabus)
  | 'BONUS_MARK'         // Glowing shield that absorbs one lethal hit (saves from Academic Dismissal / 0.00 CGPA)
  | 'GROUP_STUDY'        // Spawns 2 AI classmate clones for 10s that shoot projectiles and push back The Bell Curve
  | 'CHIT'               // Instant-kills a Prerequisite gatekeeper, but spawns fast patrol guards for 10s
  | 'GRACE_PERIOD'       // Slows down time (50% speed) for enemies and collapsing Grade Drop platforms for 7s
  | 'MEDICAL_CERT'       // Grants 5s invulnerability and immunity to Retake traps
  | 'FRIENDS_NOTES'      // Instantly restores abilities erased by Blank Sheet enemy and heals 20 HP
  | 'PAST_QUESTION_BANK';// Highlights boss weak spots for 2x critical damage and displays telegraph lines

export interface PowerUpMeta {
  type: PowerUpType;
  name: string;
  shortName: string;
  description: string;
  color: string;
  instantOrStored: 'STORED' | 'EITHER';
}

export const POWER_UP_CATALOG: Record<PowerUpType, PowerUpMeta> = {
  CHA_ESPRESSO: {
    type: 'CHA_ESPRESSO',
    name: '3 AM Cha / Double Espresso',
    shortName: '3 AM Cha',
    description: 'Freezes stamina drain & doubles speed for 6s (followed by 2s crash).',
    color: '#f59e0b',
    instantOrStored: 'STORED',
  },
  EXTRA_SHEET: {
    type: 'EXTRA_SHEET',
    name: 'Extra Exam Sheet',
    shortName: 'Extra Sheet',
    description: 'Doubles lab-report melee range for 10s & refills stamina immediately.',
    color: '#38bdf8',
    instantOrStored: 'STORED',
  },
  ONE_NIGHT_REVISION: {
    type: 'ONE_NIGHT_REVISION',
    name: 'One-Night Revision',
    shortName: '1-Night Rev',
    description: 'Grants 2.5x damage boost for 8s (shreds The Syllabus).',
    color: '#f43f5e',
    instantOrStored: 'STORED',
  },
  BONUS_MARK: {
    type: 'BONUS_MARK',
    name: 'Faculty Bonus Mark',
    shortName: 'Bonus Mark',
    description: 'Glowing ward that absorbs one lethal hit or 0.00 CGPA dismissal.',
    color: '#fbbf24',
    instantOrStored: 'STORED',
  },
  GROUP_STUDY: {
    type: 'GROUP_STUDY',
    name: 'Group Study Clones',
    shortName: 'Group Study',
    description: 'Spawns 2 AI classmate clones for 10s that fire notes & push back Bell Curve.',
    color: '#a855f7',
    instantOrStored: 'STORED',
  },
  CHIT: {
    type: 'CHIT',
    name: 'Micro-Photocopy Chit',
    shortName: 'Chit',
    description: 'Instant-breaks Prerequisite padlock golem, but alerts patrol guards for 10s.',
    color: '#10b981',
    instantOrStored: 'STORED',
  },
  GRACE_PERIOD: {
    type: 'GRACE_PERIOD',
    name: 'Academic Grace Period',
    shortName: 'Grace Period',
    description: 'Slows enemies & collapsing Grade Drop platforms by 50% for 7s.',
    color: '#2dd4bf',
    instantOrStored: 'STORED',
  },
  MEDICAL_CERT: {
    type: 'MEDICAL_CERT',
    name: 'Signed Medical Certificate',
    shortName: 'Medical Cert',
    description: 'Grants 5s total invulnerability & immunity to Retake rune traps.',
    color: '#ec4899',
    instantOrStored: 'STORED',
  },
  FRIENDS_NOTES: {
    type: 'FRIENDS_NOTES',
    name: "Friend's Photocopy Notes",
    shortName: "Friend's Notes",
    description: 'Cures Blank Sheet ability lock & restores +20 HP and +0.15 CGPA.',
    color: '#84cc16',
    instantOrStored: 'STORED',
  },
  PAST_QUESTION_BANK: {
    type: 'PAST_QUESTION_BANK',
    name: 'Past Question Bank',
    shortName: 'Question Bank',
    description: 'Highlights boss weak spots for 2x crit damage & reveals attack telegraphs for 12s.',
    color: '#c084fc',
    instantOrStored: 'STORED',
  },
};

export interface ActiveBuffTimer {
  type: PowerUpType | 'CHA_CRASH' | 'BLANK_SILENCE' | 'ALL_NIGHTER_JITTERS';
  label: string;
  remaining: number;
  duration: number;
  color: string;
}

export interface Platform {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: 'SOLID' | 'ONE_WAY' | 'GRADE_DROP' | 'BOSS_HIGH' | 'GATE_DOOR';
  // For GRADE_DROP hazard: shakes and collapses 0.8s after stepping on it
  collapseState?: 'IDLE' | 'SHAKING' | 'COLLAPSED';
  collapseTimer?: number;
  respawnTimer?: number;
  // For Boss 3 eraser sweep temporary deletion
  erasedTimer?: number;
  // For Prerequisite gate door
  lockedById?: string;
}

export type EnemyKind =
  | 'ALL_NIGHTER'   // Twitchy shadow-wraith with red eyes & coffee steam; drains stamina & boosts player speed
  | 'BLANK_SHEET'   // Blinding white void mimic; disables ranged/dash abilities on hit
  | 'PREREQUISITE'  // Stone-and-iron padlock golem blocking mid-level doors; requires Assignment Key or Chit
  | 'DEANS_LIST';   // Heavily armored knight guarding final boss; only takes damage from behind or while boosted

export interface Enemy {
  id: string;
  kind: EnemyKind;
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  facing: 1 | -1;
  patrolMinX: number;
  patrolMaxX: number;
  stateTimer: number;
  attackCooldown: number;
  hitFlash: number;
  isPatrolSpawn?: boolean;
  baseMaxHp?: number;
  isDynamicSpawn?: boolean;
}

export interface RetakeTrap {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rewindX: number;
  rewindY: number;
  triggeredCooldown: number;
  pulsePhase: number;
}

export interface CollectibleItem {
  id: string;
  x: number;
  y: number;
  kind: 'POWER_UP' | 'ASSIGNMENT_KEY' | 'CGPA_SCROLL';
  powerUpType?: PowerUpType;
  collected: boolean;
  bobPhase: number;
}

export interface BellCurveWave {
  active: boolean;
  x: number;
  startX: number;
  endX: number;
  speed: number;
  height: number;
}

export interface CloneAlly {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  remaining: number;
  fireCooldown: number;
  offsetIndex: number;
}

export interface Projectile {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  fromPlayer: boolean;
  kind: 'CRUMPLED_PAPER' | 'RAZOR_PAGE' | 'POISON_SAND' | 'VOID_WAVE' | 'CHAIN_HOOK';
  color: string;
  life: number;
  pierce?: boolean;
}

export interface TelegraphZone {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  timer: number;
  duration: number;
  kind:
    | 'TEXTBOOK_SLAM'
    | 'CHAIN_LASER'
    | 'STAMP_SHOCKWAVE'
    | 'ERASER_SWEEP'
    | 'ULTIMATE_DISMISSED'
    | 'PROBATION_FALLING_HAZARD';
  color: string;
  label?: string;
  angle?: number;
}

export interface BossState {
  level: LevelId;
  name: string;
  subtitle: string;
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  phase: 1 | 2;
  active: boolean;
  defeated: boolean;
  state: 'IDLE' | 'MOVE' | 'TELEGRAPH' | 'ATTACK' | 'ULTIMATE_CHARGE' | 'ULTIMATE_SLAM' | 'STAGGER';
  stateTimer: number;
  attackIndex: number;
  hitFlash: number;
  facing: 1 | -1;
  // Level 1 Syllabus specifics
  chapterNumber: number;
  parchmentSpikesActive: boolean;
  // Level 2 Probation specifics
  arenaLeftOffset: number;
  arenaRightOffset: number;
  weakSpotOffset: { x: number; y: number; w: number; h: number };
  // Level 3 Academic Dismissal specifics
  wingsActive: boolean;
  silenceActive: boolean;
}

export interface BossIntroState {
  active: boolean;
  timer: number;
  duration: number;
  bossName: string;
  bossSubtitle: string;
  floorTitle: string;
  level: LevelId;
}

export type GhostEventTag = 'NONE' | 'JUMP' | 'DASH' | 'MELEE' | 'HURT' | 'FATAL';

export interface GhostPathSample {
  timeOffset: number; // Seconds relative to death (-5.0s to 0.0s)
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  grounded: boolean;
  dashing: boolean;
  melee: boolean;
  hp: number;
  cgpa: number;
  event: GhostEventTag;
}

export type ScreenShakeMode = 'STANDARD' | 'HIGH_FREQ_JITTER' | 'LOW_FREQ_HEAVY';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  strokeColor?: string;
  alpha: number;
  life: number;
  maxLife: number;
  shape: 'SQUARE' | 'CIRCLE' | 'PAPER' | 'SPARK' | 'TEXT' | 'VOID_SHARD';
  text?: string;
  rotation?: number;
  vRot?: number;
  gravity?: number;
  drag?: number;
  vertices?: { x: number; y: number }[];
}

export interface PlayerTrailNode {
  x: number;
  y: number;
  facing: 1 | -1;
  alpha: number;
  comboStep: 1 | 2 | 3;
  momentumRatio: number;
}

export interface HudSnapshot {
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  cgpa: number;
  researchMomentum: number;
  comboCount: number;
  level: LevelId;
  levelName: string;
  hasAssignmentKey: boolean;
  hasBonusMarkShield: boolean;
  abilitiesSilenced: boolean;
  inventory: (PowerUpType | null)[];
  activeBuffs: ActiveBuffTimer[];
  boss: {
    active: boolean;
    name: string;
    subtitle: string;
    hp: number;
    maxHp: number;
    phase: 1 | 2;
    silenceWarning: boolean;
  } | null;
  bossIntro: BossIntroState | null;
  cgpaDifficulty: {
    enemyHpMultiplier: number;
    enemySpawnRateMultiplier: number;
    hazardFrequencyMultiplier: number;
    regimeLabel: string;
  };
  elapsedSeconds: number;
  notification: string | null;
}


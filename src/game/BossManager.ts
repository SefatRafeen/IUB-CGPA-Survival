import { soundEngine } from '../audio/SoundEngine';
import {
  BossState,
  Particle,
  Platform,
  Projectile,
  ScreenShakeMode,
  TelegraphZone,
} from '../types/game';

export interface BossUpdateContext {
  dt: number;
  timeScale: number;
  playerX: number;
  playerY: number;
  playerW: number;
  playerH: number;
  floorY: number;
  arenaLeftX: number;
  arenaRightX: number;
  platforms: Platform[];
  projectiles: Projectile[];
  telegraphs: TelegraphZone[];
  particles: Particle[];
  onDamagePlayer: (hpLoss: number, cgpaLoss: number, reason: string, isUltimate?: boolean) => void;
  onScreenShake: (intensity: number, mode?: ScreenShakeMode) => void;
  onNotify: (msg: string) => void;
}

export function updateBoss(boss: BossState, ctx: BossUpdateContext): void {
  if (!boss.active || boss.defeated) return;

  const dt = ctx.dt * ctx.timeScale;
  if (boss.hitFlash > 0) {
    boss.hitFlash = Math.max(0, boss.hitFlash - ctx.dt);
  }

  // Check Phase 2 transition (< 50% HP)
  if (boss.phase === 1 && boss.hp <= boss.maxHp * 0.5) {
    boss.phase = 2;
    ctx.onScreenShake(16, boss.level === 3 ? 'LOW_FREQ_HEAVY' : 'STANDARD');
    soundEngine.playHydraulicSlam();

    if (boss.level === 1) {
      boss.parchmentSpikesActive = true;
      ctx.onNotify('PHASE 2: THE SYLLABUS UNROLLS ITS SPIKED PARCHMENT CARPET!');
    } else if (boss.level === 2) {
      ctx.onNotify('PHASE 2: PROBATION SHRINKS THE ARENA TO 50% & RAINS CORROSIVE SAND!');
    } else if (boss.level === 3) {
      boss.wingsActive = true;
      ctx.onNotify('PHASE 2: TORN EXAM WINGS SPROUT — WATCH FOR DEAD SILENCE!');
    }
  }

  const playerCenterX = ctx.playerX + ctx.playerW * 0.5;
  const bossCenterX = boss.x + boss.w * 0.5;
  boss.facing = playerCenterX < bossCenterX ? -1 : 1;

  if (boss.level === 1) {
    updateSyllabusBoss(boss, dt, ctx);
  } else if (boss.level === 2) {
    updateProbationBoss(boss, dt, ctx);
  } else {
    updateAcademicDismissalBoss(boss, dt, ctx);
  }
}

// ============================================================================
// BOSS 1: THE SYLLABUS (The Unending Scroll)
// ============================================================================
function updateSyllabusBoss(boss: BossState, dt: number, ctx: BossUpdateContext): void {
  // Spin chapter index (Ch. 1 to Ch. 99)
  if (Math.random() < dt * 12) {
    boss.chapterNumber = 1 + ((boss.chapterNumber + Math.floor(Math.random() * 7)) % 99);
  }

  // Phase 2 spiked parchment carpet hazard across the right half of the arena floor
  if (boss.parchmentSpikesActive) {
    const carpetLeft = ctx.arenaLeftX + (ctx.arenaRightX - ctx.arenaLeftX) * 0.45;
    const carpetRight = ctx.arenaRightX;
    const playerBottom = ctx.playerY + ctx.playerH;
    const playerCenterX = ctx.playerX + ctx.playerW * 0.5;
    if (
      playerBottom >= ctx.floorY - 8 &&
      playerCenterX >= carpetLeft &&
      playerCenterX <= carpetRight
    ) {
      ctx.onDamagePlayer(14, 0.2, 'Pierced by Unrolled Syllabus Spikes');
    }
  }

  boss.stateTimer -= dt;

  if (boss.state === 'IDLE' || boss.state === 'MOVE') {
    // Slowly glide toward preferred distance from player
    const targetX =
      ctx.playerX < (ctx.arenaLeftX + ctx.arenaRightX) * 0.5
        ? ctx.arenaRightX - 220
        : ctx.arenaLeftX + 140;
    const diff = targetX - boss.x;
    boss.x += Math.sign(diff) * Math.min(Math.abs(diff), (boss.phase === 2 ? 130 : 90) * dt);

    if (boss.stateTimer <= 0) {
      boss.attackIndex = (boss.attackIndex + 1) % 2;
      boss.state = 'TELEGRAPH';

      if (boss.attackIndex === 0) {
        // Attack A: Highlight vertical floor zone in neon yellow before slamming giant textbook
        soundEngine.play('syllabus_highlighter');
        const slamW = boss.phase === 2 ? 210 : 165;
        const slamX = Math.max(
          ctx.arenaLeftX + 20,
          Math.min(ctx.arenaRightX - slamW - 20, ctx.playerX + ctx.playerW * 0.5 - slamW * 0.5)
        );
        const teleDuration = boss.phase === 2 ? 0.85 : 1.05;
        boss.stateTimer = teleDuration;
        ctx.telegraphs.push({
          id: `tele-book-${Date.now()}`,
          x: slamX,
          y: ctx.floorY - 420,
          w: slamW,
          h: 420,
          timer: teleDuration,
          duration: teleDuration,
          kind: 'TEXTBOOK_SLAM',
          color: '#facc15',
          label: 'HIGHLIGHTED ZONE · TEXTBOOK SLAM',
        });
      } else {
        // Attack B: Horizontal razor-sharp paper slices
        boss.stateTimer = boss.phase === 2 ? 0.5 : 0.65;
      }
    }
  } else if (boss.state === 'TELEGRAPH') {
    if (boss.stateTimer <= 0) {
      boss.state = 'ATTACK';
      if (boss.attackIndex === 0) {
        // Textbook slam impacts occur automatically when telegraph expires in GameEngine,
        // plus we trigger book slam audio & shake here
        soundEngine.play('syllabus_slam');
        ctx.onScreenShake(12);
        boss.stateTimer = 0.6;
      } else {
        // Fire razor-sharp paper slices horizontally at 3 heights
        soundEngine.play('syllabus_slice');
        const heights = boss.phase === 2 ? [28, 72, 118, 165] : [32, 84, 132];
        const dir = boss.facing;
        heights.forEach((hOffset, i) => {
          ctx.projectiles.push({
            id: `razor-${Date.now()}-${i}`,
            x: boss.x + (dir > 0 ? boss.w : 0),
            y: ctx.floorY - hOffset,
            vx: dir * (boss.phase === 2 ? 460 : 380),
            vy: (i - 1) * 18,
            radius: 13,
            damage: 16,
            fromPlayer: false,
            kind: 'RAZOR_PAGE',
            color: '#fef08a',
            life: 2.6,
          });
        });
        boss.stateTimer = 0.65;
      }
    }
  } else if (boss.state === 'ATTACK') {
    if (boss.stateTimer <= 0) {
      boss.state = 'MOVE';
      boss.stateTimer = boss.phase === 2 ? 1.15 : 1.65;
    }
  }
}

// ============================================================================
// BOSS 2: PROBATION (The Shrinking Void)
// ============================================================================
function updateProbationBoss(boss: BossState, dt: number, ctx: BossUpdateContext): void {
  // Dynamically shrink arena boundaries inward via chain hooks
  const maxWidth = ctx.arenaRightX - ctx.arenaLeftX;
  const targetShrinkEachSide = boss.phase === 2 ? maxWidth * 0.25 : maxWidth * 0.12;
  const shrinkRate = boss.phase === 2 ? 36 : 18;

  if (boss.arenaLeftOffset < targetShrinkEachSide) {
    boss.arenaLeftOffset = Math.min(targetShrinkEachSide, boss.arenaLeftOffset + shrinkRate * dt);
  }
  if (boss.arenaRightOffset < targetShrinkEachSide) {
    boss.arenaRightOffset = Math.min(targetShrinkEachSide, boss.arenaRightOffset + shrinkRate * dt);
  }

  const shrinkRatio = (boss.arenaLeftOffset + boss.arenaRightOffset) / (maxWidth * 0.5);
  soundEngine.setArenaShrinkFactor(shrinkRatio);

  const activeLeft = ctx.arenaLeftX + boss.arenaLeftOffset;
  const activeRight = ctx.arenaRightX - boss.arenaRightOffset;

  // Corrosive green sludge on the shrunken edges damages player on contact
  if (ctx.playerX < activeLeft + 18 || ctx.playerX + ctx.playerW > activeRight - 18) {
    ctx.onDamagePlayer(16, 0.22, 'Burned by Probation Corrosive Boundary Sludge');
  }

  // Hover in a figure-8 arc above the arena
  const time = performance.now() * 0.0018;
  const centerArena = (activeLeft + activeRight) * 0.5;
  const span = Math.max(80, (activeRight - activeLeft) * 0.32);
  const targetX = centerArena + Math.sin(time) * span - boss.w * 0.5;
  const targetY = ctx.floorY - 225 + Math.cos(time * 2) * 38;

  boss.x += (targetX - boss.x) * Math.min(1, dt * 3.5);
  boss.y += (targetY - boss.y) * Math.min(1, dt * 3.5);

  // Phase 2 continuous poison sand rain
  if (boss.phase === 2 && Math.random() < dt * 4.2) {
    soundEngine.play('probation_acid');
    const dropX = activeLeft + 24 + Math.random() * Math.max(60, activeRight - activeLeft - 48);
    ctx.projectiles.push({
      id: `sand-${Date.now()}-${Math.random()}`,
      x: dropX,
      y: ctx.floorY - 460,
      vx: (Math.random() - 0.5) * 30,
      vy: 260,
      radius: 9,
      damage: 14,
      fromPlayer: false,
      kind: 'POISON_SAND',
      color: '#4ade80',
      life: 2.5,
    });
  }

  boss.stateTimer -= dt;

  if (boss.state === 'MOVE' || boss.state === 'IDLE') {
    if (boss.stateTimer <= 0) {
      boss.attackIndex = (boss.attackIndex + 1) % 2;
      boss.state = 'TELEGRAPH';

      if (boss.attackIndex === 0) {
        // Warning-beep laser beam across player's current elevation
        soundEngine.play('probation_beep');
        const laserY = Math.max(ctx.floorY - 360, Math.min(ctx.floorY - 46, ctx.playerY + 12));
        const teleDur = boss.phase === 2 ? 0.75 : 0.95;
        boss.stateTimer = teleDur;
        ctx.telegraphs.push({
          id: `tele-laser-${Date.now()}`,
          x: activeLeft,
          y: laserY,
          w: activeRight - activeLeft,
          h: 34,
          timer: teleDur,
          duration: teleDur,
          kind: 'CHAIN_LASER',
          color: '#ef4444',
          label: 'BEEP-BEEP-BEEP · PROBATION LASER',
        });
      } else {
        // Chain-lash burst
        soundEngine.play('probation_chain');
        boss.stateTimer = 0.55;
      }
    }
  } else if (boss.state === 'TELEGRAPH') {
    if (boss.stateTimer <= 0) {
      boss.state = 'ATTACK';
      if (boss.attackIndex === 0) {
        ctx.onScreenShake(9);
        boss.stateTimer = 0.45;
      } else {
        // Shoot chain hooks outward toward the player & walls
        soundEngine.play('probation_chain');
        const cx = boss.x + boss.w * 0.5;
        const cy = boss.y + boss.h * 0.5;
        const baseAngle = Math.atan2(ctx.playerY + 24 - cy, ctx.playerX + 18 - cx);
        const spreads = boss.phase === 2 ? [-0.32, -0.16, 0, 0.16, 0.32] : [-0.22, 0, 0.22];
        spreads.forEach((s, idx) => {
          const ang = baseAngle + s;
          ctx.projectiles.push({
            id: `chain-${Date.now()}-${idx}`,
            x: cx,
            y: cy,
            vx: Math.cos(ang) * 410,
            vy: Math.sin(ang) * 410,
            radius: 10,
            damage: 16,
            fromPlayer: false,
            kind: 'CHAIN_HOOK',
            color: '#f59e0b',
            life: 2.0,
          });
        });
        boss.stateTimer = 0.55;
      }
    }
  } else if (boss.state === 'ATTACK') {
    if (boss.stateTimer <= 0) {
      boss.state = 'MOVE';
      boss.stateTimer = boss.phase === 2 ? 1.05 : 1.55;
    }
  }
}

// ============================================================================
// BOSS 3: ACADEMIC DISMISSAL (The Red Stamp)
// ============================================================================
function updateAcademicDismissalBoss(boss: BossState, dt: number, ctx: BossUpdateContext): void {
  boss.stateTimer -= dt;

  if (boss.state === 'IDLE' || boss.state === 'MOVE') {
    // Cathedral bass footsteps as colossal knight stalks player
    const targetX = Math.max(
      ctx.arenaLeftX + 60,
      Math.min(ctx.arenaRightX - boss.w - 60, ctx.playerX - boss.w * 0.5)
    );
    const diff = targetX - boss.x;
    boss.x += Math.sign(diff) * Math.min(Math.abs(diff), (boss.phase === 2 ? 145 : 105) * dt);

    if (boss.stateTimer <= 0) {
      const cycleMod = boss.phase === 2 ? 3 : 2;
      boss.attackIndex = (boss.attackIndex + 1) % cycleMod;

      if (boss.attackIndex === 0) {
        // Attack 1: Hydraulic Stamp Slam creating shockwaves
        boss.state = 'TELEGRAPH';
        boss.stateTimer = boss.phase === 2 ? 0.75 : 0.92;
        ctx.telegraphs.push({
          id: `tele-stamp-${Date.now()}`,
          x: boss.x - 90,
          y: ctx.floorY - 120,
          w: boss.w + 180,
          h: 120,
          timer: boss.stateTimer,
          duration: boss.stateTimer,
          kind: 'STAMP_SHOCKWAVE',
          color: '#dc2626',
          label: 'HYDRAULIC RED STAMP SLAM',
        });
      } else if (boss.attackIndex === 1) {
        // Attack 2: Giant Razor-Sharp Eraser Blade Sweep (temporarily deletes lower platforms!)
        soundEngine.play('dismissal_eraser');
        boss.state = 'TELEGRAPH';
        boss.stateTimer = 0.85;
        ctx.telegraphs.push({
          id: `tele-eraser-${Date.now()}`,
          x: ctx.arenaLeftX,
          y: ctx.floorY - 150,
          w: ctx.arenaRightX - ctx.arenaLeftX,
          h: 65,
          timer: 0.85,
          duration: 0.85,
          kind: 'ERASER_SWEEP',
          color: '#f8fafc',
          label: 'ERASER BLADE SWEEP · DELETING LOWER PLATFORMS',
        });
      } else {
        // Attack 3 (Phase 2 Ultimate): Screen-wide one-hit-kill "DISMISSED" slam!
        // Cuts music to dead silence right before the impact!
        boss.state = 'ULTIMATE_CHARGE';
        boss.silenceActive = true;
        soundEngine.setBossSilence(true);
        soundEngine.play('dismissal_silence_ult');
        const chargeTime = 2.1;
        boss.stateTimer = chargeTime;
        ctx.onNotify('DEAD SILENCE... GET TO A HIGH PLATFORM, DASH, OR USE BONUS MARK!');
        ctx.telegraphs.push({
          id: `tele-ult-${Date.now()}`,
          x: ctx.arenaLeftX,
          y: ctx.floorY - 220,
          w: ctx.arenaRightX - ctx.arenaLeftX,
          h: 220,
          timer: chargeTime,
          duration: chargeTime,
          kind: 'ULTIMATE_DISMISSED',
          color: '#e11d48',
          label: 'ULTIMATE STAMP: "ACADEMICALLY DISMISSED" — CLIMB HIGH OR DASH!',
        });
      }
    }
  } else if (boss.state === 'TELEGRAPH') {
    if (boss.stateTimer <= 0) {
      boss.state = 'ATTACK';
      if (boss.attackIndex === 0) {
        // Hydraulic Stamp Slam shockwaves left and right along the floor
        soundEngine.play('dismissal_stamp');
        ctx.onScreenShake(22, 'LOW_FREQ_HEAVY');
        const centerX = boss.x + boss.w * 0.5;
        [-1, 1].forEach((dir) => {
          ctx.projectiles.push({
            id: `shock-${Date.now()}-${dir}`,
            x: centerX,
            y: ctx.floorY - 24,
            vx: dir * (boss.phase === 2 ? 480 : 390),
            vy: 0,
            radius: 24,
            damage: 22,
            fromPlayer: false,
            kind: 'VOID_WAVE',
            color: '#f43f5e',
            life: 2.2,
            pierce: true,
          });
        });
        boss.stateTimer = 0.65;
      } else if (boss.attackIndex === 1) {
        // Eraser sweep temporarily erases lower arena platforms for 4.5s
        soundEngine.play('dismissal_eraser');
        ctx.onScreenShake(12, 'STANDARD');
        for (const p of ctx.platforms) {
          if (p.id.startsWith('f3-boss-low')) {
            p.erasedTimer = 4.5;
          }
        }
        boss.stateTimer = 0.65;
      }
    }
  } else if (boss.state === 'ULTIMATE_CHARGE') {
    // Float slightly upward with torn exam wings spread wide
    if (boss.stateTimer <= 0) {
      boss.state = 'ULTIMATE_SLAM';
      boss.silenceActive = false;
      soundEngine.setBossSilence(false);
      soundEngine.play('dismissal_stamp');
      ctx.onScreenShake(32, 'LOW_FREQ_HEAVY');
      boss.stateTimer = 0.85;
    }
  } else if (boss.state === 'ULTIMATE_SLAM' || boss.state === 'ATTACK') {
    if (boss.stateTimer <= 0) {
      boss.state = 'MOVE';
      boss.stateTimer = boss.phase === 2 ? 1.25 : 1.65;
    }
  }
}

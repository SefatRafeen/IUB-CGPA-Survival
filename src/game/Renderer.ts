import {
  BellCurveWave,
  BossIntroState,
  BossState,
  CloneAlly,
  CollectibleItem,
  Enemy,
  GhostPathSample,
  LevelId,
  Particle,
  Platform,
  PlayerTrailNode,
  POWER_UP_CATALOG,
  Projectile,
  RetakeTrap,
  TelegraphZone,
} from '../types/game';
import {
  AnimRow,
  characterSprites,
  imagePreloader,
  SPRITE_CELL_H,
  SPRITE_CELL_W,
} from './SpriteLoader';

export interface PlayerRenderState {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  grounded: boolean;
  dashing: boolean;
  meleeTimer: number;
  meleeRange: number;
  invulnTimer: number;
  hasBonusMark: boolean;
  silenced: boolean;
  chaActive: boolean;
  revisionActive: boolean;
  medicalActive: boolean;
  questionBankActive: boolean;
  animTime: number;
  shattering: boolean;
  shatterProgress: number;
  researchMomentum: number;
  comboCount: number;
  comboStep: 1 | 2 | 3;
  trailNodes: PlayerTrailNode[];
}

export interface RenderSceneParams {
  ctx: CanvasRenderingContext2D;
  viewW: number;
  viewH: number;
  camX: number;
  camY: number;
  levelId: LevelId;
  floorY: number;
  arenaLeftX: number;
  arenaRightX: number;
  player: PlayerRenderState;
  platforms: Platform[];
  enemies: Enemy[];
  retakeTraps: RetakeTrap[];
  collectibles: CollectibleItem[];
  bellCurve: BellCurveWave;
  clones: CloneAlly[];
  projectiles: Projectile[];
  telegraphs: TelegraphZone[];
  boss: BossState;
  bossIntro: BossIntroState | null;
  ghostPath?: GhostPathSample[];
  showGhostOverlay?: boolean;
  particles: Particle[];
  time: number;
}

export function renderGameScene(p: RenderSceneParams): void {
  const { ctx, viewW, viewH, camX, camY, levelId, floorY, time } = p;

  ctx.save();

  // 1. Sky / Ruined IUB Interior Backdrop
  const skyGrad = ctx.createLinearGradient(0, 0, 0, viewH);
  if (levelId === 1) {
    skyGrad.addColorStop(0, '#09070d');
    skyGrad.addColorStop(0.55, '#150e18');
    skyGrad.addColorStop(1, '#1e1116');
  } else if (levelId === 2) {
    skyGrad.addColorStop(0, '#070b10');
    skyGrad.addColorStop(0.55, '#0e171f');
    skyGrad.addColorStop(1, '#12201b');
  } else {
    skyGrad.addColorStop(0, '#06060b');
    skyGrad.addColorStop(0.5, '#130c1c');
    skyGrad.addColorStop(1, '#240d17');
  }
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, viewW, viewH);

  // 2. Parallax Ruined IUB Red-Brick Architecture, Broken Spiral Ramps, Shattered Chalkboards & Flickering Fluorescents
  renderIUBParallaxBackground(ctx, viewW, viewH, camX, camY, levelId, floorY, time);

  // Translate into world coordinates
  ctx.save();
  ctx.translate(-camX, -camY);

  // 3. Boss Arena Boundary Curtains & Special Floor Hazards
  renderBossArenaEffects(ctx, p);

  // 4. Platforms (Solid, One-Way, Collapsing Grade Drops, Gate Doors, High Platforms)
  for (const plat of p.platforms) {
    renderPlatform(ctx, plat, time);
  }

  // 5. Retake Rune Traps
  for (const trap of p.retakeTraps) {
    renderRetakeTrap(ctx, trap, time);
  }

  // 6. Collectibles (Power-Ups & Assignment Keys)
  for (const item of p.collectibles) {
    if (!item.collected) {
      renderCollectible(ctx, item, time);
    }
  }

  // 7. Telegraph Zones & Past Question Bank Sightlines
  for (const tele of p.telegraphs) {
    renderTelegraph(ctx, tele, p.player.questionBankActive, time);
  }

  // 8. Enemies
  for (const enemy of p.enemies) {
    renderEnemy(ctx, enemy, time);
  }

  // 9. Boss (Active or during Boss Arrival Sequence)
  if ((p.boss.active || p.bossIntro?.active) && !p.boss.defeated) {
    renderBoss(ctx, p.boss, p.floorY, p.player.questionBankActive, p.player.x, p.player.y, time);
  }

  // 10. Group Study AI Classmate Clones
  for (const clone of p.clones) {
    renderCloneAlly(ctx, clone, time);
  }

  // 11. Main Player Character
  renderPlayer(ctx, p.player, time);

  // 11b. Ghost Path (Last 5.0s Movement Trajectory & Spectral Replay on Death Screen)
  if (p.showGhostOverlay && p.ghostPath && p.ghostPath.length > 1) {
    renderGhostPathOverlay(ctx, p.ghostPath, time);
  }

  // 12. Projectiles
  for (const proj of p.projectiles) {
    renderProjectile(ctx, proj, time);
  }

  // 13. The Bell Curve Sweeping Wave Hazard
  if (p.bellCurve.active) {
    renderBellCurveWave(ctx, p.bellCurve, p.floorY, time);
  }

  // 14. Particles & Floating Combat Text
  for (const part of p.particles) {
    renderParticle(ctx, part);
  }

  ctx.restore();

  // 15. Hollow Knight Atmospheric Vignette & Dead-Silence Desaturation Filter
  renderAtmosphericVignette(ctx, viewW, viewH, p.boss.silenceActive, p.player.silenced);

  // 16. Boss Arrival Sequence Letterbox & Signature IUB: Hollow Campus Dark Aesthetic Title Card
  if (p.bossIntro && p.bossIntro.active) {
    renderBossArrivalOverlay(ctx, viewW, viewH, p.bossIntro, time);
  }

  ctx.restore();
}

function renderIUBParallaxBackground(
  ctx: CanvasRenderingContext2D,
  viewW: number,
  viewH: number,
  camX: number,
  camY: number,
  levelId: LevelId,
  floorY: number,
  time: number
): void {
  const groundScreenY = floorY - camY;

  // Render preloaded landscape backdrop for the current level
  if (levelId === 1) {
    // Level 1 Atrium Backdrop: Render '1794864838768.jpg' full-width behind players
    const bg1 = imagePreloader.getImage('1794864838768.jpg');
    if (bg1) {
      ctx.save();
      const aspect = bg1.naturalWidth / Math.max(1, bg1.naturalHeight);
      const drawW = Math.max(viewW * 1.18, viewH * aspect);
      const drawH = Math.max(viewH, drawW / aspect);
      const maxPan = Math.max(0, drawW - viewW);
      const panRatio = Math.min(1, Math.max(0, camX / 3200));
      const dx = -panRatio * maxPan;
      const dy = Math.min(0, groundScreenY - drawH * 0.88);
      ctx.drawImage(bg1, dx, dy, drawW, drawH);
      // Subtle atmospheric dark wash so platforms, projectiles & HUD remain high-contrast
      ctx.fillStyle = 'rgba(10, 7, 14, 0.34)';
      ctx.fillRect(0, 0, viewW, viewH);
      ctx.restore();
    }
  } else if (levelId === 2) {
    // Level 2 Library & Corridors: Render '1794864824499.jpg' stretched or tiled appropriately
    const bg2 = imagePreloader.getImage('1794864824499.jpg');
    if (bg2) {
      ctx.save();
      const aspect = bg2.naturalWidth / Math.max(1, bg2.naturalHeight);
      const tileH = Math.max(viewH, 560);
      const tileW = Math.max(viewW, tileH * aspect);
      const scrollX = -((camX * 0.35) % tileW);
      const dy = Math.min(0, groundScreenY - tileH * 0.88);
      for (let tx = scrollX - tileW; tx < viewW + tileW; tx += tileW) {
        ctx.drawImage(bg2, tx, dy, tileW + 1, tileH);
      }
      ctx.fillStyle = 'rgba(7, 12, 16, 0.36)';
      ctx.fillRect(0, 0, viewW, viewH);
      ctx.restore();
    }
  } else {
    // Level 3 Rooftop & Skyline: Render '1794864810609.jpg' as the boss arena canvas background
    const bg3 = imagePreloader.getImage('1794864810609.jpg');
    if (bg3) {
      ctx.save();
      const aspect = bg3.naturalWidth / Math.max(1, bg3.naturalHeight);
      const drawW = Math.max(viewW * 1.15, viewH * aspect);
      const drawH = Math.max(viewH, drawW / aspect);
      const maxPan = Math.max(0, drawW - viewW);
      const panRatio = Math.min(1, Math.max(0, camX / 3400));
      const dx = -panRatio * maxPan;
      const dy = Math.min(0, groundScreenY - drawH * 0.88);
      ctx.drawImage(bg3, dx, dy, drawW, drawH);
      ctx.fillStyle = 'rgba(9, 6, 14, 0.32)';
      ctx.fillRect(0, 0, viewW, viewH);
      ctx.restore();
    }
  }

  // Mid Parallax Layer (0.55x): Flickering Fluorescent Tubes & Foreground Atmospheric Lighting
  const midOffset = -(camX * 0.55) % 520;
  for (let mx = midOffset - 520; mx < viewW + 520; mx += 520) {
    const flicker = Math.sin(time * 23 + mx) > -0.35 && Math.sin(time * 7 + mx * 0.5) > -0.6;
    const tubeX = mx + 235;
    const tubeY = groundScreenY - 370;

    ctx.strokeStyle = 'rgba(51, 65, 85, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(tubeX - 35, tubeY - 70);
    ctx.lineTo(tubeX - 35, tubeY);
    ctx.moveTo(tubeX + 35, tubeY - 70);
    ctx.lineTo(tubeX + 35, tubeY + 12);
    ctx.stroke();

    ctx.save();
    ctx.translate(tubeX, tubeY + 6);
    ctx.rotate(0.16);
    ctx.fillStyle = flicker ? '#e0f2fe' : '#1e293b';
    ctx.fillRect(-44, -3, 88, 6);
    if (flicker) {
      const cone = ctx.createRadialGradient(0, 10, 4, 0, 90, 170);
      cone.addColorStop(0, 'rgba(186, 230, 253, 0.14)');
      cone.addColorStop(1, 'rgba(186, 230, 253, 0)');
      ctx.fillStyle = cone;
      ctx.beginPath();
      ctx.arc(0, 70, 160, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function renderBossArenaEffects(ctx: CanvasRenderingContext2D, p: RenderSceneParams): void {
  const { boss, floorY, arenaLeftX, arenaRightX, time } = p;
  if (!boss.active || boss.defeated) return;

  // Boss 1 Phase 2: Spiked Parchment Carpet across right half of arena floor
  if (boss.level === 1 && boss.parchmentSpikesActive) {
    const carpetLeft = arenaLeftX + (arenaRightX - arenaLeftX) * 0.45;
    const carpetW = arenaRightX - carpetLeft;
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(carpetLeft, floorY - 8, carpetW, 8);

    ctx.fillStyle = '#dc2626';
    for (let sx = carpetLeft; sx < arenaRightX - 10; sx += 18) {
      const waveH = 16 + Math.sin(time * 12 + sx * 0.1) * 4;
      ctx.beginPath();
      ctx.moveTo(sx, floorY - 6);
      ctx.lineTo(sx + 9, floorY - 6 - waveH);
      ctx.lineTo(sx + 18, floorY - 6);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Boss 2: Shrinking Arena Chained Walls & Corrosive Green Sludge on edges
  if (boss.level === 2) {
    const activeLeft = arenaLeftX + boss.arenaLeftOffset;
    const activeRight = arenaRightX - boss.arenaRightOffset;

    // Corrosive green void curtains outside active bounds
    ctx.fillStyle = 'rgba(22, 163, 74, 0.22)';
    ctx.fillRect(arenaLeftX, floorY - 520, boss.arenaLeftOffset + 18, 520);
    ctx.fillRect(activeRight - 18, floorY - 520, boss.arenaRightOffset + 18, 520);

    // Bubbling corrosive green sludge walls
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(activeLeft, floorY - 520);
    ctx.lineTo(activeLeft, floorY);
    ctx.moveTo(activeRight, floorY - 520);
    ctx.lineTo(activeRight, floorY);
    ctx.stroke();

    // Chains tugging from Probation Boss to the shrinking walls
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(boss.x + boss.w * 0.5, boss.y + boss.h * 0.5);
    ctx.lineTo(activeLeft, floorY - 220);
    ctx.moveTo(boss.x + boss.w * 0.5, boss.y + boss.h * 0.5);
    ctx.lineTo(activeRight, floorY - 220);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function renderPlatform(ctx: CanvasRenderingContext2D, plat: Platform, time: number): void {
  if (plat.erasedTimer && plat.erasedTimer > 0) {
    // Ghostly chalk outline while erased by Academic Dismissal's Eraser Blade
    ctx.strokeStyle = 'rgba(248, 250, 252, 0.25)';
    ctx.setLineDash([6, 6]);
    ctx.strokeRect(plat.x, plat.y, plat.w, plat.h);
    ctx.setLineDash([]);
    return;
  }

  if (plat.kind === 'GRADE_DROP') {
    if (plat.collapseState === 'COLLAPSED') {
      ctx.strokeStyle = 'rgba(244, 63, 94, 0.25)';
      ctx.setLineDash([4, 6]);
      ctx.strokeRect(plat.x, plat.y, plat.w, plat.h);
      ctx.setLineDash([]);
      return;
    }

    const shakeX = plat.collapseState === 'SHAKING' ? (Math.random() - 0.5) * 7 : 0;
    const shakeY = plat.collapseState === 'SHAKING' ? (Math.random() - 0.5) * 4 : 0;

    ctx.save();
    ctx.translate(shakeX, shakeY);
    ctx.fillStyle = plat.collapseState === 'SHAKING' ? '#7f1d1d' : '#3b1d26';
    ctx.strokeStyle = plat.collapseState === 'SHAKING' ? '#f43f5e' : '#fb7185';
    ctx.lineWidth = 2;
    ctx.fillRect(plat.x, plat.y, plat.w, plat.h);
    ctx.strokeRect(plat.x, plat.y, plat.w, plat.h);

    // Cracked mortar zig-zag
    ctx.beginPath();
    ctx.moveTo(plat.x + plat.w * 0.3, plat.y);
    ctx.lineTo(plat.x + plat.w * 0.36, plat.y + plat.h * 0.5);
    ctx.lineTo(plat.x + plat.w * 0.31, plat.y + plat.h);
    ctx.moveTo(plat.x + plat.w * 0.7, plat.y);
    ctx.lineTo(plat.x + plat.w * 0.65, plat.y + plat.h);
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (plat.kind === 'GATE_DOOR') {
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 3;
    ctx.fillRect(plat.x, plat.y, plat.w, plat.h);
    ctx.strokeRect(plat.x, plat.y, plat.w, plat.h);
    // Iron bars & padlock emblem
    for (let by = plat.y + 24; by < plat.y + plat.h; by += 28) {
      ctx.fillStyle = '#64748b';
      ctx.fillRect(plat.x + 4, by, plat.w - 8, 5);
    }
    return;
  }

  if (plat.kind === 'BOSS_HIGH') {
    const glow = 0.6 + Math.sin(time * 4) * 0.25;
    ctx.fillStyle = '#1e1b4b';
    ctx.strokeStyle = `rgba(56, 189, 248, ${glow})`;
    ctx.lineWidth = 2.5;
    ctx.fillRect(plat.x, plat.y, plat.w, plat.h);
    ctx.strokeRect(plat.x, plat.y, plat.w, plat.h);
    return;
  }

  // Standard SOLID or ONE_WAY Ruined IUB Red-Brick / Concrete Ledge
  ctx.fillStyle = plat.h > 40 ? '#180f14' : '#2b1820';
  ctx.fillRect(plat.x, plat.y, plat.w, plat.h);

  // Top weathered red-brick trim
  ctx.fillStyle = '#6b2331';
  ctx.fillRect(plat.x, plat.y, plat.w, 5);

  ctx.strokeStyle = '#3f1d28';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(plat.x, plat.y, plat.w, plat.h);
}

function renderRetakeTrap(ctx: CanvasRenderingContext2D, trap: RetakeTrap, time: number): void {
  const pulse = 0.6 + Math.sin(time * 6 + trap.pulsePhase) * 0.35;
  ctx.save();
  ctx.fillStyle = `rgba(217, 70, 239, ${0.22 * pulse})`;
  ctx.fillRect(trap.x, trap.y - 6, trap.w, trap.h + 6);

  ctx.strokeStyle = `rgba(232, 121, 249, ${pulse})`;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(trap.x, trap.y + trap.h);
  ctx.lineTo(trap.x + trap.w, trap.y + trap.h);
  ctx.stroke();

  ctx.fillStyle = '#f0abfc';
  ctx.font = '700 9px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('RETAKE RUNE', trap.x + trap.w * 0.5, trap.y - 4);
  ctx.restore();
}

function renderCollectible(ctx: CanvasRenderingContext2D, item: CollectibleItem, time: number): void {
  const bobY = item.y + Math.sin(time * 4 + item.bobPhase) * 6;
  ctx.save();
  ctx.translate(item.x, bobY);

  if (item.kind === 'ASSIGNMENT_KEY') {
    // Glowing Golden Assignment Key
    ctx.shadowColor = '#fbbf24';
    ctx.shadowBlur = 14;
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(0, -6, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-3, 2, 6, 16);
    ctx.fillRect(3, 10, 6, 3);
    ctx.fillRect(3, 15, 6, 3);

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fef3c7';
    ctx.font = '700 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ASSIGNMENT KEY', 0, -22);
  } else if (item.powerUpType) {
    const meta = POWER_UP_CATALOG[item.powerUpType];
    ctx.shadowColor = meta.color;
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#13111c';
    ctx.strokeStyle = meta.color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = meta.color;
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#f8fafc';
    ctx.font = '600 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(meta.shortName, 0, -20);
  }

  ctx.restore();
}

function renderTelegraph(
  ctx: CanvasRenderingContext2D,
  tele: TelegraphZone,
  questionBankActive: boolean,
  time: number
): void {
  const progress = 1 - tele.timer / Math.max(0.01, tele.duration);
  const alpha = (questionBankActive ? 0.42 : 0.25) + Math.sin(time * 24) * 0.08;

  ctx.save();
  ctx.fillStyle =
    tele.kind === 'TEXTBOOK_SLAM'
      ? `rgba(250, 204, 21, ${alpha})`
      : tele.kind === 'ERASER_SWEEP'
      ? `rgba(248, 250, 252, ${alpha})`
      : `rgba(244, 63, 94, ${alpha})`;
  ctx.fillRect(tele.x, tele.y, tele.w, tele.h);

  ctx.strokeStyle = tele.color;
  ctx.lineWidth = questionBankActive ? 3 : 2;
  ctx.setLineDash([8, 6]);
  ctx.strokeRect(tele.x, tele.y, tele.w, tele.h);
  ctx.setLineDash([]);

  // Progress fill bar along bottom of telegraph zone
  ctx.fillStyle = tele.color;
  ctx.fillRect(tele.x, tele.y + tele.h - 4, tele.w * progress, 4);

  if (tele.label) {
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(tele.label, tele.x + tele.w * 0.5, tele.y + 20);
  }
  ctx.restore();
}

function renderEnemy(ctx: CanvasRenderingContext2D, e: Enemy, time: number): void {
  ctx.save();
  const cx = e.x + e.w * 0.5;
  const bottomY = e.y + e.h;

  // Miniboss & Enemy Sprite Sheet ('1794863097469.jpg'):
  // Top Row (frameY = 0): The Prerequisite [0] idle, [1] block, [2] shatter
  // Bottom Row (frameY = 1): All-Nighter [0] idle, [1] dash, [2] stun
  // Row 2 (frameY = 2): Dean's List [0] guard, [1] lunge, [2] Blank Sheet mimic
  const enemySheet = imagePreloader.getSpriteSheet('1794863097469.jpg');

  if (enemySheet instanceof HTMLCanvasElement) {
    const spriteWidth = SPRITE_CELL_W;
    const spriteHeight = SPRITE_CELL_H;
    let frameY = 0;
    let frameX = 0;
    let drawScale = 1.45;
    let yBob = 0;

    if (e.kind === 'PREREQUISITE') {
      frameY = 0; // Top Row: The Prerequisite idle/block/shatter
      if (e.hp < e.maxHp * 0.45) {
        frameX = 2; // Shattering / Cracked
      } else if (e.hitFlash > 0) {
        frameX = 1; // Block
      } else {
        frameX = 0; // Idle
      }
      drawScale = 1.5;
    } else if (e.kind === 'ALL_NIGHTER') {
      frameY = 1; // Bottom Row: All-Nighter idle/dash/stun
      if (e.hitFlash > 0) {
        frameX = 2; // Stun / Hit
      } else if (Math.abs(e.vx) > 130 || Math.sin(time * 8 + e.x * 0.04) > 0.25) {
        frameX = 1; // Dash
      } else {
        frameX = 0; // Idle
      }
      drawScale = 1.48;
      yBob = (Math.random() - 0.5) * 2.5;
    } else if (e.kind === 'DEANS_LIST') {
      frameY = 2; // Row 2: Dean's List guard/lunge
      frameX = Math.sin(time * 5 + e.x * 0.03) > 0.35 ? 1 : 0;
      drawScale = 1.52;
    } else {
      // BLANK_SHEET
      frameY = 2;
      frameX = 2;
      drawScale = 1.42;
      yBob = Math.sin(time * 6 + e.x * 0.05) * 4;
    }

    const drawH = e.h * drawScale;
    const drawW = drawH;

    ctx.save();
    ctx.translate(cx, bottomY + yBob);

    // Ground contact shadow
    ctx.fillStyle = 'rgba(5, 4, 8, 0.55)';
    ctx.beginPath();
    ctx.ellipse(0, 0, e.w * 0.48, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Since sprite sheet images face LEFT by default, flip ctx.scale(-1, 1) ONLY if moving/facing RIGHT (e.facing === 1)
    if (e.facing === 1) {
      ctx.scale(-1, 1);
    }

    if (e.hitFlash > 0) {
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 16;
    }

    ctx.drawImage(
      enemySheet,
      frameX * spriteWidth,
      frameY * spriteHeight,
      spriteWidth,
      spriteHeight,
      -drawW * 0.5,
      -drawH + 6,
      drawW,
      drawH
    );
    ctx.restore();

    // Role label above Minibosses
    if (e.kind === 'PREREQUISITE' || e.kind === 'DEANS_LIST') {
      ctx.fillStyle = e.kind === 'PREREQUISITE' ? '#fef3c7' : '#fde047';
      ctx.font = '700 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(
        e.kind === 'PREREQUISITE' ? 'PREREQUISITE' : "DEAN'S LIST",
        cx,
        e.y - 16
      );
    }
  } else {
    // Procedural fallback while sprite sheet initializes
    const cy = e.y + e.h * 0.5;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = e.hitFlash > 0 ? '#ffffff' : '#334155';
    ctx.fillRect(-e.w * 0.5, -e.h * 0.5, e.w, e.h);
    ctx.restore();
  }

  // Mini HP bar above damaged enemies
  if (e.hp < e.maxHp) {
    const barW = 44;
    ctx.fillStyle = 'rgba(9, 8, 12, 0.85)';
    ctx.fillRect(cx - barW * 0.5, e.y - 11, barW, 5);
    ctx.fillStyle = '#f43f5e';
    ctx.fillRect(cx - barW * 0.5, e.y - 11, barW * Math.max(0, e.hp / e.maxHp), 5);
  }

  ctx.restore();
}

function renderBoss(
  ctx: CanvasRenderingContext2D,
  boss: BossState,
  floorY: number,
  questionBankActive: boolean,
  playerX: number,
  playerY: number,
  time: number
): void {
  ctx.save();

  // If Past Question Bank is active, draw a tactical sightline between player and boss weak spot
  const weakX = boss.x + boss.weakSpotOffset.x + boss.weakSpotOffset.w * 0.5;
  const weakY = boss.y + boss.weakSpotOffset.y + boss.weakSpotOffset.h * 0.5;
  if (questionBankActive) {
    ctx.strokeStyle = 'rgba(192, 132, 252, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(playerX + 18, playerY + 28);
    ctx.lineTo(weakX, weakY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const cx = boss.x + boss.w * 0.5;
  const bottomY = boss.y + boss.h;
  const spriteWidth = SPRITE_CELL_W;
  const spriteHeight = SPRITE_CELL_H;

  if (boss.level === 1) {
    // BOSS 1: 'The Syllabus' ('1794864614904.jpg')
    // Slice horizontally: [0] Idle, [1] Projectile, [2] Slam, [3] Defeated / Unrolling
    const sheet = imagePreloader.getSpriteSheet('1794864614904.jpg');
    let frameX = 0;
    const frameY = 0;
    if (boss.defeated || boss.hp <= boss.maxHp * 0.15) {
      frameX = 3; // [3] Defeated / Unrolling
    } else if (
      (boss.state === 'TELEGRAPH' || boss.state === 'ATTACK') &&
      boss.attackIndex === 0
    ) {
      frameX = 2; // [2] Slam (Book Slam)
    } else if (
      (boss.state === 'TELEGRAPH' || boss.state === 'ATTACK') &&
      boss.attackIndex === 1
    ) {
      frameX = 1; // [1] Projectile (Paper Slice)
    } else {
      frameX = boss.phase === 2 && Math.sin(time * 5) > 0.4 ? 3 : 0; // [0] Idle
    }

    if (sheet instanceof HTMLCanvasElement) {
      const drawH = boss.h * 1.42;
      const drawW = drawH;
      ctx.save();
      ctx.translate(cx, bottomY);
      // Since sprite sheet images face LEFT by default, flip ctx.scale(-1, 1) ONLY if facing RIGHT (boss.facing === 1)
      if (boss.facing === 1) {
        ctx.scale(-1, 1);
      }
      if (boss.hitFlash > 0) {
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 20;
      }
      ctx.drawImage(
        sheet,
        frameX * spriteWidth,
        frameY * spriteHeight,
        spriteWidth,
        spriteHeight,
        -drawW * 0.5,
        -drawH + 10,
        drawW,
        drawH
      );
      ctx.restore();
    }

    // Floating Chapter Index badge above The Syllabus
    ctx.fillStyle = 'rgba(28, 25, 23, 0.88)';
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1.5;
    ctx.fillRect(cx - 34, boss.y - 24, 68, 20);
    ctx.strokeRect(cx - 34, boss.y - 24, 68, 20);
    ctx.fillStyle = '#facc15';
    ctx.font = '700 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`Ch. ${boss.chapterNumber}`, cx, boss.y - 10);
  } else if (boss.level === 2) {
    // BOSS 2: 'Probation' ('1794863050921.jpg')
    // Slice: [0] Idle, [1] Chain Attack, [2] Warn/Laser, [3] Crumbling / Defeat
    const sheet = imagePreloader.getSpriteSheet('1794863050921.jpg');
    let frameX = 0;
    const frameY = 0;
    if (boss.defeated || boss.hp <= boss.maxHp * 0.15) {
      frameX = 3; // [3] Crumbling / Defeat
    } else if (
      (boss.state === 'TELEGRAPH' || boss.state === 'ATTACK') &&
      boss.attackIndex === 1
    ) {
      frameX = 1; // [1] Chain Attack
    } else if (
      (boss.state === 'TELEGRAPH' || boss.state === 'ATTACK') &&
      boss.attackIndex === 0
    ) {
      frameX = 2; // [2] Warn/Laser & Sand Rain
    } else {
      frameX = Math.sin(time * 4) > 0.55 ? 3 : 0; // [0] Idle
    }

    // Leaking glowing amber & poison-green sand stream to arena floor
    const cy = boss.y + boss.h * 0.5;
    ctx.fillStyle = boss.phase === 2 ? 'rgba(74, 222, 128, 0.65)' : 'rgba(245, 158, 11, 0.55)';
    ctx.fillRect(cx - 3, cy + 20, 6, Math.max(0, floorY - (cy + 20)));

    if (sheet instanceof HTMLCanvasElement) {
      const drawH = boss.h * 1.48;
      const drawW = drawH;
      ctx.save();
      ctx.translate(cx, bottomY);
      if (boss.facing === 1) {
        ctx.scale(-1, 1);
      }
      if (boss.hitFlash > 0) {
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 20;
      }
      ctx.drawImage(
        sheet,
        frameX * spriteWidth,
        frameY * spriteHeight,
        spriteWidth,
        spriteHeight,
        -drawW * 0.5,
        -drawH + 10,
        drawW,
        drawH
      );
      ctx.restore();
    }
  } else {
    // BOSS 3: 'Academic Dismissal' ('1794863067894.jpg')
    // Slice: [0] Idle, [1] Stamp Slam, [2] Blade Sweep, [3] Final/Winged Phase
    const sheet = imagePreloader.getSpriteSheet('1794863067894.jpg');
    let frameX = 0;
    const frameY = 0;
    if (
      boss.state === 'ULTIMATE_CHARGE' ||
      boss.state === 'ULTIMATE_SLAM' ||
      (boss.wingsActive && boss.state === 'IDLE')
    ) {
      frameX = 3; // [3] Final/Winged Phase
    } else if (
      (boss.state === 'TELEGRAPH' || boss.state === 'ATTACK') &&
      boss.attackIndex === 0
    ) {
      frameX = 1; // [1] Stamp Slam
    } else if (
      (boss.state === 'TELEGRAPH' || boss.state === 'ATTACK') &&
      boss.attackIndex === 1
    ) {
      frameX = 2; // [2] Blade Sweep
    } else {
      frameX = boss.wingsActive ? 3 : 0; // [0] Idle or [3] Winged Phase
    }

    if (sheet instanceof HTMLCanvasElement) {
      const drawH = boss.h * (frameX === 3 ? 1.62 : 1.46);
      const drawW = drawH;
      ctx.save();
      ctx.translate(cx, bottomY);
      if (boss.facing === 1) {
        ctx.scale(-1, 1);
      }
      if (boss.hitFlash > 0) {
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 22;
      }
      ctx.drawImage(
        sheet,
        frameX * spriteWidth,
        frameY * spriteHeight,
        spriteWidth,
        spriteHeight,
        -drawW * 0.5,
        -drawH + 10,
        drawW,
        drawH
      );
      ctx.restore();
    }
  }

  // Highlight Boss Weak Spot if Past Question Bank is active
  if (questionBankActive) {
    const wx = boss.x + boss.weakSpotOffset.x;
    const wy = boss.y + boss.weakSpotOffset.y;
    const ww = boss.weakSpotOffset.w;
    const wh = boss.weakSpotOffset.h;
    ctx.strokeStyle = '#c084fc';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(wx - 4, wy - 4, ww + 8, wh + 8);
    ctx.fillStyle = '#e9d5ff';
    ctx.font = '700 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('2x CRIT WEAK SPOT', wx + ww * 0.5, wy - 8);
  }

  ctx.restore();
}

function renderCloneAlly(ctx: CanvasRenderingContext2D, clone: CloneAlly, time: number): void {
  ctx.save();
  ctx.translate(clone.x, clone.y + Math.sin(time * 6 + clone.offsetIndex) * 4);
  ctx.globalAlpha = 0.75;
  ctx.fillStyle = '#a855f7';
  ctx.strokeStyle = '#f3e8ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, -18, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillRect(-9, -6, 18, 24);
  ctx.fillStyle = '#e9d5ff';
  ctx.font = '700 9px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('ALLY', 0, -32);
  ctx.restore();
}

function renderPlayer(ctx: CanvasRenderingContext2D, player: PlayerRenderState, time: number): void {
  ctx.save();
  const cx = player.x + player.w * 0.5;
  const bottomY = player.y + player.h;

  // Player Shattering Sequence on Game Over
  if (player.shattering) {
    const p = player.shatterProgress;
    const centerY = bottomY - player.h * 0.5;

    // Expanding blinding white-void shockwave rings
    if (p >= 0.2) {
      const ringProgress = Math.min(1, (p - 0.2) / 0.8);
      ctx.save();
      ctx.strokeStyle = `rgba(248, 250, 252, ${Math.max(0, 1 - ringProgress)})`;
      ctx.lineWidth = 4 * (1 - ringProgress * 0.7);
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(cx, centerY, 18 + ringProgress * 155, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = `rgba(56, 189, 248, ${Math.max(0, 0.75 - ringProgress)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, centerY, 8 + ringProgress * 95, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // After 25% of the shatter timeline, the sprite has fully fragmented into procedural white-void shards
    if (p >= 0.25) {
      ctx.restore();
      return;
    }

    // Pre-burst fracture buildup (0 to 0.25): high-frequency tremor + glowing white void cracks across the body
    const jitterX = (Math.random() - 0.5) * 8;
    const jitterY = (Math.random() - 0.5) * 8;
    ctx.translate(jitterX, jitterY - p * 24);
  }

  // Flicker transparency during brief post-hit invulnerability
  if (!player.shattering && player.invulnTimer > 0 && Math.floor(time * 20) % 2 === 0) {
    ctx.globalAlpha = 0.55;
  }

  // Aura rings for active buffs
  if (player.hasBonusMark) {
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.8)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, bottomY - player.h * 0.5, 36 + Math.sin(time * 6) * 2, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (player.medicalActive) {
    ctx.strokeStyle = 'rgba(236, 72, 153, 0.85)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.arc(cx, bottomY - player.h * 0.5, 42, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Determine animation row and frame from attached character sprite sheet
  let row: AnimRow = 'IDLE';
  let frameIdx = Math.floor(player.animTime * 6) % 5;
  if (!player.grounded) {
    row = 'JUMP';
    frameIdx = player.vy < -120 ? 1 : player.vy < 40 ? 2 : 3;
  } else if (player.dashing || Math.abs(player.vx) > 290 || player.chaActive) {
    row = 'RUN';
    frameIdx = Math.floor(player.animTime * 14) % 5;
  } else if (Math.abs(player.vx) > 15) {
    row = 'WALK';
    frameIdx = Math.floor(player.animTime * 10) % 5;
  }

  const spriteCanvas = characterSprites.getFrame(row, frameIdx);
  const momentumRatio = Math.max(0, Math.min(1, player.researchMomentum / 100));

  // Procedural Research Momentum Trail Effects (Spectral Ribbon + Afterimage Ghost Silhouettes)
  if (!player.shattering && player.trailNodes.length > 0 && (momentumRatio > 0.05 || player.dashing)) {
    const primaryTrailColor =
      momentumRatio >= 0.8
        ? '#f43f5e' // Thesis Overdrive Crimson
        : momentumRatio >= 0.4
        ? '#c084fc' // Peer-Review Surge Violet
        : '#38bdf8'; // Citation Ink Cyan
    const secondaryTrailColor =
      momentumRatio >= 0.8 ? '#fbbf24' : momentumRatio >= 0.4 ? '#38bdf8' : '#bae6fd';

    // 1. Flowing spectral scarf/momentum ribbon connecting trail nodes
    if (player.trailNodes.length >= 2) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowColor = primaryTrailColor;
      ctx.shadowBlur = 10 + momentumRatio * 12;

      for (let i = 0; i < player.trailNodes.length - 1; i++) {
        const curr = player.trailNodes[i];
        const next = player.trailNodes[i + 1];
        const segFactor = (1 - i / player.trailNodes.length) * Math.max(0.25, momentumRatio);
        ctx.strokeStyle = i % 2 === 0 ? primaryTrailColor : secondaryTrailColor;
        ctx.globalAlpha = Math.min(0.85, curr.alpha * (0.35 + momentumRatio * 0.55));
        ctx.lineWidth = Math.max(1.5, (6 + momentumRatio * 10) * segFactor);
        ctx.beginPath();
        ctx.moveTo(curr.x + player.w * 0.5, curr.y + player.h * 0.46);
        ctx.lineTo(next.x + player.w * 0.5, next.y + player.h * 0.46);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 2. Afterimage ghost silhouettes along the player's motion path
    const ghostStride = momentumRatio >= 0.65 ? 1 : 2;
    for (let i = 0; i < player.trailNodes.length; i += ghostStride) {
      const node = player.trailNodes[i];
      if (node.alpha <= 0.04) continue;
      const ghostAlpha = node.alpha * (0.18 + momentumRatio * 0.36);

      ctx.save();
      ctx.globalAlpha = ghostAlpha;
      ctx.translate(node.x + player.w * 0.5, node.y + player.h);
      ctx.scale(node.facing, 1);
      ctx.shadowColor = primaryTrailColor;
      ctx.shadowBlur = 8 + momentumRatio * 10;

      if (spriteCanvas) {
        const targetH = player.h * 1.18;
        const aspect = spriteCanvas.width / Math.max(1, spriteCanvas.height);
        const targetW = targetH * aspect;
        ctx.drawImage(spriteCanvas, -targetW * 0.5, -targetH + 4, targetW, targetH);
      } else {
        ctx.fillStyle = primaryTrailColor;
        ctx.fillRect(-12, -player.h, 24, player.h);
      }

      // Luminous momentum rim line on ghost
      ctx.strokeStyle = secondaryTrailColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, -player.h * 0.52, 16 + momentumRatio * 8, -0.8, 0.8);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Orbiting Research Momentum Aura when momentum >= 25%
  if (!player.shattering && momentumRatio >= 0.25) {
    ctx.save();
    const auraColor =
      momentumRatio >= 0.8 ? '#fbbf24' : momentumRatio >= 0.4 ? '#c084fc' : '#38bdf8';
    ctx.strokeStyle = auraColor;
    ctx.globalAlpha = 0.35 + momentumRatio * 0.45;
    ctx.lineWidth = 1.5 + momentumRatio * 1.5;
    const orbitR = 28 + momentumRatio * 10;
    const spin = time * (3.5 + momentumRatio * 5);
    ctx.beginPath();
    ctx.arc(cx, bottomY - player.h * 0.5, orbitR, spin, spin + Math.PI * 1.15);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, bottomY - player.h * 0.5, orbitR - 4, spin + Math.PI, spin + Math.PI * 2.15);
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.translate(cx, bottomY);
  ctx.scale(player.facing, 1);

  // Grounding contact shadow directly beneath the character's boots
  if (player.grounded && !player.shattering) {
    ctx.fillStyle = 'rgba(5, 4, 8, 0.55)';
    ctx.beginPath();
    ctx.ellipse(0, 1.5, 14, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  if (spriteCanvas) {
    // Preserve aspect ratio of the cropped sprite frame while planting boots firmly on the floor surface
    const targetH = player.h * 1.18;
    const aspect = spriteCanvas.width / Math.max(1, spriteCanvas.height);
    const targetW = targetH * aspect;
    ctx.drawImage(spriteCanvas, -targetW * 0.5, -targetH + 4, targetW, targetH);
  } else {
    // Fallback procedural Hollow-Knight-styled student silhouette while image initializes
    ctx.fillStyle = '#0ea5e9';
    ctx.fillRect(-14, -player.h, 28, player.h);
  }

  // Draw glowing white-void fracture cracks over the character right before shattering
  if (player.shattering) {
    ctx.strokeStyle = '#ffffff';
    ctx.shadowColor = '#e0f2fe';
    ctx.shadowBlur = 14;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, -player.h * 0.55);
    ctx.lineTo(-14, -player.h * 0.85);
    ctx.moveTo(0, -player.h * 0.55);
    ctx.lineTo(15, -player.h * 0.78);
    ctx.moveTo(0, -player.h * 0.55);
    ctx.lineTo(-12, -player.h * 0.2);
    ctx.moveTo(0, -player.h * 0.55);
    ctx.lineTo(14, -player.h * 0.15);
    ctx.stroke();
  }

  // 3-Stage Melee Combo Slash Arc & Rolled-up Lab Report Weapon
  if (player.meleeTimer > 0 && !player.shattering) {
    const slashProgress = 1 - player.meleeTimer / 0.18;
    const reach = player.meleeRange * (player.comboStep === 3 ? 1.18 : 1.0);
    const step = player.comboStep;

    const primaryArcColor = player.revisionActive
      ? '#f43f5e'
      : step === 3
      ? '#fbbf24'
      : momentumRatio >= 0.5
      ? '#c084fc'
      : '#f8fafc';
    const secondaryArcColor =
      step === 3 ? '#f43f5e' : momentumRatio >= 0.4 ? '#38bdf8' : '#94a3b8';

    ctx.save();
    ctx.shadowColor = primaryArcColor;
    ctx.shadowBlur = 8 + momentumRatio * 12 + (step === 3 ? 8 : 0);
    ctx.strokeStyle = primaryArcColor;
    ctx.lineWidth = (player.revisionActive ? 7 : 5) + (step === 3 ? 2.5 : 0) + momentumRatio * 2;

    if (step === 1) {
      // Combo Step 1: Crisp downward diagonal slash
      ctx.beginPath();
      ctx.arc(10, -player.h * 0.52, reach * 0.72, -0.95 + slashProgress * 0.45, 0.95);
      ctx.stroke();
    } else if (step === 2) {
      // Combo Step 2: Rising reverse uppercut arc + inner momentum wake
      ctx.beginPath();
      ctx.arc(12, -player.h * 0.55, reach * 0.76, -1.1, 0.85 - slashProgress * 0.4);
      ctx.stroke();

      ctx.strokeStyle = secondaryArcColor;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(10, -player.h * 0.55, reach * 0.56, -0.95, 0.65);
      ctx.stroke();
    } else {
      // Combo Step 3: Thesis Finisher — Wide twin-crescent heavy cleave
      ctx.beginPath();
      ctx.arc(14, -player.h * 0.52, reach * 0.84, -1.35 + slashProgress * 0.25, 1.25);
      ctx.stroke();

      ctx.strokeStyle = secondaryArcColor;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(14, -player.h * 0.52, reach * 0.64, -1.15, 1.05 - slashProgress * 0.2);
      ctx.stroke();
    }
    ctx.restore();

    // Rolled-up lab report cylinder with red rubber band
    ctx.save();
    ctx.translate(14, -player.h * 0.52);
    const swingAngle =
      step === 2
        ? 0.9 - slashProgress * 1.45
        : step === 3
        ? -0.85 + slashProgress * 1.85
        : -0.45 + slashProgress * 1.35;
    ctx.rotate(swingAngle);
    ctx.fillStyle = step === 3 ? '#fef08a' : '#fef9c3';
    ctx.fillRect(0, -4, reach * 0.65, 8);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(reach * 0.3, -5, 5, 10);
    ctx.restore();
  }

  ctx.restore();

  // Status indicator above player if silenced by Blank Sheet
  if (player.silenced && !player.shattering) {
    ctx.fillStyle = '#f8fafc';
    ctx.font = '700 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SILENCED · NO DASH/RANGED', cx, player.y - 12);
  }

  ctx.restore();
}

function renderProjectile(ctx: CanvasRenderingContext2D, proj: Projectile, time: number): void {
  ctx.save();
  ctx.translate(proj.x, proj.y);

  if (proj.kind === 'CRUMPLED_PAPER') {
    ctx.rotate(time * 12);
    ctx.fillStyle = proj.color;
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-proj.radius, -proj.radius * 0.5);
    ctx.lineTo(0, -proj.radius);
    ctx.lineTo(proj.radius, -proj.radius * 0.3);
    ctx.lineTo(proj.radius * 0.7, proj.radius);
    ctx.lineTo(-proj.radius * 0.6, proj.radius * 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (proj.kind === 'RAZOR_PAGE') {
    ctx.fillStyle = '#fef08a';
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.fillRect(-16, -4, 32, 8);
    ctx.strokeRect(-16, -4, 32, 8);
  } else {
    ctx.fillStyle = proj.color;
    ctx.shadowColor = proj.color;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(0, 0, proj.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function renderBellCurveWave(
  ctx: CanvasRenderingContext2D,
  wave: BellCurveWave,
  floorY: number,
  time: number
): void {
  ctx.save();
  const waveGrad = ctx.createLinearGradient(wave.x - 140, 0, wave.x + 20, 0);
  waveGrad.addColorStop(0, 'rgba(56, 189, 248, 0.04)');
  waveGrad.addColorStop(0.75, 'rgba(56, 189, 248, 0.28)');
  waveGrad.addColorStop(1, 'rgba(244, 63, 94, 0.72)');

  ctx.fillStyle = waveGrad;
  ctx.fillRect(wave.x - 140, floorY - wave.height, 150, wave.height);

  // Glowing Gaussian Bell Curve leading edge
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 4;
  ctx.beginPath();
  for (let py = 0; py <= wave.height; py += 12) {
    const norm = (py / wave.height - 0.5) * 2.8;
    const bellOffset = Math.exp(-norm * norm) * 26 + Math.sin(time * 9 + py * 0.05) * 4;
    const wx = wave.x + bellOffset;
    const wy = floorY - py;
    if (py === 0) ctx.moveTo(wx, wy);
    else ctx.lineTo(wx, wy);
  }
  ctx.stroke();

  ctx.fillStyle = '#bae6fd';
  ctx.font = '700 11px "JetBrains Mono", monospace';
  ctx.fillText('THE BELL CURVE WAVE', wave.x - 130, floorY - wave.height + 24);
  ctx.restore();
}

function renderParticle(ctx: CanvasRenderingContext2D, part: Particle): void {
  ctx.save();
  const lifeRatio = Math.max(0, part.life / Math.max(0.01, part.maxLife));
  ctx.globalAlpha = Math.max(0, part.alpha * lifeRatio);
  ctx.translate(part.x, part.y);

  if (part.shape === 'SPARK') {
    // High-velocity directional wall-dash spark streak
    const angle = Math.atan2(part.vy, part.vx);
    ctx.rotate(angle);
    const speed = Math.hypot(part.vx, part.vy);
    const len = Math.max(part.size * 2.2, Math.min(26, speed * 0.045));
    ctx.shadowColor = part.color;
    ctx.shadowBlur = 10;
    ctx.strokeStyle = part.color;
    ctx.lineWidth = part.size * 0.75;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-len, 0);
    ctx.lineTo(len * 0.4, 0);
    ctx.stroke();

    // Hot white spark tip
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(len * 0.3, 0, Math.max(1.2, part.size * 0.45), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  if (part.rotation) {
    ctx.rotate(part.rotation);
  }

  if (part.shape === 'VOID_SHARD') {
    // Procedural white-void polygonal shard from player shattering animation
    ctx.shadowColor = part.strokeColor || '#38bdf8';
    ctx.shadowBlur = 14;
    ctx.fillStyle = part.color;
    ctx.strokeStyle = part.strokeColor || '#bae6fd';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (part.vertices && part.vertices.length >= 3) {
      ctx.moveTo(part.vertices[0].x, part.vertices[0].y);
      for (let i = 1; i < part.vertices.length; i++) {
        ctx.lineTo(part.vertices[i].x, part.vertices[i].y);
      }
    } else {
      ctx.moveTo(0, -part.size);
      ctx.lineTo(part.size * 0.75, part.size * 0.2);
      ctx.lineTo(-part.size * 0.3, part.size * 0.9);
      ctx.lineTo(-part.size * 0.8, -part.size * 0.25);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (part.shape === 'TEXT' && part.text) {
    ctx.fillStyle = part.color;
    ctx.font = '700 13px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(part.text, 0, 0);
  } else if (part.shape === 'PAPER') {
    // Fluttering 3D-like paper confetti (blood-red graded slips & yellowing scroll pages)
    const flutterScaleY = Math.max(0.22, Math.abs(Math.cos(part.life * 14 + (part.rotation || 0))));
    ctx.scale(1, flutterScaleY);
    const w = part.size * 1.55;
    const h = part.size * 0.95;
    ctx.fillStyle = part.color;
    ctx.fillRect(-w * 0.5, -h * 0.5, w, h);
    if (part.strokeColor) {
      ctx.strokeStyle = part.strokeColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(-w * 0.5, -h * 0.5, w, h);
    }
  } else if (part.shape === 'CIRCLE') {
    ctx.fillStyle = part.color;
    ctx.beginPath();
    ctx.arc(0, 0, part.size, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = part.color;
    ctx.fillRect(-part.size * 0.5, -part.size * 0.5, part.size, part.size);
  }
  ctx.restore();
}

function renderAtmosphericVignette(
  ctx: CanvasRenderingContext2D,
  viewW: number,
  viewH: number,
  bossSilence: boolean,
  playerSilenced: boolean
): void {
  const rad = ctx.createRadialGradient(
    viewW * 0.5,
    viewH * 0.5,
    Math.min(viewW, viewH) * 0.28,
    viewW * 0.5,
    viewH * 0.5,
    Math.max(viewW, viewH) * 0.72
  );
  rad.addColorStop(0, 'rgba(9, 8, 12, 0)');
  rad.addColorStop(
    1,
    bossSilence
      ? 'rgba(159, 18, 57, 0.65)'
      : playerSilenced
      ? 'rgba(226, 232, 240, 0.25)'
      : 'rgba(6, 5, 10, 0.72)'
  );
  ctx.fillStyle = rad;
  ctx.fillRect(0, 0, viewW, viewH);
}

function renderBossArrivalOverlay(
  ctx: CanvasRenderingContext2D,
  viewW: number,
  viewH: number,
  intro: BossIntroState,
  time: number
): void {
  const progress = Math.max(0, Math.min(1, 1 - intro.timer / Math.max(0.01, intro.duration)));
  // Envelope: fade in (0 -> 0.18), hold (0.18 -> 0.82), fade out (0.82 -> 1.0)
  const env =
    progress < 0.18
      ? progress / 0.18
      : progress > 0.82
      ? Math.max(0, (1 - progress) / 0.18)
      : 1;

  ctx.save();

  // 1. Top & Bottom Cinematic Hollow-Campus Letterbox Bars
  const barH = Math.round(Math.min(72, viewH * 0.12) * env);
  ctx.fillStyle = 'rgba(6, 5, 10, 0.92)';
  ctx.fillRect(0, 0, viewW, barH);
  ctx.fillRect(0, viewH - barH, viewW, barH);

  // Subtle crimson/ivory border trim on letterbox bars
  ctx.strokeStyle = `rgba(225, 29, 72, ${0.55 * env})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, barH);
  ctx.lineTo(viewW, barH);
  ctx.moveTo(0, viewH - barH);
  ctx.lineTo(viewW, viewH - barH);
  ctx.stroke();

  // 2. Signature IUB: Hollow Campus Dark Aesthetic Title Banner in Lower-Center / Center-Bottom
  const bannerY = viewH * 0.72;
  const cx = viewW * 0.5;

  ctx.globalAlpha = env;

  // Atmospheric dark void backdrop band behind boss title
  const bandGrad = ctx.createLinearGradient(cx - 320, 0, cx + 320, 0);
  bandGrad.addColorStop(0, 'rgba(9, 8, 12, 0)');
  bandGrad.addColorStop(0.2, 'rgba(9, 8, 12, 0.86)');
  bandGrad.addColorStop(0.5, 'rgba(20, 11, 18, 0.94)');
  bandGrad.addColorStop(0.8, 'rgba(9, 8, 12, 0.86)');
  bandGrad.addColorStop(1, 'rgba(9, 8, 12, 0)');
  ctx.fillStyle = bandGrad;
  ctx.fillRect(cx - 320, bannerY - 64, 640, 116);

  // Ornate Hollow-Knight inspired upper filigree & diamond crest
  const lineSpan = Math.min(viewW * 0.38, 230) * (0.6 + 0.4 * env);
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - lineSpan, bannerY - 22);
  ctx.lineTo(cx - 18, bannerY - 22);
  ctx.moveTo(cx + 18, bannerY - 22);
  ctx.lineTo(cx + lineSpan, bannerY - 22);
  ctx.stroke();

  // Center crimson diamond & horn crest
  ctx.fillStyle = '#f43f5e';
  ctx.beginPath();
  ctx.moveTo(cx, bannerY - 30);
  ctx.lineTo(cx + 8, bannerY - 22);
  ctx.lineTo(cx, bannerY - 14);
  ctx.lineTo(cx - 8, bannerY - 22);
  ctx.closePath();
  ctx.fill();

  // Floor / Archive header above filigree
  ctx.fillStyle = '#fda4af';
  ctx.font = '700 10px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText(
    `IUB: HOLLOW CAMPUS · FLOOR ${intro.level} WARDEN`,
    cx,
    bannerY - 38
  );

  // Main Boss Name in Cinzel Display Serif with subtle crimson/white glow
  ctx.shadowColor = '#e11d48';
  ctx.shadowBlur = 18 + Math.sin(time * 8) * 4;
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 30px "Cinzel", serif';
  ctx.fillText(intro.bossName.toUpperCase(), cx, bannerY + 12);
  ctx.shadowBlur = 0;

  // Subtitle / Epithet below
  ctx.fillStyle = '#cbd5e1';
  ctx.font = '600 12px "JetBrains Mono", monospace';
  ctx.fillText(`— ${intro.bossSubtitle.toUpperCase()} —`, cx, bannerY + 34);

  // Lower filigree rule
  ctx.strokeStyle = 'rgba(244, 63, 94, 0.65)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(cx - lineSpan * 0.65, bannerY + 44);
  ctx.lineTo(cx + lineSpan * 0.65, bannerY + 44);
  ctx.stroke();

  ctx.restore();
}

function renderGhostPathOverlay(
  ctx: CanvasRenderingContext2D,
  ghostPath: GhostPathSample[],
  time: number
): void {
  if (ghostPath.length < 2) return;

  ctx.save();

  // 1. Draw glowing spectral trajectory spline of the last 5.0 seconds before death
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (let i = 0; i < ghostPath.length - 1; i++) {
    const a = ghostPath[i];
    const b = ghostPath[i + 1];
    const ratio = i / Math.max(1, ghostPath.length - 1); // 0 = -5s ago, 1 = 0s death

    ctx.save();
    ctx.strokeStyle =
      b.event === 'HURT' || b.event === 'FATAL'
        ? '#f43f5e'
        : b.dashing
        ? '#38bdf8'
        : ratio > 0.75
        ? '#c084fc'
        : '#38bdf8';
    ctx.globalAlpha = 0.25 + ratio * 0.6;
    ctx.lineWidth = 2.5 + ratio * 3;
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = 10;

    ctx.beginPath();
    ctx.moveTo(a.x + a.w * 0.5, a.y + a.h * 0.5);
    ctx.lineTo(b.x + b.w * 0.5, b.y + b.h * 0.5);
    ctx.stroke();
    ctx.restore();
  }

  // 2. Draw breadcrumb time-markers and key action callouts (JUMP, DASH, HIT, FATAL)
  for (let i = 0; i < ghostPath.length; i++) {
    const pt = ghostPath[i];
    const cx = pt.x + pt.w * 0.5;
    const cy = pt.y + pt.h * 0.5;
    const isStart = i === 0;
    const isFatal = i === ghostPath.length - 1;

    if (isStart || isFatal || pt.event !== 'NONE' || i % 6 === 0) {
      ctx.save();
      const dotColor = isFatal
        ? '#f43f5e'
        : pt.event === 'HURT'
        ? '#fb7185'
        : pt.event === 'DASH'
        ? '#38bdf8'
        : pt.event === 'JUMP'
        ? '#fde047'
        : '#a855f7';

      ctx.fillStyle = dotColor;
      ctx.shadowColor = dotColor;
      ctx.shadowBlur = isFatal ? 16 : 8;
      ctx.beginPath();
      ctx.arc(cx, cy, isFatal ? 6.5 : pt.event !== 'NONE' ? 4.5 : 2.8, 0, Math.PI * 2);
      ctx.fill();

      if (isStart || isFatal || pt.event === 'JUMP' || pt.event === 'DASH' || pt.event === 'HURT') {
        ctx.shadowBlur = 0;
        ctx.font = '700 9px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = isFatal ? '#fda4af' : '#e2e8f0';
        const tagText = isFatal
          ? 'FATAL (0.0s)'
          : isStart
          ? '-5.0s START'
          : `${pt.event} (${pt.timeOffset.toFixed(1)}s)`;
        ctx.fillText(tagText, cx, cy - 12);
      }
      ctx.restore();
    }
  }

  // 3. Animate a looping Spectral Ghost Player replaying the final 5 seconds of movement
  const loopDuration = 5.0;
  const playheadTime = -5.0 + (time % loopDuration); // -5.0s to 0.0s
  let activeSample = ghostPath[0];
  for (let i = 0; i < ghostPath.length; i++) {
    if (ghostPath[i].timeOffset <= playheadTime) {
      activeSample = ghostPath[i];
    } else {
      break;
    }
  }

  if (activeSample) {
    const gx = activeSample.x + activeSample.w * 0.5;
    const gBottom = activeSample.y + activeSample.h;
    const spriteCanvas = characterSprites.getFrame(
      !activeSample.grounded ? 'JUMP' : activeSample.dashing ? 'RUN' : 'WALK',
      Math.floor(time * 8) % 5
    );

    ctx.save();
    ctx.globalAlpha = 0.68;
    ctx.translate(gx, gBottom);
    ctx.scale(activeSample.facing, 1);
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 16;

    if (spriteCanvas) {
      const targetH = activeSample.h * 1.18;
      const aspect = spriteCanvas.width / Math.max(1, spriteCanvas.height);
      const targetW = targetH * aspect;
      ctx.drawImage(spriteCanvas, -targetW * 0.5, -targetH + 4, targetW, targetH);
    } else {
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(-12, -activeSample.h, 24, activeSample.h);
    }

    // Spectral echo ring around the replaying ghost
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(0, -activeSample.h * 0.5, 24, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Floating timestamp above the replaying ghost
    ctx.save();
    ctx.fillStyle = '#bae6fd';
    ctx.font = '700 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(
      `GHOST REPLAY · ${activeSample.timeOffset.toFixed(1)}s`,
      gx,
      activeSample.y - 16
    );
    ctx.restore();
  }

  ctx.restore();
}


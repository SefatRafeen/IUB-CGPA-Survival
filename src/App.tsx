import React, { useCallback, useEffect, useRef, useState } from 'react';
import { hapticService } from './audio/HapticService';
import { soundEngine } from './audio/SoundEngine';
import { GameEngine, InputActions } from './game/GameEngine';
import { imagePreloader } from './game/SpriteLoader';
import { usePWAInstall } from './pwa/usePWAInstall';
import {
  GameScreenState,
  GhostPathSample,
  HudSnapshot,
  LevelId,
  POWER_UP_CATALOG,
} from './types/game';

const UNLOCKED_LEVEL_STORAGE_KEY = 'iub_cgpa_unlocked_level';

const INITIAL_HUD: HudSnapshot = {
  hp: 100,
  maxHp: 100,
  stamina: 100,
  maxStamina: 100,
  cgpa: 3.5,
  researchMomentum: 0,
  comboCount: 0,
  level: 1,
  levelName: 'Floor 1 · The Ruined Cafeteria',
  hasAssignmentKey: false,
  hasBonusMarkShield: false,
  abilitiesSilenced: false,
  inventory: ['CHA_ESPRESSO', 'BONUS_MARK', 'FRIENDS_NOTES'],
  activeBuffs: [],
  boss: null,
  bossIntro: null,
  cgpaDifficulty: {
    enemyHpMultiplier: 1.32,
    enemySpawnRateMultiplier: 1.56,
    hazardFrequencyMultiplier: 0.9,
    regimeLabel: "DEAN'S LIST PRESSURE (High Enemy HP & Spawn)",
  },
  elapsedSeconds: 0,
  notification: null,
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);

  const {
    isInstallable,
    isInstalled,
    isIOS,
    isAndroid,
    isInIframe,
    isOnline,
    offlineReady,
    promptNativeInstall,
    downloadStandaloneGamePackage,
    downloadAndroidApkManifest,
  } = usePWAInstall();

  const [screenState, setScreenState] = useState<GameScreenState>('TITLE');
  const [highestUnlockedLevel, setHighestUnlockedLevel] = useState<LevelId>(() => {
    try {
      const saved = window.localStorage.getItem(UNLOCKED_LEVEL_STORAGE_KEY);
      if (saved === '2') return 2;
      if (saved === '3') return 3;
    } catch {
      // Ignore storage errors
    }
    return 1;
  });
  const [selectedStartLevel, setSelectedStartLevel] = useState<LevelId>(1);
  const [showHowToPlay, setShowHowToPlay] = useState<boolean>(false);
  const [showInstallModal, setShowInstallModal] = useState<boolean>(false);
  const [copiedUrl, setCopiedUrl] = useState<boolean>(false);
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);
  const [assetsPreloaded, setAssetsPreloaded] = useState<boolean>(() =>
    imagePreloader.isReady()
  );
  const [preloadProgress, setPreloadProgress] = useState<{ loaded: number; total: number }>(() =>
    imagePreloader.getProgress()
  );

  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [hapticsEnabled, setHapticsEnabled] = useState<boolean>(() =>
    hapticService.isEnabled()
  );
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [orientationLayout, setOrientationLayout] = useState<
    'portrait' | 'landscape-compact' | 'landscape'
  >(() => {
    if (typeof window === 'undefined') return 'landscape';
    if (window.innerHeight > window.innerWidth) return 'portrait';
    return window.innerHeight < 460 ? 'landscape-compact' : 'landscape';
  });
  const [showTouchControls, setShowTouchControls] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return (
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      window.innerWidth <= 960
    );
  });

  // Visual state for virtual D-Pad feedback on mobile
  const [dpadVisual, setDpadVisual] = useState<{ left: boolean; right: boolean }>({
    left: false,
    right: false,
  });

  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [victoryStats, setVictoryStats] = useState<{ cgpa: number; time: number }>({
    cgpa: 3.5,
    time: 0,
  });
  const [gameOverReason, setGameOverReason] = useState<string>('CGPA Dropped to 0.00');
  const [ghostPathSamples, setGhostPathSamples] = useState<GhostPathSample[]>([]);
  const [inspectGhostWorld, setInspectGhostWorld] = useState<boolean>(false);

  // Continuous held inputs & edge-triggered justPressed inputs
  const heldKeysRef = useRef<{ left: boolean; right: boolean }>({ left: false, right: false });
  const touchDirRef = useRef<{ left: boolean; right: boolean }>({ left: false, right: false });
  const dpadPointerIdRef = useRef<number | null>(null);
  const dpadRectRef = useRef<DOMRect | null>(null);

  const edgeQueueRef = useRef<{
    jump: boolean;
    melee: boolean;
    ranged: boolean;
    dash: boolean;
    slot1: boolean;
    slot2: boolean;
    slot3: boolean;
  }>({
    jump: false,
    melee: false,
    ranged: false,
    dash: false,
    slot1: false,
    slot2: false,
    slot3: false,
  });

  // Handle portrait-to-landscape transitions, fullscreen state & high-DPI canvas sizing
  useEffect(() => {
    let lastIsPortrait = window.innerHeight > window.innerWidth;
    let settleTimer: number | null = null;

    const resetTouchStateOnRotation = () => {
      dpadRectRef.current = null;
      dpadPointerIdRef.current = null;
      touchDirRef.current.left = false;
      touchDirRef.current.right = false;
      setDpadVisual({ left: false, right: false });
    };

    const updateViewport = () => {
      const vv = window.visualViewport;
      const w = Math.round(vv ? vv.width : window.innerWidth);
      const h = Math.round(vv ? vv.height : window.innerHeight);
      const nowPortrait = h > w;

      if (nowPortrait !== lastIsPortrait) {
        lastIsPortrait = nowPortrait;
        resetTouchStateOnRotation();
      }

      if (nowPortrait) {
        setOrientationLayout('portrait');
      } else if (h < 460) {
        setOrientationLayout('landscape-compact');
      } else {
        setOrientationLayout('landscape');
      }

      if (w <= 960 || 'ontouchstart' in window || navigator.maxTouchPoints > 0) {
        setShowTouchControls(true);
      }

      const canvas = canvasRef.current;
      if (canvas) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
      }
    };

    const onOrientationChange = () => {
      resetTouchStateOnRotation();
      updateViewport();
      if (settleTimer !== null) window.clearTimeout(settleTimer);
      // Mobile browsers often finish updating innerWidth/innerHeight ~120ms after orientationchange
      settleTimer = window.setTimeout(updateViewport, 120);
    };

    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
      updateViewport();
    };

    updateViewport();
    window.addEventListener('resize', updateViewport);
    window.addEventListener('orientationchange', onOrientationChange);
    window.visualViewport?.addEventListener('resize', updateViewport);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      if (settleTimer !== null) window.clearTimeout(settleTimer);
      window.removeEventListener('resize', updateViewport);
      window.removeEventListener('orientationchange', onOrientationChange);
      window.visualViewport?.removeEventListener('resize', updateViewport);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, []);

  const unlockLevel = useCallback((unlockedLevel: LevelId) => {
    setHighestUnlockedLevel((prev) => {
      const next = (unlockedLevel > prev ? unlockedLevel : prev) as LevelId;
      try {
        window.localStorage.setItem(UNLOCKED_LEVEL_STORAGE_KEY, String(next));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
    setSelectedStartLevel(unlockedLevel);
  }, []);

  // Preload & verify all sprite sheets and landscape backdrops, and initialize GameEngine
  useEffect(() => {
    void imagePreloader
      .preloadAll((loaded, total) => {
        setPreloadProgress({ loaded, total });
      })
      .then(() => {
        setAssetsPreloaded(true);
      });

    const engine = new GameEngine(
      1,
      (snapshot) => setHud(snapshot),
      (finalCgpa, elapsedSeconds) => {
        setVictoryStats({ cgpa: finalCgpa, time: elapsedSeconds });
        setScreenState('VICTORY');
      },
      (reason) => {
        setGameOverReason(reason);
        setGhostPathSamples(engine.getDeathGhostPath());
        setInspectGhostWorld(false);
        setScreenState('GAME_OVER');
      },
      (unlockedLevel) => {
        unlockLevel(unlockedLevel);
      }
    );
    engineRef.current = engine;
    return () => {
      soundEngine.stopMusic();
    };
  }, [unlockLevel]);

  const enterFullscreenLandscape = useCallback(async () => {
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
      const scr = window.screen as Screen & {
        orientation?: { lock?: (mode: string) => Promise<void> };
      };
      if (scr.orientation && scr.orientation.lock) {
        await scr.orientation.lock('landscape').catch(() => {});
      }
    } catch {
      // Ignore if blocked by iframe/browser policy
    }
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await enterFullscreenLandscape();
      }
    } catch {
      // Ignore
    }
  }, [enterFullscreenLandscape]);

  const startGame = useCallback(
    async (level: LevelId) => {
      const playableLevel = (level <= highestUnlockedLevel ? level : highestUnlockedLevel) as LevelId;
      soundEngine.unlock();
      hapticService.uiTap();
      if (!imagePreloader.isReady()) {
        await imagePreloader.preloadAll((loaded, total) => {
          setPreloadProgress({ loaded, total });
        });
        setAssetsPreloaded(true);
      }
      if (engineRef.current) {
        engineRef.current.loadLevel(playableLevel, true);
      }
      setShowHowToPlay(false);
      setShowInstallModal(false);
      setScreenState('PLAYING');
    },
    [highestUnlockedLevel]
  );

  // Handle "Download / Install APK" button click
  const handleInstallOrDownloadApk = useCallback(async () => {
    soundEngine.unlock();
    hapticService.uiTap();
    if (isInstallable) {
      const accepted = await promptNativeInstall();
      if (accepted) return;
    }
    setShowInstallModal(true);
  }, [isInstallable, promptNativeInstall]);

  // Keyboard bindings & window blur safety
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const code = e.code;

      if (code === 'Escape' || code === 'KeyP') {
        if (showHowToPlay) {
          setShowHowToPlay(false);
          return;
        }
        if (showInstallModal) {
          setShowInstallModal(false);
          return;
        }
        setScreenState((prev) => {
          if (prev === 'PLAYING') return 'PAUSED';
          if (prev === 'PAUSED') return 'PLAYING';
          return prev;
        });
        return;
      }

      if (
        screenState === 'TITLE' &&
        (code === 'Enter' || code === 'Space') &&
        !showHowToPlay &&
        !showInstallModal
      ) {
        e.preventDefault();
        startGame(selectedStartLevel);
        return;
      }

      if (screenState !== 'PLAYING') return;

      if (code === 'KeyA' || code === 'ArrowLeft') {
        heldKeysRef.current.left = true;
      } else if (code === 'KeyD' || code === 'ArrowRight') {
        heldKeysRef.current.right = true;
      } else if (code === 'KeyW' || code === 'Space' || code === 'ArrowUp') {
        e.preventDefault();
        if (!e.repeat) edgeQueueRef.current.jump = true;
      } else if (code === 'KeyJ' || code === 'KeyZ') {
        if (!e.repeat) edgeQueueRef.current.melee = true;
      } else if (code === 'KeyK' || code === 'KeyX') {
        if (!e.repeat) edgeQueueRef.current.ranged = true;
      } else if (code === 'ShiftLeft' || code === 'ShiftRight') {
        e.preventDefault();
        if (!e.repeat) edgeQueueRef.current.dash = true;
      } else if (code === 'Digit1') {
        if (!e.repeat) edgeQueueRef.current.slot1 = true;
      } else if (code === 'Digit2') {
        if (!e.repeat) edgeQueueRef.current.slot2 = true;
      } else if (code === 'Digit3') {
        if (!e.repeat) edgeQueueRef.current.slot3 = true;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const code = e.code;
      if (code === 'KeyA' || code === 'ArrowLeft') {
        heldKeysRef.current.left = false;
      } else if (code === 'KeyD' || code === 'ArrowRight') {
        heldKeysRef.current.right = false;
      }
    };

    const onBlur = () => {
      heldKeysRef.current.left = false;
      heldKeysRef.current.right = false;
      touchDirRef.current.left = false;
      touchDirRef.current.right = false;
      setDpadVisual({ left: false, right: false });
      dpadPointerIdRef.current = null;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [screenState, selectedStartLevel, showHowToPlay, showInstallModal, startGame]);

  // Main 60fps requestAnimationFrame loop with responsive mobile world-scale zoom
  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();

    const frame = (now: number) => {
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;

      const canvas = canvasRef.current;
      const engine = engineRef.current;
      if (canvas && engine) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          const rawViewW = canvas.width / dpr;
          const rawViewH = canvas.height / dpr;

          // Responsive world zoom for both Portrait and Landscape mobile screens
          const isPortraitAspect = rawViewH > rawViewW;
          const worldScale = isPortraitAspect
            ? Math.min(1, Math.max(0.55, rawViewW / 620))
            : Math.min(1, Math.min(rawViewW / 820, rawViewH / 500));
          const logicalW = rawViewW / worldScale;
          const logicalH = rawViewH / worldScale;

          if (screenState === 'PLAYING') {
            const input: InputActions = {
              left: heldKeysRef.current.left || touchDirRef.current.left,
              right: heldKeysRef.current.right || touchDirRef.current.right,
              jumpPressed: edgeQueueRef.current.jump,
              meleePressed: edgeQueueRef.current.melee,
              rangedPressed: edgeQueueRef.current.ranged,
              dashPressed: edgeQueueRef.current.dash,
              slot1Pressed: edgeQueueRef.current.slot1,
              slot2Pressed: edgeQueueRef.current.slot2,
              slot3Pressed: edgeQueueRef.current.slot3,
            };

            // Clear edge-triggered queue
            edgeQueueRef.current.jump = false;
            edgeQueueRef.current.melee = false;
            edgeQueueRef.current.ranged = false;
            edgeQueueRef.current.dash = false;
            edgeQueueRef.current.slot1 = false;
            edgeQueueRef.current.slot2 = false;
            edgeQueueRef.current.slot3 = false;

            engine.step(rawDt, input, logicalW, logicalH);
          } else if (screenState === 'GAME_OVER') {
            engine.stepGhostReplay(rawDt, logicalW, logicalH);
          }

          ctx.save();
          ctx.scale(dpr * worldScale, dpr * worldScale);
          engine.render(ctx, logicalW, logicalH);
          ctx.restore();
        }
      }

      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [screenState]);

  const toggleMute = useCallback(() => {
    soundEngine.unlock();
    hapticService.uiTap();
    const next = !isMuted;
    setIsMuted(next);
    soundEngine.setMuted(next);
  }, [isMuted]);

  const toggleHaptics = useCallback(() => {
    soundEngine.unlock();
    const next = hapticService.toggle();
    setHapticsEnabled(next);
  }, []);

  // Multi-touch virtual D-Pad handlers (supports smooth thumb sliding between Left and Right without lifting)
  const updateDpadFromClientX = (clientX: number) => {
    const rect = dpadRectRef.current;
    if (!rect) return;
    const centerX = rect.left + rect.width * 0.5;
    const deadzone = 5;
    const isLeft = clientX < centerX - deadzone;
    const isRight = clientX > centerX + deadzone;
    if (isLeft !== touchDirRef.current.left || isRight !== touchDirRef.current.right) {
      if (isLeft || isRight) hapticService.uiTap();
    }
    touchDirRef.current.left = isLeft;
    touchDirRef.current.right = isRight;
    setDpadVisual({ left: isLeft, right: isRight });
  };

  const handleDpadPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    soundEngine.unlock();
    e.currentTarget.setPointerCapture(e.pointerId);
    dpadPointerIdRef.current = e.pointerId;
    dpadRectRef.current = e.currentTarget.getBoundingClientRect();
    updateDpadFromClientX(e.clientX);
  };

  const handleDpadPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dpadPointerIdRef.current !== e.pointerId) return;
    updateDpadFromClientX(e.clientX);
  };

  const handleDpadPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dpadPointerIdRef.current !== e.pointerId) return;
    dpadPointerIdRef.current = null;
    touchDirRef.current.left = false;
    touchDirRef.current.right = false;
    setDpadVisual({ left: false, right: false });
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const copyInstallUrl = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedUrl(true);
      window.setTimeout(() => setCopiedUrl(false), 2500);
    } catch {
      setCopiedUrl(false);
    }
  };

  return (
    <div className="relative w-screen h-dvh overflow-hidden bg-[#09080c] text-[#ece8f4] font-sans select-none">
      {/* High-DPI 60fps Game World Canvas */}
      <canvas ref={canvasRef} className="block w-full h-full" />

      {/* Offline Connectivity Banner */}
      {!isOnline && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-50 bg-amber-950/95 border border-amber-500/60 px-3 py-1 rounded text-[11px] font-mono text-amber-200">
          Offline Mode Active · Running from Cached Game Package
        </div>
      )}

      {/* =====================================================================
          IN-GAME HUD (Portrait & Landscape Adaptive Perimeter Overlay)
         ===================================================================== */}
      {screenState !== 'TITLE' && (
        <div className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between safe-top safe-bottom safe-left safe-right">
          {/* Top Perimeter Section */}
          <div className="flex flex-col gap-1.5 px-2 sm:px-4 pt-1.5 sm:pt-2 w-full">
            {/* Row 1: Left Vessel/Stats Cluster · Center Boss Bar (Desktop) · Right Utility & Power-Up Slots */}
            <div className="flex items-start justify-between gap-1.5 sm:gap-3 w-full">
              {/* Top-Left: HP, Stamina, Research Momentum & Live CGPA Meter */}
              <div className="flex flex-col gap-1 min-w-0">
                <div className="flex items-center gap-1.5 sm:gap-3 bg-[#0e0c14]/90 border border-slate-800/80 px-2 sm:px-3.5 py-1.5 sm:py-2 rounded-lg">
                  {/* Hollow-Knight-inspired Soul/Academic Vessel Crest SVG (shown on sm+ screens to save width in Portrait) */}
                  <svg
                    className="hidden sm:block w-9 h-9 shrink-0 text-slate-100"
                    viewBox="0 0 44 44"
                    fill="none"
                  >
                    <path
                      d="M22 4C13 4 7 12 7 22C7 31 13 39 22 40C31 39 37 31 37 22C37 12 31 4 22 4Z"
                      stroke="currentColor"
                      strokeWidth="2"
                      fill="#181424"
                    />
                    <path
                      d="M12 10L7 3M32 10L37 3"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                    />
                    <ellipse cx="16.5" cy="23" rx="3" ry="4.5" fill="#09080c" />
                    <ellipse cx="27.5" cy="23" rx="3" ry="4.5" fill="#09080c" />
                  </svg>

                  <div className="flex flex-col gap-0.5 sm:gap-1 w-[96px] sm:min-w-[165px]">
                    {/* HP Bar */}
                    <div className="flex items-center justify-between text-[9px] sm:text-xs font-mono tabular-nums">
                      <span className="text-slate-300 font-semibold">HP</span>
                      <span className="text-rose-300 font-bold">
                        {hud.hp}/{hud.maxHp}
                      </span>
                    </div>
                    <div className="w-full h-1.5 sm:h-2 bg-slate-900 rounded overflow-hidden border border-slate-800">
                      <div
                        className="h-full bg-rose-500 transition-transform duration-100 origin-left"
                        style={{ transform: `scaleX(${Math.max(0, hud.hp / hud.maxHp)})` }}
                      />
                    </div>

                    {/* Stamina Bar */}
                    <div className="flex items-center justify-between text-[9px] sm:text-xs font-mono tabular-nums">
                      <span className="text-slate-400">STM</span>
                      <span className="text-sky-300">{hud.stamina}%</span>
                    </div>
                    <div className="w-full h-1 sm:h-1.5 bg-slate-900 rounded overflow-hidden border border-slate-800">
                      <div
                        className="h-full bg-sky-400 transition-transform duration-100 origin-left"
                        style={{ transform: `scaleX(${Math.max(0, hud.stamina / hud.maxStamina)})` }}
                      />
                    </div>

                    {/* Research Momentum Meter & Melee Combo Readout */}
                    <div className="flex items-center justify-between text-[8px] sm:text-[11px] font-mono tabular-nums pt-0.5">
                      <span className="text-purple-300 font-semibold truncate">
                        RSRCH{hud.comboCount > 0 ? ` ${hud.comboCount}x` : ''}
                      </span>
                      <span
                        className={
                          hud.researchMomentum >= 80
                            ? 'text-amber-300 font-bold'
                            : hud.researchMomentum >= 40
                            ? 'text-purple-300 font-semibold'
                            : 'text-slate-400'
                        }
                      >
                        {(1 + hud.researchMomentum / 100).toFixed(1)}x
                      </span>
                    </div>
                    <div className="w-full h-1 sm:h-1.5 bg-slate-900 rounded overflow-hidden border border-slate-800">
                      <div
                        className={`h-full transition-transform duration-100 origin-left ${
                          hud.researchMomentum >= 80
                            ? 'bg-amber-400'
                            : hud.researchMomentum >= 40
                            ? 'bg-purple-400'
                            : 'bg-cyan-400'
                        }`}
                        style={{ transform: `scaleX(${Math.max(0, hud.researchMomentum / 100)})` }}
                      />
                    </div>
                  </div>

                  {/* Live CGPA Readout */}
                  <div className="pl-1.5 sm:pl-3 border-l border-slate-800 flex flex-col items-end font-mono tabular-nums shrink-0">
                    <span className="text-[8px] sm:text-[11px] text-slate-400">CGPA</span>
                    <span
                      className={`text-base sm:text-2xl font-bold leading-none ${
                        hud.cgpa >= 3.0
                          ? 'text-emerald-400'
                          : hud.cgpa >= 2.0
                          ? 'text-amber-400'
                          : 'text-rose-500'
                      }`}
                    >
                      {hud.cgpa.toFixed(2)}
                    </span>
                    <span className="hidden sm:inline text-[10px] text-slate-400 mt-0.5">
                      {hud.cgpa >= 3.5 ? "DEAN'S LIST" : hud.cgpa >= 2.0 ? 'GOOD STANDING' : 'PROBATION'}
                    </span>
                  </div>
                </div>

                {/* Unboxed Status Metadata, Dynamic CGPA Difficulty Regime & Active Power-Up Timers */}
                <div className="flex flex-wrap items-center gap-1 text-[9px] sm:text-xs font-mono tabular-nums text-slate-300 px-0.5">
                  <span
                    className={
                      hud.cgpa >= 3.25
                        ? 'text-purple-300 font-semibold'
                        : hud.cgpa < 2.5
                        ? 'text-amber-300 font-semibold'
                        : 'text-slate-400'
                    }
                  >
                    {hud.cgpa >= 3.25
                      ? `Enemies ${hud.cgpaDifficulty.enemyHpMultiplier.toFixed(2)}x HP · ${hud.cgpaDifficulty.enemySpawnRateMultiplier.toFixed(2)}x Spawn`
                      : hud.cgpa < 2.5
                      ? `Probation Hazards ${hud.cgpaDifficulty.hazardFrequencyMultiplier.toFixed(2)}x Freq`
                      : `Balanced Standing (${hud.cgpaDifficulty.enemyHpMultiplier.toFixed(2)}x HP)`}
                  </span>
                  {hud.hasAssignmentKey && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-amber-300 font-semibold">Key Held</span>
                    </>
                  )}
                  {hud.hasBonusMarkShield && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-amber-400 font-semibold">Bonus Ward</span>
                    </>
                  )}
                  {hud.abilitiesSilenced && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-rose-400 font-semibold">Silenced</span>
                    </>
                  )}
                  {hud.activeBuffs.map((buff) => (
                    <span key={buff.type} className="text-sky-300">
                      · {buff.label} ({buff.remaining.toFixed(1)}s)
                    </span>
                  ))}
                </div>
              </div>

              {/* Top-Center: Active Boss Health Bar (Desktop / Wide Screens) */}
              {hud.boss && hud.boss.active && (
                <div className="hidden md:flex flex-col items-center w-full max-w-md bg-[#0e0c14]/90 border border-rose-900/70 px-4 py-2 rounded-lg">
                  <div className="flex items-center justify-between w-full text-xs font-mono tabular-nums mb-1">
                    <span className="font-display font-bold tracking-wider text-rose-200 truncate">
                      {hud.boss.name} {hud.boss.phase === 2 ? '· P2' : ''}
                    </span>
                    <span className="text-rose-400 font-bold shrink-0 ml-2">
                      {hud.boss.hp}/{hud.boss.maxHp}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-950 rounded overflow-hidden border border-rose-950">
                    <div
                      className="h-full bg-rose-600 transition-transform duration-100 origin-left"
                      style={{ transform: `scaleX(${Math.max(0, hud.boss.hp / hud.boss.maxHp)})` }}
                    />
                  </div>
                  <span className="text-[11px] text-slate-400 mt-0.5">
                    {hud.boss.subtitle}
                  </span>
                </div>
              )}

              {/* Top-Right: Floor Indicator, Utility Controls & Consumable Slots (1/2/3) */}
              <div className="flex flex-col items-end gap-1 sm:gap-1.5 shrink-0">
                <div className="pointer-events-auto flex items-center gap-1 sm:gap-1.5 bg-[#0e0c14]/90 border border-slate-800/80 px-1.5 sm:px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-mono tabular-nums">
                  <span className="hidden lg:inline text-slate-200 font-semibold whitespace-nowrap">
                    {hud.levelName}
                  </span>
                  <span className="lg:hidden text-slate-200 font-semibold whitespace-nowrap">
                    F{hud.level}
                  </span>
                  <span aria-hidden="true" className="text-slate-600">·</span>
                  <span className="text-slate-400">{formatTime(hud.elapsedSeconds)}</span>
                  <button
                    type="button"
                    onClick={toggleFullscreen}
                    className="px-1.5 sm:px-2 py-0.5 sm:py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {isFullscreen ? 'Exit' : 'Full'}
                  </button>
                  <button
                    type="button"
                    onClick={toggleHaptics}
                    title="Toggle Physical Haptic Vibration"
                    className={`hidden sm:inline-flex px-1.5 sm:px-2 py-0.5 sm:py-1 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      hapticsEnabled
                        ? 'bg-purple-950/90 border border-purple-500/50 text-purple-200'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {hapticsEnabled ? 'Vib:On' : 'Vib:Off'}
                  </button>
                  <button
                    type="button"
                    onClick={toggleMute}
                    className="px-1.5 sm:px-2 py-0.5 sm:py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {isMuted ? 'Unmute' : 'Mute'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      hapticService.uiTap();
                      setScreenState((s) => (s === 'PLAYING' ? 'PAUSED' : 'PLAYING'));
                    }}
                    className="px-1.5 sm:px-2 py-0.5 sm:py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Pause
                  </button>
                </div>

                {/* Stored Consumable Power-Up Slots (Keys 1 / 2 / 3 or Tap) */}
                <div className="pointer-events-auto flex items-center gap-1 sm:gap-1.5">
                  {hud.inventory.map((itemType, idx) => {
                    const meta = itemType ? POWER_UP_CATALOG[itemType] : null;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          soundEngine.unlock();
                          hapticService.uiTap();
                          engineRef.current?.useInventorySlot(idx);
                        }}
                        disabled={!meta}
                        className={`w-[54px] sm:w-auto sm:min-w-[84px] min-h-[36px] sm:min-h-[42px] px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-lg border text-left font-mono transition-colors ${
                          meta
                            ? 'bg-[#12101b]/90 border-slate-700 hover:border-amber-400 active:scale-95 text-slate-100 cursor-pointer'
                            : 'bg-[#0b0a10]/70 border-slate-800/60 text-slate-600 cursor-default'
                        }`}
                      >
                        <div className="text-[8px] sm:text-[10px] text-slate-400 leading-tight">
                          [{idx + 1}]
                        </div>
                        <div
                          className="text-[9px] sm:text-xs font-bold truncate leading-tight"
                          style={{ color: meta ? meta.color : undefined }}
                        >
                          {meta ? meta.shortName : 'Empty'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Row 2 (Portrait / Mobile): Full-Width Boss Health Bar so it never clips top buttons */}
            {hud.boss && hud.boss.active && (
              <div className="flex md:hidden flex-col items-center w-full bg-[#0e0c14]/90 border border-rose-900/70 px-3 py-1 rounded-lg">
                <div className="flex items-center justify-between w-full text-[10px] font-mono tabular-nums mb-0.5">
                  <span className="font-display font-bold tracking-wider text-rose-200 truncate">
                    {hud.boss.name} {hud.boss.phase === 2 ? '· PHASE 2' : ''}
                  </span>
                  <span className="text-rose-400 font-bold shrink-0 ml-2">
                    {hud.boss.hp}/{hud.boss.maxHp}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-slate-950 rounded overflow-hidden border border-rose-950">
                  <div
                    className="h-full bg-rose-600 transition-transform duration-100 origin-left"
                    style={{ transform: `scaleX(${Math.max(0, hud.boss.hp / hud.boss.maxHp)})` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Center Event Banner Notification */}
          {hud.notification && (
            <div className="self-center bg-[#0e0c14]/95 border border-amber-500/40 px-3 py-1 rounded text-[10px] sm:text-xs font-mono tracking-wide text-amber-200 shadow-lg max-w-[92vw] text-center truncate">
              {hud.notification}
            </div>
          )}

          {/* Bottom Corner-Anchored Touch Controls (2x2 Grid with Large Hit Targets & Orientation-Safe Container) */}
          {showTouchControls && screenState === 'PLAYING' && (
            <div
              data-orientation={orientationLayout}
              className={`pointer-events-none w-full flex items-end justify-between gap-3 ${
                orientationLayout === 'landscape-compact'
                  ? 'px-2.5 pb-1.5'
                  : 'px-2.5 sm:px-5 pb-2.5 sm:pb-4'
              }`}
            >
              {/* Bottom-Left Corner: Anchored Dual-Zone Sliding D-Pad with Large Hit Targets */}
              <div
                onPointerDown={handleDpadPointerDown}
                onPointerMove={handleDpadPointerMove}
                onPointerUp={handleDpadPointerUp}
                onPointerCancel={handleDpadPointerUp}
                className="pointer-events-auto grid grid-cols-2 gap-1.5 p-1.5 rounded-2xl bg-[#0e0c14]/90 border border-slate-700/85 touch-none shadow-xl shrink-0"
              >
                <div
                  className={`flex flex-col items-center justify-center rounded-xl font-mono font-bold transition-transform ${
                    orientationLayout === 'landscape-compact'
                      ? 'w-[62px] h-[56px] text-xs'
                      : 'w-[66px] h-[64px] sm:w-[76px] sm:h-[70px] text-xs sm:text-sm'
                  } ${
                    dpadVisual.left
                      ? 'bg-rose-600 text-white scale-95 border border-rose-300/80'
                      : 'bg-slate-800/95 text-slate-100 border border-slate-700/70'
                  }`}
                >
                  <span>◀ L</span>
                  <span className="text-[8px] font-normal text-slate-300/80 mt-0.5">MOVE</span>
                </div>
                <div
                  className={`flex flex-col items-center justify-center rounded-xl font-mono font-bold transition-transform ${
                    orientationLayout === 'landscape-compact'
                      ? 'w-[62px] h-[56px] text-xs'
                      : 'w-[66px] h-[64px] sm:w-[76px] sm:h-[70px] text-xs sm:text-sm'
                  } ${
                    dpadVisual.right
                      ? 'bg-rose-600 text-white scale-95 border border-rose-300/80'
                      : 'bg-slate-800/95 text-slate-100 border border-slate-700/70'
                  }`}
                >
                  <span>R ▶</span>
                  <span className="text-[8px] font-normal text-slate-300/80 mt-0.5">SLIDE</span>
                </div>
              </div>

              {/* Bottom-Right Corner: Compact 2x2 Action Grid with Large Hit Targets */}
              <div className="pointer-events-auto grid grid-cols-2 gap-1.5 sm:gap-2 p-1.5 rounded-2xl bg-[#0e0c14]/90 border border-slate-700/85 touch-none shadow-xl shrink-0">
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    soundEngine.unlock();
                    hapticService.uiTap();
                    edgeQueueRef.current.dash = true;
                  }}
                  className={`flex items-center justify-center rounded-xl bg-sky-950/95 border border-sky-400/80 text-sky-100 font-mono font-bold active:scale-90 transition-transform shadow-md ${
                    orientationLayout === 'landscape-compact'
                      ? 'w-[62px] h-[44px] text-[11px]'
                      : 'w-[66px] h-[52px] sm:w-[76px] sm:h-[58px] text-xs'
                  }`}
                >
                  DASH
                </button>
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    soundEngine.unlock();
                    hapticService.uiTap();
                    edgeQueueRef.current.ranged = true;
                  }}
                  className={`flex items-center justify-center rounded-xl bg-amber-950/95 border border-amber-400/80 text-amber-100 font-mono font-bold active:scale-90 transition-transform shadow-md ${
                    orientationLayout === 'landscape-compact'
                      ? 'w-[62px] h-[44px] text-[11px]'
                      : 'w-[66px] h-[52px] sm:w-[76px] sm:h-[58px] text-xs'
                  }`}
                >
                  PAPER
                </button>
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    soundEngine.unlock();
                    hapticService.uiTap();
                    edgeQueueRef.current.melee = true;
                  }}
                  className={`flex items-center justify-center rounded-xl bg-rose-950/95 border border-rose-400/85 text-rose-100 font-mono font-bold active:scale-90 transition-transform shadow-md ${
                    orientationLayout === 'landscape-compact'
                      ? 'w-[62px] h-[46px] text-[11px]'
                      : 'w-[66px] h-[54px] sm:w-[76px] sm:h-[60px] text-xs'
                  }`}
                >
                  MELEE
                </button>
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    soundEngine.unlock();
                    hapticService.uiTap();
                    edgeQueueRef.current.jump = true;
                  }}
                  className={`flex items-center justify-center rounded-xl bg-slate-800/95 border border-slate-200/85 text-white font-mono font-bold active:scale-90 transition-transform shadow-md ${
                    orientationLayout === 'landscape-compact'
                      ? 'w-[62px] h-[46px] text-[11px]'
                      : 'w-[66px] h-[54px] sm:w-[76px] sm:h-[60px] text-xs'
                  }`}
                >
                  JUMP
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          TITLE SCREEN ("IUB: CGPA SURVIVAL" + Install APK CTA + Level Progression)
         ===================================================================== */}
      {screenState === 'TITLE' && (
        <div className="fixed inset-0 z-30 flex flex-col justify-between bg-gradient-to-t from-[#09080c] via-[#09080c]/75 to-[#09080c]/40 p-3.5 sm:p-8 md:p-12 safe-top safe-bottom overflow-y-auto">
          {/* Top Minimal Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-[10px] sm:text-xs text-slate-300 tracking-wider truncate">
              <span className="sm:hidden">IUB · POST-APOCALYPTIC ARCHIVE</span>
              <span className="hidden sm:inline">
                INDEPENDENT UNIVERSITY, BANGLADESH · POST-APOCALYPTIC ARCHIVE
              </span>
            </span>
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 ml-auto">
              {!isInstalled && (
                <button
                  type="button"
                  onClick={handleInstallOrDownloadApk}
                  className="px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-mono font-bold text-emerald-200 bg-emerald-950/90 border border-emerald-500/70 rounded-lg hover:bg-emerald-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Install APK
                </button>
              )}
              <button
                type="button"
                onClick={toggleHaptics}
                className={`px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-mono rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  hapticsEnabled
                    ? 'text-purple-200 bg-purple-950/80 border-purple-500/60 hover:bg-purple-900/80'
                    : 'text-slate-400 bg-slate-900/90 border-slate-700 hover:bg-slate-800'
                }`}
              >
                {hapticsEnabled ? 'Haptics: On' : 'Haptics: Off'}
              </button>
              <button
                type="button"
                onClick={toggleMute}
                className="px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-mono text-slate-200 bg-slate-900/90 border border-slate-700 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {isMuted ? 'Audio: Off' : 'Audio: On'}
              </button>
            </div>
          </div>

          {/* Center Hero Lockup with Bespoke Hollow-Knight Inspired Crest SVG */}
          <div className="my-auto flex flex-col items-center text-center max-w-2xl mx-auto py-2 w-full">
            <svg className="w-12 h-12 sm:w-20 sm:h-20 mb-1.5 sm:mb-2 text-slate-200" viewBox="0 0 80 80" fill="none">
              <path
                d="M40 8C24 8 14 22 14 40C14 55 25 68 40 72C55 68 66 55 66 40C66 22 56 8 40 8Z"
                stroke="currentColor"
                strokeWidth="2.5"
                fill="#120e1a"
              />
              <path d="M22 16L10 4M58 16L70 4" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              <ellipse cx="30" cy="42" rx="5.5" ry="8" fill="#09080c" />
              <ellipse cx="50" cy="42" rx="5.5" ry="8" fill="#09080c" />
              <path d="M26 60H54" stroke="#f43f5e" strokeWidth="2.5" strokeLinecap="round" />
            </svg>

            <h1 className="font-display text-2xl sm:text-5xl md:text-6xl font-extrabold tracking-wider text-white mb-1.5 text-balance">
              IUB: CGPA SURVIVAL
            </h1>
            <p className="text-xs sm:text-sm md:text-base text-slate-300 max-w-xl mb-3 sm:mb-5 px-1">
              Traverse the ruined red-brick halls, shattered spiral ramps, and flickering corridors of Independent University, Bangladesh. Defend your 3.50 CGPA across 3 floors and graduate.
            </p>

            {/* Level-by-Level Progression Select (Only Floor 1 unlocked initially; beat each floor to unlock the next) */}
            <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center justify-center w-full max-w-xs sm:max-w-none gap-1.5 sm:gap-2 p-1.5 bg-[#120f1a]/95 border border-slate-800 rounded-xl mb-2">
              {([1, 2, 3] as LevelId[]).map((lvl) => {
                const isUnlocked = lvl <= highestUnlockedLevel;
                const labels: Record<LevelId, string> = {
                  1: 'Floor 1 · Cafeteria (Syllabus)',
                  2: 'Floor 2 · Admin (Probation)',
                  3: 'Floor 3 · 10th Roof (Dismissal)',
                };
                const active = selectedStartLevel === lvl && isUnlocked;
                return (
                  <button
                    key={lvl}
                    type="button"
                    disabled={!isUnlocked}
                    onClick={() => {
                      if (!isUnlocked) return;
                      hapticService.uiTap();
                      setSelectedStartLevel(lvl);
                    }}
                    className={`flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-mono rounded-lg transition-colors ${
                      !isUnlocked
                        ? 'bg-slate-950/60 text-slate-500 border border-slate-800/60 cursor-not-allowed'
                        : active
                        ? 'bg-rose-600 text-white font-bold shadow-sm cursor-pointer'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/60 cursor-pointer'
                    }`}
                  >
                    {!isUnlocked && (
                      <svg
                        className="w-3.5 h-3.5 text-slate-500 shrink-0"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <rect x="5" y="11" width="14" height="10" rx="2" />
                        <path d="M8 11V7a4 4 0 018 0v4" />
                      </svg>
                    )}
                    <span>
                      {isUnlocked
                        ? labels[lvl]
                        : `${labels[lvl]} · Clear F${lvl - 1}`}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="text-[11px] font-mono text-slate-400 mb-3.5 sm:mb-5">
              Progression: Floor {highestUnlockedLevel} of 3 Unlocked · Defeat each floor&apos;s Boss to unlock the next floor
            </div>

            {/* Primary Start CTA, Download/Install APK Button & How to Play Modal Trigger */}
            <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center justify-center w-full max-w-xs sm:max-w-none gap-2.5 sm:gap-3">
              <button
                type="button"
                onClick={() => void startGame(selectedStartLevel)}
                className="w-full sm:w-auto px-6 py-3 text-xs sm:text-sm font-mono font-bold tracking-wider text-white bg-rose-600 hover:bg-rose-500 rounded-xl shadow-lg transition-transform active:scale-95 cursor-pointer"
              >
                {assetsPreloaded
                  ? `Start Semester (Floor ${selectedStartLevel})`
                  : `Preloading Sprites (${preloadProgress.loaded}/${preloadProgress.total})...`}
              </button>

              {!isInstalled && (
                <button
                  type="button"
                  onClick={handleInstallOrDownloadApk}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 text-xs sm:text-sm font-mono font-bold text-emerald-100 bg-emerald-700 hover:bg-emerald-600 border border-emerald-400/50 rounded-xl shadow-lg transition-transform active:scale-95 cursor-pointer"
                >
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V3" />
                  </svg>
                  Download / Install APK
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  hapticService.uiTap();
                  setShowHowToPlay(true);
                }}
                className="w-full sm:w-auto px-4 py-3 text-xs sm:text-sm font-mono font-semibold text-slate-200 bg-slate-900/90 hover:bg-slate-800 border border-slate-700 rounded-xl transition-colors cursor-pointer"
              >
                How to Play / Controls
              </button>
            </div>
          </div>

          {/* Bottom Flat Genre Control-Hint Line */}
          <div className="text-center text-[10px] sm:text-xs font-mono text-slate-400 pt-1">
            Touch D-Pad / A-D Move · JUMP / W-Space Double-Jump · MELEE / J-Z Lab Report · PAPER / K-X · DASH / Shift · Tap [1]/[2]/[3] Power-Ups
          </div>
        </div>
      )}

      {/* =====================================================================
          MOBILE APK & OFFLINE GAME INSTALLER MODAL
         ===================================================================== */}
      {showInstallModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
          <div className="w-full max-w-xl max-h-[90dvh] overflow-y-auto bg-[#12101b] border border-slate-700 rounded-2xl p-5 sm:p-6 text-left shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3.5 mb-4">
              <div>
                <h2 className="font-display text-xl sm:text-2xl font-bold text-white">
                  Install Game · Android APK & Mobile Package
                </h2>
                <p className="text-xs font-mono text-slate-400 mt-0.5">
                  Full Offline PWA WebAPK · Standalone Mobile Launcher · TWA APK Config
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowInstallModal(false)}
                className="px-3 py-1.5 text-xs font-mono bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg cursor-pointer shrink-0"
              >
                Close
              </button>
            </div>

            <div className="space-y-4 text-xs text-slate-300">
              {/* Option 1: Native Android WebAPK / Direct Install */}
              <div className="p-4 rounded-xl bg-[#0b0a10] border border-emerald-500/40">
                <div className="font-mono text-sm font-bold text-emerald-400 mb-1">
                  01. One-Tap Native Android WebAPK Install (Recommended)
                </div>
                <p className="text-slate-300 leading-relaxed mb-3">
                  Android Chrome & Edge automatically compile and install a signed native <strong>WebAPK</strong> directly to your phone&apos;s app drawer with full-screen landscape lock and 100% offline play.
                </p>

                {isInstallable ? (
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await promptNativeInstall();
                      if (ok) setShowInstallModal(false);
                    }}
                    className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-bold cursor-pointer"
                  >
                    Install Signed Android WebAPK Now
                  </button>
                ) : isIOS ? (
                  <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 font-mono">
                    On iPhone / iPad Safari: Tap the <strong>Share</strong> button in the browser bar, then tap <strong>Add to Home Screen</strong> to install the full-screen game app.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {isInIframe && (
                      <p className="text-amber-300 font-mono text-[11px]">
                        Note: You are currently viewing inside a preview frame. Open the direct app URL in Chrome on your Android phone to trigger the native WebAPK install prompt:
                      </p>
                    )}
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={typeof window !== 'undefined' ? window.location.href : ''}
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 font-mono text-xs text-slate-200"
                      />
                      <button
                        type="button"
                        onClick={copyInstallUrl}
                        className="px-3.5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-mono text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {copiedUrl ? 'Copied!' : 'Copy App Link'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Option 2: Direct File Downloads (Standalone Mobile Game Package & Android APK TWA Builder) */}
              <div className="p-4 rounded-xl bg-[#0b0a10] border border-slate-800">
                <div className="font-mono text-sm font-bold text-sky-400 mb-1">
                  02. Direct File Download (Standalone Mobile Package & APK Builder)
                </div>
                <p className="text-slate-300 leading-relaxed mb-3">
                  Download the portable mobile game launcher file directly to your device storage, or download the Android Trusted Web Activity (TWA) APK manifest to compile a standalone <code className="text-amber-300">.apk</code> binary via Bubblewrap CLI.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={async () => {
                      setDownloadStatus('Packaging standalone mobile game...');
                      await downloadStandaloneGamePackage();
                      setDownloadStatus('Downloaded IUB-CGPA-Survival-Mobile.html!');
                    }}
                    className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-mono text-xs font-bold cursor-pointer"
                  >
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V3" />
                    </svg>
                    Download Mobile Game Package
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      downloadAndroidApkManifest();
                      setDownloadStatus('Downloaded Android APK TWA Manifest (twa-manifest.json)!');
                    }}
                    className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-100 font-mono text-xs font-semibold cursor-pointer"
                  >
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V3" />
                    </svg>
                    Download APK Builder Config
                  </button>
                </div>

                {downloadStatus && (
                  <div className="mt-2.5 text-emerald-400 font-mono text-xs">
                    ✓ {downloadStatus}
                  </div>
                )}
              </div>

              {/* Offline Cache Status */}
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-1">
                <span>
                  Service Worker Offline Cache: {offlineReady ? 'Ready (100% Offline Capable)' : 'Active'}
                </span>
                <span>
                  Device: {isAndroid ? 'Android' : isIOS ? 'iOS' : 'Desktop / Web'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          HOW TO PLAY / CONTROLS & POWER-UPS MODAL
         ===================================================================== */}
      {showHowToPlay && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-3xl max-h-[88dvh] overflow-y-auto bg-[#12101b] border border-slate-700 rounded-2xl p-6 text-left">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
              <h2 className="font-display text-2xl font-bold text-white">
                How to Play · Survival Guide
              </h2>
              <button
                type="button"
                onClick={() => setShowHowToPlay(false)}
                className="px-3.5 py-1.5 text-xs font-mono bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-slate-300 leading-relaxed">
              <div>
                <h3 className="font-mono text-sm font-bold text-amber-400 mb-2">
                  01. Controls & Combat
                </h3>
                <ul className="space-y-1.5 font-mono">
                  <li><span className="text-white font-bold">A / D or Left / Right (or Slide D-Pad):</span> Move</li>
                  <li><span className="text-white font-bold">W or Space (or JUMP):</span> Jump & Aerial Double-Jump</li>
                  <li><span className="text-white font-bold">J or Z (or MELEE):</span> Heavy rolled-up Lab Report</li>
                  <li><span className="text-white font-bold">K or X (or PAPER):</span> Crumpled paper projectile</li>
                  <li><span className="text-white font-bold">Shift (or DASH):</span> Invulnerability Dash</li>
                  <li><span className="text-white font-bold">1 / 2 / 3 (or Tap Slot):</span> Use stored Power-Ups</li>
                </ul>

                <h3 className="font-mono text-sm font-bold text-rose-400 mt-5 mb-2">
                  02. Campus Enemies & Hazards
                </h3>
                <ul className="space-y-1.5">
                  <li><span className="text-white font-semibold">Grade Drop:</span> Cracked platforms that shake and collapse 0.8s after stepping on them.</li>
                  <li><span className="text-white font-semibold">All-Nighter:</span> Twitchy wraiths that drain stamina rapidly while boosting your speed.</li>
                  <li><span className="text-white font-semibold">Blank Sheet:</span> White void mimics that erase Dash/Ranged abilities until cured by Friend&apos;s Notes or timed out.</li>
                  <li><span className="text-white font-semibold">The Prerequisite:</span> Padlock golem blocking mid-level gates; collect the Assignment Key on the upper ramp or use a Chit.</li>
                  <li><span className="text-white font-semibold">Dean&apos;s List:</span> Armored knight guarding the final boss; only takes damage from behind or while boosted.</li>
                </ul>
              </div>

              <div>
                <h3 className="font-mono text-sm font-bold text-sky-400 mb-2">
                  03. Student-Life Power-Ups
                </h3>
                <ul className="space-y-1.5">
                  <li><span className="text-amber-300 font-semibold">3 AM Cha / Espresso:</span> Infinite stamina & 2x speed for 6s (2s crash).</li>
                  <li><span className="text-sky-300 font-semibold">Extra Sheet:</span> 2x melee reach & instant stamina refill.</li>
                  <li><span className="text-rose-300 font-semibold">One-Night Revision:</span> 2.5x damage boost for 8s (shreds Syllabus).</li>
                  <li><span className="text-yellow-300 font-semibold">Bonus Mark:</span> Absorbs one lethal hit or Academic Dismissal slam.</li>
                  <li><span className="text-purple-300 font-semibold">Group Study:</span> Spawns 2 AI clones that shoot & push back The Bell Curve.</li>
                  <li><span className="text-emerald-300 font-semibold">Chit:</span> Instant-kills Prerequisite golem, but spawns fast patrol guards.</li>
                  <li><span className="text-teal-300 font-semibold">Grace Period:</span> Slows enemies & collapsing platforms by 50% for 7s.</li>
                  <li><span className="text-pink-300 font-semibold">Medical Certificate:</span> 5s invulnerability & immunity to Retake traps.</li>
                  <li><span className="text-lime-300 font-semibold">Friend&apos;s Notes:</span> Cures Blank Sheet silence & heals +20 HP.</li>
                  <li><span className="text-violet-300 font-semibold">Past Question Bank:</span> Highlights boss weak spots for 2x crit damage.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          PAUSE MODAL
         ===================================================================== */}
      {screenState === 'PAUSED' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-6">
          <div className="w-full max-w-md bg-[#12101b] border border-slate-700 rounded-2xl p-6 text-center">
            <h2 className="font-display text-2xl font-bold text-white mb-2">SEMESTER PAUSED</h2>
            <p className="text-xs font-mono text-slate-400 mb-6">
              {hud.levelName} · Current CGPA: {hud.cgpa.toFixed(2)}
            </p>
            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => setScreenState('PLAYING')}
                className="w-full py-2.5 text-xs font-mono font-bold text-white bg-rose-600 hover:bg-rose-500 rounded-xl cursor-pointer"
              >
                Resume Game
              </button>
              <button
                type="button"
                onClick={() => setShowTouchControls((v) => !v)}
                className="w-full py-2.5 text-xs font-mono font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-xl cursor-pointer"
              >
                {showTouchControls ? 'Hide On-Screen Touch Controls' : 'Show On-Screen Touch Controls'}
              </button>
              <button
                type="button"
                onClick={toggleHaptics}
                className="w-full py-2.5 text-xs font-mono font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-xl cursor-pointer"
              >
                Haptic Vibration: {hapticsEnabled ? 'Enabled' : 'Disabled'}
              </button>
              {!isInstalled && (
                <button
                  type="button"
                  onClick={handleInstallOrDownloadApk}
                  className="w-full py-2.5 text-xs font-mono font-bold text-emerald-200 bg-emerald-950/90 hover:bg-emerald-900 border border-emerald-500/60 rounded-xl cursor-pointer"
                >
                  Download / Install APK
                </button>
              )}
              <button
                type="button"
                onClick={() => startGame(hud.level)}
                className="w-full py-2.5 text-xs font-mono font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-xl cursor-pointer"
              >
                Restart Current Floor
              </button>
              <button
                type="button"
                onClick={() => setScreenState('TITLE')}
                className="w-full py-2.5 text-xs font-mono font-semibold text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-xl cursor-pointer"
              >
                Return to Title Screen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          VICTORY SCREEN ("CONVOCATION UNLOCKED — GRADUATED!")
         ===================================================================== */}
      {screenState === 'VICTORY' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/85 p-6">
          <div className="w-full max-w-lg bg-[#12101b] border border-amber-500/60 rounded-2xl p-8 text-center">
            <div className="text-xs font-mono text-amber-400 tracking-widest mb-2">
              INDEPENDENT UNIVERSITY, BANGLADESH · DEGREE CONFERRED
            </div>
            <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-white mb-3">
              CONVOCATION UNLOCKED — GRADUATED!
            </h2>
            <p className="text-sm text-slate-300 mb-6">
              You conquered The Syllabus, escaped the Shrinking Void of Probation, and shattered the Red Stamp of Academic Dismissal on the 10th Floor Roof.
            </p>

            <div className="grid grid-cols-2 gap-4 bg-[#09080c] border border-slate-800 rounded-xl p-4 mb-6 font-mono tabular-nums">
              <div>
                <div className="text-xs text-slate-400">FINAL CGPA</div>
                <div className="text-3xl font-bold text-emerald-400">
                  {victoryStats.cgpa.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400">COMPLETION TIME</div>
                <div className="text-3xl font-bold text-amber-300">
                  {formatTime(victoryStats.time)}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => startGame(1)}
                className="px-6 py-3 text-xs font-mono font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl cursor-pointer"
              >
                Play Again (Floor 1)
              </button>
              <button
                type="button"
                onClick={() => setScreenState('TITLE')}
                className="px-5 py-3 text-xs font-mono font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-xl cursor-pointer"
              >
                Title Screen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          GAME OVER SCREEN ("ACADEMIC DISMISSAL (CGPA 0.00)" + GHOST PATH OVERLAY)
         ===================================================================== */}
      {screenState === 'GAME_OVER' && (() => {
        // Compute normalized SVG coordinates for the Last 5.0s Ghost Path Telemetry Map
        const samples = ghostPathSamples;
        let minX = 0;
        let maxX = 400;
        let minY = 200;
        let maxY = 580;
        if (samples.length > 0) {
          minX = Math.min(...samples.map((s) => s.x)) - 45;
          maxX = Math.max(...samples.map((s) => s.x + s.w)) + 45;
          minY = Math.min(...samples.map((s) => s.y)) - 45;
          maxY = Math.max(...samples.map((s) => s.y + s.h)) + 25;
        }
        const spanX = Math.max(180, maxX - minX);
        const spanY = Math.max(120, maxY - minY);
        const svgW = 460;
        const svgH = 135;
        const toSvgX = (wx: number) =>
          18 + ((wx - minX) / spanX) * (svgW - 36);
        const toSvgY = (wy: number) =>
          16 + ((wy - minY) / spanY) * (svgH - 32);

        const polylinePoints = samples
          .map((s) => `${toSvgX(s.x + s.w * 0.5).toFixed(1)},${toSvgY(s.y + s.h * 0.5).toFixed(1)}`)
          .join(' ');

        const jumpCount = samples.filter((s) => s.event === 'JUMP').length;
        const dashCount = samples.filter((s) => s.event === 'DASH').length;
        const hurtCount = samples.filter((s) => s.event === 'HURT').length;

        return (
          <div
            className={`fixed inset-0 z-40 flex flex-col justify-center items-center p-3.5 sm:p-6 transition-colors ${
              inspectGhostWorld
                ? 'bg-transparent pointer-events-none justify-end pb-5'
                : 'bg-[#09080c]/55 backdrop-blur-[2px]'
            }`}
          >
            {inspectGhostWorld ? (
              <div className="pointer-events-auto flex flex-wrap items-center justify-between gap-3 w-full max-w-xl bg-[#0e0c14]/90 border border-sky-500/60 rounded-2xl px-4 py-3 shadow-2xl">
                <div className="text-left font-mono">
                  <div className="text-xs font-bold text-sky-300">
                    GHOST PATH LIVE WORLD REPLAY (LAST 5.0 SECONDS)
                  </div>
                  <div className="text-[11px] text-slate-300">
                    Watching spectral trajectory &amp; fatal impact point on Floor {hud.level}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setInspectGhostWorld(false)}
                    className="px-3.5 py-2 text-xs font-mono font-semibold text-slate-100 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-xl cursor-pointer"
                  >
                    Show Post-Mortem Card
                  </button>
                  <button
                    type="button"
                    onClick={() => void startGame(hud.level)}
                    className="px-4 py-2 text-xs font-mono font-bold text-white bg-rose-600 hover:bg-rose-500 rounded-xl cursor-pointer"
                  >
                    Retry Floor {hud.level}
                  </button>
                </div>
              </div>
            ) : (
              <div className="w-full max-w-xl bg-[#120b12]/88 border border-rose-500/70 rounded-2xl p-5 sm:p-7 text-center shadow-2xl max-h-[92dvh] overflow-y-auto">
                <div className="text-[11px] font-mono text-rose-400 tracking-widest mb-1">
                  REGISTRAR NOTICE · PERMANENT EXPULSION
                </div>
                <h2 className="font-display text-2xl sm:text-4xl font-extrabold text-rose-500 mb-1.5">
                  ACADEMIC DISMISSAL (CGPA 0.00)
                </h2>
                <p className="text-xs sm:text-sm font-mono text-slate-200 mb-4">
                  Cause: {gameOverReason}
                </p>

                {/* Transparent Ghost Path Overlay Diagram (Last 5 Seconds Before Death) */}
                <div className="bg-[#08070c]/75 border border-sky-500/40 rounded-xl p-3 sm:p-4 mb-5 text-left">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2 font-mono">
                    <div className="flex items-center gap-2">
                      <span className="inline-block w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
                      <span className="text-xs font-bold text-sky-300 tracking-wide">
                        GHOST PATH OVERLAY · LAST 5.0s MOVEMENT TRACE
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setInspectGhostWorld(true)}
                      className="px-2.5 py-1 text-[10px] font-mono font-semibold text-sky-200 bg-sky-950/80 hover:bg-sky-900 border border-sky-500/50 rounded-lg cursor-pointer"
                    >
                      Inspect Full World Ghost
                    </button>
                  </div>

                  <div className="relative w-full overflow-hidden rounded-lg bg-[#050509]/70 border border-slate-800/90">
                    <svg
                      viewBox={`0 0 ${svgW} ${svgH}`}
                      className="w-full h-[125px] sm:h-[140px] block"
                    >
                      {/* Tactical Grid Lines */}
                      <line x1="0" y1={svgH * 0.33} x2={svgW} y2={svgH * 0.33} stroke="rgba(148,163,184,0.1)" strokeDasharray="4 4" />
                      <line x1="0" y1={svgH * 0.66} x2={svgW} y2={svgH * 0.66} stroke="rgba(148,163,184,0.1)" strokeDasharray="4 4" />
                      <line x1={svgW * 0.25} y1="0" x2={svgW * 0.25} y2={svgH} stroke="rgba(148,163,184,0.1)" strokeDasharray="4 4" />
                      <line x1={svgW * 0.5} y1="0" x2={svgW * 0.5} y2={svgH} stroke="rgba(148,163,184,0.1)" strokeDasharray="4 4" />
                      <line x1={svgW * 0.75} y1="0" x2={svgW * 0.75} y2={svgH} stroke="rgba(148,163,184,0.1)" strokeDasharray="4 4" />

                      {/* Glowing Ghost Path Trajectory */}
                      {samples.length > 1 && (
                        <>
                          <polyline
                            fill="none"
                            stroke="rgba(56, 189, 248, 0.28)"
                            strokeWidth="7"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            points={polylinePoints}
                          />
                          <polyline
                            fill="none"
                            stroke="#38bdf8"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            points={polylinePoints}
                          />
                        </>
                      )}

                      {/* Event Nodes along the 5-Second Ghost Path */}
                      {samples.map((s, idx) => {
                        const sx = toSvgX(s.x + s.w * 0.5);
                        const sy = toSvgY(s.y + s.h * 0.5);
                        const isStart = idx === 0;
                        const isFatal = idx === samples.length - 1;
                        if (!isStart && !isFatal && s.event === 'NONE' && idx % 6 !== 0) {
                          return null;
                        }
                        const color = isFatal
                          ? '#f43f5e'
                          : s.event === 'HURT'
                          ? '#fb7185'
                          : s.event === 'DASH'
                          ? '#38bdf8'
                          : s.event === 'JUMP'
                          ? '#fde047'
                          : '#a855f7';
                        return (
                          <g key={`${idx}-${s.timeOffset}`}>
                            <circle
                              cx={sx}
                              cy={sy}
                              r={isFatal ? 5.5 : s.event !== 'NONE' ? 4 : 2.2}
                              fill={color}
                            />
                            {(isStart || isFatal || s.event === 'JUMP' || s.event === 'DASH' || s.event === 'HURT') && (
                              <text
                                x={Math.max(28, Math.min(svgW - 28, sx))}
                                y={Math.max(12, sy - 8)}
                                textAnchor="middle"
                                fill={isFatal ? '#fda4af' : '#e2e8f0'}
                                fontSize="8.5"
                                fontFamily="JetBrains Mono, monospace"
                                fontWeight="700"
                              >
                                {isFatal
                                  ? 'FATAL 0.0s'
                                  : isStart
                                  ? '-5.0s'
                                  : `${s.event} ${s.timeOffset.toFixed(1)}s`}
                              </text>
                            )}
                          </g>
                        );
                      })}
                    </svg>
                  </div>

                  {/* Legend & Tactical Takeaway from the Final 5 Seconds */}
                  <div className="flex flex-wrap items-center justify-between gap-2 mt-2.5 text-[11px] font-mono text-slate-300">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-amber-300">● Jumps: {jumpCount}</span>
                      <span className="text-sky-300">● Dashes: {dashCount}</span>
                      <span className="text-rose-400">● Hits Taken: {hurtCount}</span>
                    </div>
                    <span className="text-slate-400">
                      {dashCount === 0
                        ? 'Tip: Use Shift / DASH invulnerability frames through telegraphed hits'
                        : jumpCount === 0
                        ? 'Tip: Use Double-Jump (W / Space) to clear ground shockwaves'
                        : 'Tip: Watch the live spectral ghost behind this overlay to time your dodge'}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => void startGame(hud.level)}
                    className="px-6 py-3 text-xs font-mono font-bold text-white bg-rose-600 hover:bg-rose-500 rounded-xl cursor-pointer"
                  >
                    Instant Retry (Floor {hud.level})
                  </button>
                  <button
                    type="button"
                    onClick={() => setScreenState('TITLE')}
                    className="px-5 py-3 text-xs font-mono font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-xl cursor-pointer"
                  >
                    Title &amp; Level Select
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

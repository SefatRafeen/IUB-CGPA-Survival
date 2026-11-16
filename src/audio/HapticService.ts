/**
 * HapticFeedbackService
 * Provides physical tactile vibration pulses via navigator.vibrate() for intense gameplay moments
 * (melee combo swings/impacts, taking damage, wall-dash sparks, player shatter, and boss slams)
 * while strictly respecting user settings and reduced-motion preferences.
 */

const HAPTICS_STORAGE_KEY = 'iub_cgpa_haptics_enabled';

class HapticFeedbackService {
  private enabled: boolean = true;
  private lastPulseTime: number = 0;

  constructor() {
    this.loadSettings();
  }

  private loadSettings(): void {
    try {
      const saved = window.localStorage.getItem(HAPTICS_STORAGE_KEY);
      if (saved !== null) {
        this.enabled = saved === 'true';
        return;
      }
      // Respect OS reduced-motion setting by default if user hasn't explicitly set a preference
      if (
        typeof window !== 'undefined' &&
        window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ) {
        this.enabled = false;
      }
    } catch {
      this.enabled = true;
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(next: boolean): void {
    this.enabled = next;
    try {
      window.localStorage.setItem(HAPTICS_STORAGE_KEY, String(next));
    } catch {
      // Ignore storage errors in restricted environments
    }
    if (!next) {
      this.stop();
    } else {
      this.uiTap();
    }
  }

  public toggle(): boolean {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  public stop(): void {
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(0);
      }
    } catch {
      // Ignore
    }
  }

  private trigger(pattern: number | number[], minIntervalMs: number = 28): void {
    if (!this.enabled) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - this.lastPulseTime < minIntervalMs) return;
    this.lastPulseTime = now;

    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(pattern);
      }
    } catch {
      // Ignore if blocked by browser or unsupported hardware
    }
  }

  /** Subtle 10ms pulse for UI and touch control button presses */
  public uiTap(): void {
    this.trigger(10, 20);
  }

  /** Crisp physical pulse on melee swing, escalating on the 3rd combo finisher */
  public meleeSwing(comboStep: 1 | 2 | 3 = 1): void {
    if (comboStep === 3) {
      this.trigger([18, 16, 28], 35);
    } else if (comboStep === 2) {
      this.trigger(15, 30);
    } else {
      this.trigger(11, 25);
    }
  }

  /** Solid tactile thud when melee or projectile hits an enemy or boss */
  public meleeHit(isHeavyOrCrit: boolean = false, comboCount: number = 1): void {
    if (isHeavyOrCrit || comboCount >= 3) {
      this.trigger([28, 18, 42], 40);
    } else {
      this.trigger(22, 30);
    }
  }

  /** Short rapid buzz when dashing into walls/gates and showering sparks */
  public wallSpark(): void {
    this.trigger([14, 18, 14], 45);
  }

  /** Sharp double-jolt when the player takes HP and CGPA damage */
  public playerDamage(): void {
    this.trigger([48, 28, 72], 60);
  }

  /** Heavy seismic rumble during Boss Textbook Slams, Chain Lasers, and Academic Dismissal Hydraulic Slams */
  public bossSlam(isUltimate: boolean = false): void {
    if (isUltimate) {
      this.trigger([110, 35, 140, 35, 210], 80);
    } else {
      this.trigger([75, 30, 115], 65);
    }
  }

  /** Fracturing pulse cascade when the player's vessel shatters on Game Over */
  public playerShatter(): void {
    this.trigger([65, 25, 45, 25, 110], 80);
  }
}

export const hapticService = new HapticFeedbackService();

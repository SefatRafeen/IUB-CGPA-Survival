import { LevelId } from '../types/game';

export type SoundEffect =
  // Player Sounds
  | 'player_jump'
  | 'player_dash'
  | 'player_melee'
  | 'player_ranged'
  | 'player_hurt'
  | 'powerup_pickup'
  // Enemy & Hazard Sounds
  | 'grade_drop_crack'
  | 'all_nighter_screech'
  | 'blank_sheet_erase'
  | 'bell_curve_hum'
  | 'prerequisite_lock'
  | 'retake_warp'
  // Boss 1: The Syllabus
  | 'syllabus_slice'
  | 'syllabus_highlighter'
  | 'syllabus_slam'
  // Boss 2: Probation
  | 'probation_beep'
  | 'probation_chain'
  | 'probation_acid'
  // Boss 3: Academic Dismissal
  | 'dismissal_stamp'
  | 'dismissal_eraser'
  | 'dismissal_silence_ult';

class SoundEngine {
  private ctx: AudioContext | null = null;
  public isMuted: boolean = false;
  private musicTimer: number | null = null;
  private currentLevel: LevelId = 1;
  private stepCount: number = 0;
  private bossSilence: boolean = false;
  private arenaShrinkFactor: number = 0; // 0 to 1, speeds up Level 2 heartbeat bassline

  // Continuous Procedural Ambient Layering Nodes
  private ambNoiseSource: AudioBufferSourceNode | null = null;
  private ambPrimaryFilter: BiquadFilterNode | null = null;
  private ambSecondaryFilter: BiquadFilterNode | null = null;
  private ambPrimaryGain: GainNode | null = null;
  private ambSecondaryGain: GainNode | null = null;
  private ambDroneOsc: OscillatorNode | null = null;
  private ambDroneGain: GainNode | null = null;
  private ambStarted: boolean = false;

  public unlock(): void {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    this.ensureAmbienceNodes();
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (muted) {
      this.stopMusic();
      this.silenceAmbience();
    } else {
      this.startMusic(this.currentLevel);
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public vibrate(ms: number = 12): void {
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(ms);
      }
    } catch {
      // Ignore on unsupported devices
    }
  }

  public setBossSilence(silence: boolean): void {
    this.bossSilence = silence;
    if (silence) {
      this.silenceAmbience();
    }
  }

  public setArenaShrinkFactor(factor: number): void {
    this.arenaShrinkFactor = Math.max(0, Math.min(1, factor));
  }

  private ensureAmbienceNodes(): void {
    if (!this.ctx || this.ambStarted) return;
    try {
      const sampleRate = this.ctx.sampleRate;
      const length = sampleRate * 4;
      const buffer = this.ctx.createBuffer(1, length, sampleRate);
      const data = buffer.getChannelData(0);
      // Generate smooth pink-tinted noise for organic wind howling & muffled crowd chatter
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.045;
        b6 = white * 0.115926;
      }

      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;

      // Primary filter: Formant lecture-chatter murmur (Floor 1) / Ventilation resonance (Floor 2) / Low howling wind (Floor 3)
      const filter1 = this.ctx.createBiquadFilter();
      filter1.type = 'bandpass';
      filter1.frequency.value = 420;
      filter1.Q.value = 3.5;

      const gain1 = this.ctx.createGain();
      gain1.gain.value = 0.0001;

      // Secondary filter: Muffled syllabic chatter overtones (Floor 1) / Corrosive sand hiss (Floor 2) / High whistling roof wind (Floor 3)
      const filter2 = this.ctx.createBiquadFilter();
      filter2.type = 'bandpass';
      filter2.frequency.value = 880;
      filter2.Q.value = 5.0;

      const gain2 = this.ctx.createGain();
      gain2.gain.value = 0.0001;

      // Subtle environmental hum oscillator (120Hz fluorescent ballast hum in Cafeteria / sub-wind drone on Roof)
      const droneOsc = this.ctx.createOscillator();
      droneOsc.type = 'triangle';
      droneOsc.frequency.value = 120;
      const droneGain = this.ctx.createGain();
      droneGain.gain.value = 0.0001;

      source.connect(filter1);
      filter1.connect(gain1);
      gain1.connect(this.ctx.destination);

      source.connect(filter2);
      filter2.connect(gain2);
      gain2.connect(this.ctx.destination);

      droneOsc.connect(droneGain);
      droneGain.connect(this.ctx.destination);

      source.start();
      droneOsc.start();

      this.ambNoiseSource = source;
      this.ambPrimaryFilter = filter1;
      this.ambSecondaryFilter = filter2;
      this.ambPrimaryGain = gain1;
      this.ambSecondaryGain = gain2;
      this.ambDroneOsc = droneOsc;
      this.ambDroneGain = droneGain;
      this.ambStarted = true;
    } catch {
      // Ignore audio initialization errors
    }
  }

  private silenceAmbience(): void {
    if (!this.ctx || !this.ambStarted) return;
    const now = this.ctx.currentTime;
    this.ambPrimaryGain?.gain.setTargetAtTime(0.0001, now, 0.08);
    this.ambSecondaryGain?.gain.setTargetAtTime(0.0001, now, 0.08);
    this.ambDroneGain?.gain.setTargetAtTime(0.0001, now, 0.08);
  }

  /**
   * Dynamically updates procedural ambient layers every frame based on level,
   * player's distance along the floor, and elevation.
   */
  public updateAmbience(
    level: LevelId,
    playerX: number,
    playerY: number,
    worldWidth: number,
    floorY: number,
    time: number
  ): void {
    if (!this.ctx || this.isMuted || this.bossSilence) {
      this.silenceAmbience();
      return;
    }
    if (this.ctx.state === 'suspended') return;
    this.ensureAmbienceNodes();
    if (!this.ambPrimaryFilter || !this.ambSecondaryFilter || !this.ambPrimaryGain || !this.ambSecondaryGain || !this.ambDroneOsc || !this.ambDroneGain) {
      return;
    }

    const now = this.ctx.currentTime;
    const progressX = Math.max(0, Math.min(1, playerX / Math.max(1, worldWidth)));
    const altitudeFactor = Math.max(0, Math.min(1, (floorY - playerY) / 340));

    if (level === 1) {
      // FLOOR 1 (The Ruined Cafeteria): Distant muffled lecture hall chatter + flickering fluorescent ballast hum
      // Distance-based lecture hall proximity peaks near ruined classroom archways along the hall
      const hallProximity = 0.35 + 0.65 * Math.pow(Math.sin(playerX * 0.0042) * 0.5 + 0.5, 1.4);
      // Syllable-rate vocal formant modulation (3.8Hz and 6.3Hz)
      const syllableMod = 0.6 + 0.4 * Math.sin(time * 24) * Math.cos(time * 15);
      const vowelFormant1 = 360 + Math.sin(time * 3.7) * 95 + Math.cos(time * 8.2) * 45;
      const vowelFormant2 = 780 + Math.cos(time * 4.9) * 160;

      this.ambPrimaryFilter.frequency.setTargetAtTime(vowelFormant1, now, 0.06);
      this.ambPrimaryFilter.Q.setTargetAtTime(4.2, now, 0.06);
      this.ambPrimaryGain.gain.setTargetAtTime(0.095 * hallProximity * syllableMod, now, 0.06);

      this.ambSecondaryFilter.frequency.setTargetAtTime(vowelFormant2, now, 0.06);
      this.ambSecondaryFilter.Q.setTargetAtTime(5.5, now, 0.06);
      this.ambSecondaryGain.gain.setTargetAtTime(0.055 * hallProximity * syllableMod, now, 0.06);

      // Flickering fluorescent light 120Hz hum
      const flickerBuzz = Math.sin(time * 23 + playerX * 0.01) > -0.35 ? 0.014 : 0.003;
      this.ambDroneOsc.frequency.setTargetAtTime(120, now, 0.05);
      this.ambDroneGain.gain.setTargetAtTime(flickerBuzz, now, 0.05);
    } else if (level === 2) {
      // FLOOR 2 (Admin Corridor & Probation Zone): Hollow corridor resonance + distance-based corrosive sand hiss
      const probationProximity = 0.25 + 0.75 * Math.pow(progressX, 1.2) + this.arenaShrinkFactor * 0.4;
      const ductFreq = 210 + Math.sin(time * 1.8) * 35;
      const sandHissFreq = 2400 + Math.sin(time * 5.2) * 480;

      this.ambPrimaryFilter.frequency.setTargetAtTime(ductFreq, now, 0.08);
      this.ambPrimaryFilter.Q.setTargetAtTime(3.0, now, 0.08);
      this.ambPrimaryGain.gain.setTargetAtTime(0.065 * probationProximity, now, 0.08);

      this.ambSecondaryFilter.frequency.setTargetAtTime(sandHissFreq, now, 0.08);
      this.ambSecondaryFilter.Q.setTargetAtTime(2.4, now, 0.08);
      this.ambSecondaryGain.gain.setTargetAtTime(0.05 * probationProximity, now, 0.08);

      this.ambDroneOsc.frequency.setTargetAtTime(82.41, now, 0.08);
      this.ambDroneGain.gain.setTargetAtTime(0.012 * probationProximity, now, 0.08);
    } else {
      // FLOOR 3 (The 10th Floor Roof): Distance-based & altitude-modulated howling rooftop wind
      const gustWave = 0.55 + 0.45 * Math.sin(time * 1.45 + progressX * 4.0) + 0.25 * Math.cos(time * 3.1);
      const exposure = 0.4 + 0.4 * progressX + 0.45 * altitudeFactor;
      const lowWindFreq = 240 + gustWave * 190 + altitudeFactor * 140;
      const whistleWindFreq = 580 + gustWave * 360 + altitudeFactor * 260;

      this.ambPrimaryFilter.frequency.setTargetAtTime(lowWindFreq, now, 0.08);
      this.ambPrimaryFilter.Q.setTargetAtTime(3.8, now, 0.08);
      this.ambPrimaryGain.gain.setTargetAtTime(0.13 * exposure * gustWave, now, 0.08);

      this.ambSecondaryFilter.frequency.setTargetAtTime(whistleWindFreq, now, 0.08);
      this.ambSecondaryFilter.Q.setTargetAtTime(7.2, now, 0.08);
      this.ambSecondaryGain.gain.setTargetAtTime(0.085 * exposure * gustWave, now, 0.08);

      this.ambDroneOsc.frequency.setTargetAtTime(55 + altitudeFactor * 18, now, 0.1);
      this.ambDroneGain.gain.setTargetAtTime(0.016 * exposure, now, 0.1);
    }
  }

  public startMusic(level: LevelId): void {
    this.currentLevel = level;
    this.stopMusic();
    if (this.isMuted) return;

    const tick = () => {
      if (this.isMuted) return;
      this.playMusicStep();
      let interval = 230;
      if (this.currentLevel === 1) {
        interval = 210; // Anxious ticking clockwork
      } else if (this.currentLevel === 2) {
        // Heartbeat bassline speeds up as arena shrinks
        interval = Math.round(240 - this.arenaShrinkFactor * 95);
      } else {
        interval = 200; // Dark industrial percussion
      }
      this.musicTimer = window.setTimeout(tick, interval);
    };

    this.musicTimer = window.setTimeout(tick, 150);
  }

  public stopMusic(): void {
    if (this.musicTimer !== null) {
      clearTimeout(this.musicTimer);
      this.musicTimer = null;
    }
  }

  private playMusicStep(): void {
    if (!this.ctx || this.isMuted || this.bossSilence) return;
    if (this.ctx.state === 'suspended') return;

    const now = this.ctx.currentTime;
    const step = this.stepCount++ % 16;

    if (this.currentLevel === 1) {
      // Floor 1: Anxious ticking clockwork + somber Hollow-Knight style minor arpeggio
      this.synthNoiseBurst(now, 0.018, step % 2 === 0 ? 3200 : 2200, 0.025);
      const notes = [146.83, 174.61, 220.0, 261.63, 220.0, 174.61, 164.81, 130.81]; // D minor brooding
      const freq = notes[step % notes.length];
      if (step % 2 === 0) {
        this.synthTone(now, freq, 'triangle', 0.16, 0.045);
      }
      if (step === 0 || step === 8) {
        this.synthTone(now, 73.42, 'sine', 0.35, 0.07);
      }
    } else if (this.currentLevel === 2) {
      // Floor 2: Probation heartbeat bassline + metallic tension chimes
      if (step % 4 === 0 || step % 4 === 1) {
        const pitch = step % 4 === 0 ? 62 : 52;
        this.synthKick(now, pitch, 0.18, 0.11);
      }
      if (step === 6 || step === 14) {
        this.synthTone(now, 587.33, 'sine', 0.12, 0.03);
      }
    } else {
      // Floor 3: Dark industrial percussion + cathedral bass drone
      if (step % 4 === 0) {
        this.synthKick(now, 55, 0.25, 0.12);
      }
      if (step % 4 === 2) {
        this.synthNoiseBurst(now, 0.07, 900, 0.05);
      }
      if (step === 0 || step === 8) {
        this.synthTone(now, step === 0 ? 65.41 : 61.74, 'sawtooth', 0.38, 0.045, 280);
      }
    }
  }

  // --- Core Procedural Sound Effects ---

  public playJump(isDouble: boolean = false): void {
    this.vibrate(10);
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    const base = isDouble ? 320 : 210;
    osc.frequency.setValueAtTime(base, now);
    osc.frequency.exponentialRampToValueAtTime(base * 1.9, now + 0.12);
    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.13);
  }

  public playDash(): void {
    this.vibrate(12);
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    this.synthNoiseBurst(now, 0.14, 1400, 0.12);
    this.synthTone(now, 180, 'triangle', 0.12, 0.08);
  }

  public playPaperSlice(): void {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    // Crisp high-frequency band-pass noise + rapid pitch sweep for razor paper slice
    this.play('player_ranged');
  }

  private createNoiseBuffer(duration: number): AudioBuffer | null {
    if (!this.ctx) return null;
    const bufferSize = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  public play(sfx: SoundEffect): void {
    if (this.isMuted) return;
    this.unlock();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;

    switch (sfx) {
      // ================= PLAYER =================
      case 'player_jump': {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(480, now + 0.14);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        osc.connect(gain).connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.14);
        break;
      }

      case 'player_dash': {
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.createNoiseBuffer(0.18);
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1200, now);
        filter.frequency.exponentialRampToValueAtTime(300, now + 0.18);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        noise.connect(filter).connect(gain).connect(this.ctx.destination);
        noise.start(now);
        break;
      }

      case 'player_melee': {
        // Heavy rolled-up lab report thwack
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(65, now + 0.12);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.connect(gain).connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.12);
        break;
      }

      case 'player_ranged': {
        // Crumpled paper flick
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.createNoiseBuffer(0.08);
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(2000, now);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        noise.connect(filter).connect(gain).connect(this.ctx.destination);
        noise.start(now);
        break;
      }

      case 'player_hurt': {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(160, now);
        osc.frequency.linearRampToValueAtTime(70, now + 0.25);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.connect(gain).connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.25);
        break;
      }

      case 'powerup_pickup': {
        // Bright 3-note arpeggio
        [523.25, 659.25, 783.99].forEach((freq, i) => {
          if (!this.ctx) return;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + i * 0.06);
          gain.gain.setValueAtTime(0.15, now + i * 0.06);
          gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.15);
          osc.connect(gain).connect(this.ctx.destination);
          osc.start(now + i * 0.06);
          osc.stop(now + i * 0.06 + 0.15);
        });
        break;
      }

      // ================= ENEMIES & HAZARDS =================
      case 'grade_drop_crack': {
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.createNoiseBuffer(0.2);
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(900, now);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        noise.connect(filter).connect(gain).connect(this.ctx.destination);
        noise.start(now);
        break;
      }

      case 'all_nighter_screech': {
        // Jittery fluorescent buzz + alarm ring
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.setValueAtTime(940, now + 0.05);
        osc.frequency.setValueAtTime(860, now + 0.1);
        osc.frequency.exponentialRampToValueAtTime(400, now + 0.25);
        gain.gain.setValueAtTime(0.14, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.connect(gain).connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.25);
        break;
      }

      case 'blank_sheet_erase': {
        // White-noise vacuum whoosh
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.createNoiseBuffer(0.35);
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.Q.value = 5;
        filter.frequency.setValueAtTime(300, now);
        filter.frequency.exponentialRampToValueAtTime(2800, now + 0.35);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        noise.connect(filter).connect(gain).connect(this.ctx.destination);
        noise.start(now);
        break;
      }

      case 'bell_curve_hum': {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(110, now);
        osc.frequency.linearRampToValueAtTime(145, now + 0.4);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.connect(gain).connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.4);
        break;
      }

      case 'prerequisite_lock': {
        // Heavy metallic clank
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(130, now);
        osc.frequency.setValueAtTime(95, now + 0.07);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.connect(gain).connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.18);
        break;
      }

      case 'retake_warp': {
        // Rewind time-loop sweep
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(120, now + 0.45);
        gain.gain.setValueAtTime(0.22, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        osc.connect(gain).connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.45);
        break;
      }

      // ================= BOSS 1: THE SYLLABUS =================
      case 'syllabus_slice': {
        // Razor-sharp paper slice (shhhk!)
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.createNoiseBuffer(0.15);
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(3200, now);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.28, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        noise.connect(filter).connect(gain).connect(this.ctx.destination);
        noise.start(now);
        break;
      }

      case 'syllabus_highlighter': {
        // High-pitched felt-tip marker squeak
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(2400, now);
        osc.frequency.exponentialRampToValueAtTime(3400, now + 0.12);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.connect(gain).connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.12);
        break;
      }

      case 'syllabus_slam': {
        // Heavy hardcover book slam
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.exponentialRampToValueAtTime(35, now + 0.35);
        gain.gain.setValueAtTime(0.45, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.connect(gain).connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.35);
        break;
      }

      // ================= BOSS 2: PROBATION =================
      case 'probation_beep': {
        // Flatline digital warning BEEP-BEEP-BEEP
        [0, 0.12, 0.24].forEach((offset) => {
          if (!this.ctx) return;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'square';
          osc.frequency.setValueAtTime(1050, now + offset);
          gain.gain.setValueAtTime(0.12, now + offset);
          gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.08);
          osc.connect(gain).connect(this.ctx.destination);
          osc.start(now + offset);
          osc.stop(now + offset + 0.08);
        });
        break;
      }

      case 'probation_chain': {
        // Metallic chain rattle
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.createNoiseBuffer(0.3);
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.Q.value = 8;
        filter.frequency.setValueAtTime(1800, now);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        noise.connect(filter).connect(gain).connect(this.ctx.destination);
        noise.start(now);
        break;
      }

      case 'probation_acid': {
        // Bubbling corrosive green sludge hiss
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.createNoiseBuffer(0.4);
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(2500, now);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        noise.connect(filter).connect(gain).connect(this.ctx.destination);
        noise.start(now);
        break;
      }

      // ================= BOSS 3: ACADEMIC DISMISSAL =================
      case 'dismissal_stamp': {
        // Earth-shaking hydraulic CLANG-THUD!
        const sub = this.ctx.createOscillator();
        const subGain = this.ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(110, now);
        sub.frequency.exponentialRampToValueAtTime(28, now + 0.55);
        subGain.gain.setValueAtTime(0.6, now);
        subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
        sub.connect(subGain).connect(this.ctx.destination);
        sub.start(now);
        sub.stop(now + 0.55);

        // Metallic clang overtone
        const clang = this.ctx.createOscillator();
        const clangGain = this.ctx.createGain();
        clang.type = 'sawtooth';
        clang.frequency.setValueAtTime(320, now);
        clang.frequency.exponentialRampToValueAtTime(90, now + 0.25);
        clangGain.gain.setValueAtTime(0.25, now);
        clangGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        clang.connect(clangGain).connect(this.ctx.destination);
        clang.start(now);
        clang.stop(now + 0.25);
        break;
      }

      case 'dismissal_eraser': {
        // Harsh rubber-scraping screech
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(620, now);
        osc.frequency.linearRampToValueAtTime(410, now + 0.15);
        osc.frequency.linearRampToValueAtTime(750, now + 0.35);
        gain.gain.setValueAtTime(0.22, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.connect(gain).connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.35);
        break;
      }

      case 'dismissal_silence_ult': {
        // Sub-bass drop after the 0.5s dead-silence telegraph
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(85, now);
        osc.frequency.exponentialRampToValueAtTime(22, now + 0.8);
        gain.gain.setValueAtTime(0.65, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
        osc.connect(gain).connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.8);
        break;
      }
    }
  }

  public playMeleeSwing(comboStep: number = 1, momentumRatio: number = 0): void {
    this.vibrate(10 + comboStep * 3);
    this.play('player_melee');
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    const pitchBoost = 1 + (comboStep - 1) * 0.18 + momentumRatio * 0.35;
    this.synthNoiseBurst(now, 0.095, Math.round(3200 * pitchBoost), 0.13);
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = comboStep === 3 ? 'triangle' : 'sawtooth';
    osc.frequency.setValueAtTime(780 * pitchBoost, now);
    osc.frequency.exponentialRampToValueAtTime(210 * pitchBoost, now + 0.095);
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  public playHitImpact(isCritical: boolean = false, comboCount: number = 1, momentumRatio: number = 0): void {
    this.vibrate(isCritical ? 24 : 14 + Math.min(12, comboCount * 2));
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    const baseKick = isCritical ? 145 : 105 + Math.min(60, comboCount * 8);
    this.synthKick(now, baseKick, 0.12, 0.17);
    // Ascending harmonic chime as Research Momentum builds
    const harmonicFreq = 440 * Math.pow(1.059463, Math.min(16, comboCount + Math.floor(momentumRatio * 6)));
    this.synthTone(now, harmonicFreq, isCritical ? 'triangle' : 'sine', 0.15, 0.095);
    if (comboCount > 0 && comboCount % 3 === 0) {
      // 3rd-hit combo finisher resonant chord
      this.synthTone(now + 0.03, harmonicFreq * 1.25, 'triangle', 0.18, 0.085);
    }
  }

  public playArmorClang(): void {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    this.synthTone(now, 1040, 'square', 0.09, 0.08);
    this.synthTone(now, 1480, 'triangle', 0.12, 0.07);
  }

  public playPlayerHurt(): void {
    this.vibrate(30);
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.linearRampToValueAtTime(85, now + 0.22);
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.24);
  }

  public playHighlighterSqueak(): void {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1650, now);
    osc.frequency.exponentialRampToValueAtTime(2350, now + 0.07);
    osc.frequency.exponentialRampToValueAtTime(1820, now + 0.14);
    gain.gain.setValueAtTime(0.07, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  public playBookSlam(): void {
    this.vibrate(25);
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    this.synthKick(now, 80, 0.28, 0.24);
    this.synthNoiseBurst(now, 0.18, 420, 0.18);
  }

  public playChainRattle(): void {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    for (let i = 0; i < 4; i++) {
      const t = now + i * 0.042;
      this.synthNoiseBurst(t, 0.03, 4200 + i * 350, 0.07);
      this.synthTone(t, 1200 + (i % 2) * 450, 'square', 0.035, 0.04);
    }
  }

  public playWarningBeep(): void {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const t = now + i * 0.09;
      this.synthTone(t, 1046.5, 'square', 0.06, 0.08);
    }
  }

  public playHissingSand(): void {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    this.synthNoiseBurst(now, 0.28, 2800, 0.07);
  }

  public playHydraulicSlam(): void {
    this.vibrate(40);
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    // Metallic CLANG followed by earth-shaking sub THUD
    this.synthTone(now, 680, 'square', 0.09, 0.14);
    this.synthTone(now, 1020, 'sawtooth', 0.12, 0.11);
    this.synthKick(now + 0.03, 62, 0.42, 0.28);
    this.synthNoiseBurst(now + 0.03, 0.3, 350, 0.22);
  }

  public playEraserScreech(): void {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(620, now);
    osc.frequency.linearRampToValueAtTime(1180, now + 0.14);
    osc.frequency.linearRampToValueAtTime(490, now + 0.28);
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  public playPowerUpCollect(): void {
    this.vibrate(12);
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    const freqs = [440, 554.37, 659.25, 880];
    freqs.forEach((f, idx) => {
      this.synthTone(now + idx * 0.045, f, 'triangle', 0.12, 0.08);
    });
  }

  public playPowerUpUse(): void {
    this.vibrate(15);
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    this.synthTone(now, 523.25, 'sine', 0.15, 0.1);
    this.synthTone(now + 0.06, 783.99, 'triangle', 0.2, 0.11);
  }

  public playRetakeTeleport(): void {
    this.vibrate(25);
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.32);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.34);
  }

  public playWallSpark(): void {
    this.vibrate(14);
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    this.synthNoiseBurst(now, 0.065, 4800, 0.09);
    this.synthTone(now, 1760, 'triangle', 0.07, 0.06);
  }

  public playPlayerShatter(): void {
    this.vibrate(50);
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    // Crystalline void fracture chimes + sub impact
    this.synthKick(now, 95, 0.38, 0.22);
    this.synthNoiseBurst(now, 0.25, 3900, 0.14);
    const shardFreqs = [1318.5, 1174.66, 987.77, 880, 659.25];
    shardFreqs.forEach((f, idx) => {
      this.synthTone(now + 0.12 + idx * 0.055, f, 'sine', 0.24, 0.08);
    });
  }

  // --- Low-Level Synth Primitives ---

  private synthTone(
    startTime: number,
    freq: number,
    type: OscillatorType,
    duration: number,
    volume: number,
    filterFreq?: number
  ): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);

    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.0008, startTime + duration);

    if (filterFreq) {
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(filterFreq, startTime);
      osc.connect(filter);
      filter.connect(gain);
    } else {
      osc.connect(gain);
    }

    gain.connect(this.ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration);
  }

  private synthKick(startTime: number, startFreq: number, duration: number, volume: number): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(startFreq, startTime);
    osc.frequency.exponentialRampToValueAtTime(28, startTime + duration);
    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration);
  }

  private synthNoiseBurst(startTime: number, duration: number, centerFreq: number, volume: number): void {
    if (!this.ctx) return;
    const bufferSize = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(centerFreq, startTime);
    filter.Q.setValueAtTime(1.4, startTime);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    noise.start(startTime);
    noise.stop(startTime + duration);
  }
}

export const soundEngine = new SoundEngine();

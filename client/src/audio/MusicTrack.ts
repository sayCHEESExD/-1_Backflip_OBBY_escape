import { createNoiseBuffer, envelope, midiToFreq } from './Synth.js';

/** Tempo. Fast enough to push, slow enough to read the route. */
const BPM = 152;

/** Sixteenth notes. */
const STEP_SECONDS = 60 / BPM / 4;

/** Four bars of sixteenths before the pattern repeats. */
const PATTERN_STEPS = 64;

/** How far ahead notes are scheduled, and how often the scheduler wakes. */
const LOOKAHEAD_SECONDS = 0.16;
const TICK_MS = 25;

/**
 * Chord roots, one per bar: Am - F - C - G.
 *
 * MIDI numbers. A minor with a major-key turnaround is the most arcade-sounding
 * progression there is - driving without being bleak.
 */
const ROOTS = [57, 53, 48, 55] as const;

/** Minor pentatonic, in semitones. Nothing in it can clash with the roots. */
const PENTATONIC = [0, 3, 5, 7, 10] as const;

/** Which sixteenths the bass plays. A busy, syncopated drive. */
const BASS_GATE = [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0] as const;

/** Octave lift on the bass, so the line moves instead of hammering one note. */
const BASS_LIFT = [0, 0, 0, 12, 0, 0, 0, 7, 0, 0, 0, 12, 0, 7, 0, 0] as const;

/** Which sixteenths carry the lead arpeggio. */
const LEAD_GATE = [1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 1] as const;

/**
 * The background track: a four-bar arcade loop, synthesised note by note.
 *
 * There is no audio file and no seam. A lookahead scheduler emits notes a
 * fraction of a second ahead of the clock and the step counter simply wraps,
 * so the loop point is not a splice - it is just the next bar.
 *
 * Scheduling is deliberately driven by `setInterval` rather than the render
 * loop: audio timing must not wobble with frame rate, and the Web Audio clock
 * the notes are scheduled against is independent of it.
 */
/** The level this track was mixed at, under the effects. */
const BASE_LEVEL = 0.34;

export class MusicTrack {
  private readonly ctx: AudioContext;
  private readonly bus: GainNode;
  private readonly noise: AudioBuffer;

  private step = 0;
  private nextNoteTime = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(ctx: AudioContext, destination: AudioNode) {
    this.ctx = ctx;
    this.noise = createNoiseBuffer(ctx);

    // The music sits under the effects, so a landing always cuts through.
    this.bus = ctx.createGain();
    this.bus.gain.value = BASE_LEVEL;
    this.bus.connect(destination);
  }

  /**
   * Music level, independent of the master.
   *
   * The portal offers separate master and music sliders, so the track needs a
   * level of its own - scaling the master would move the effects with it.
   * `BASE_LEVEL` is the mix this track was written at; the setting is a
   * multiplier on it rather than an absolute, so "100%" still means the level
   * the game was tuned for.
   */
  setLevel(level01: number): void {
    const clamped = Number.isFinite(level01) ? Math.min(Math.max(level01, 0), 1) : 1;
    this.bus.gain.value = BASE_LEVEL * clamped;
  }

  start(): void {
    if (this.timer !== null) return;
    this.nextNoteTime = this.ctx.currentTime + 0.08;
    this.timer = setInterval(() => this.schedule(), TICK_MS);
  }

  stop(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  dispose(): void {
    this.stop();
    this.bus.disconnect();
  }

  /** Emit every note that falls inside the lookahead window. */
  private schedule(): void {
    const horizon = this.ctx.currentTime + LOOKAHEAD_SECONDS;
    while (this.nextNoteTime < horizon) {
      this.emit(this.step, this.nextNoteTime);
      this.nextNoteTime += STEP_SECONDS;
      this.step = (this.step + 1) % PATTERN_STEPS;
    }
  }

  private emit(step: number, time: number): void {
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const root = ROOTS[bar] ?? ROOTS[0];

    // --- Drums ---
    if (s % 4 === 0) this.kick(time);
    if (s === 4 || s === 12) this.snare(time);
    if (s % 2 === 0) this.hat(time, s % 4 === 0 ? 0.1 : 0.16);
    // A pickup into the top of the loop.
    if (step === 62 || step === 63) this.snare(time, 0.5);

    // --- Bass ---
    if (BASS_GATE[s] === 1) {
      this.bass(time, midiToFreq(root - 12 + (BASS_LIFT[s] ?? 0)));
    }

    // --- Lead ---
    if (LEAD_GATE[s] === 1) {
      const degree = PENTATONIC[(s + bar) % PENTATONIC.length] ?? 0;
      const octave = s >= 8 ? 12 : 0;
      this.lead(time, midiToFreq(root + 12 + degree + octave));
    }
  }

  private kick(time: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(46, time + 0.11);

    const gain = envelope(this.ctx, time, 0.9, 0.004, 0.14);
    osc.connect(gain).connect(this.bus);
    osc.start(time);
    osc.stop(time + 0.2);
  }

  private snare(time: number, level = 1): void {
    const source = this.ctx.createBufferSource();
    source.buffer = this.noise;

    const band = this.ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1900;
    band.Q.value = 0.8;

    const gain = envelope(this.ctx, time, 0.32 * level, 0.003, 0.11);
    source.connect(band).connect(gain).connect(this.bus);
    source.start(time);
    source.stop(time + 0.14);
  }

  private hat(time: number, level: number): void {
    const source = this.ctx.createBufferSource();
    source.buffer = this.noise;
    // Start part-way in so successive hats are not identical slices.
    source.playbackRate.value = 1.4;

    const high = this.ctx.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = 7800;

    const gain = envelope(this.ctx, time, level, 0.002, 0.035);
    source.connect(high).connect(gain).connect(this.bus);
    source.start(time);
    source.stop(time + 0.05);
  }

  private bass(time: number, freq: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq;

    // Rolled off hard, so the square reads as weight rather than buzz.
    const low = this.ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 900;
    low.Q.value = 0.7;

    const gain = envelope(this.ctx, time, 0.34, 0.005, 0.1);
    osc.connect(low).connect(gain).connect(this.bus);
    osc.start(time);
    osc.stop(time + 0.14);
  }

  private lead(time: number, freq: number): void {
    // Two saws a few cents apart: the detune is what stops a single oscillator
    // sounding like a test tone.
    for (const detune of [-7, 7]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      osc.detune.value = detune;

      const low = this.ctx.createBiquadFilter();
      low.type = 'lowpass';
      low.frequency.setValueAtTime(4200, time);
      low.frequency.exponentialRampToValueAtTime(1500, time + 0.1);

      const gain = envelope(this.ctx, time, 0.1, 0.004, 0.1);
      osc.connect(low).connect(gain).connect(this.bus);
      osc.start(time);
      osc.stop(time + 0.14);
    }
  }
}

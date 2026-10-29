/** Tiny practice sound effects synthesized with Web Audio (no audio files, no network). */
export type SoundName = 'correct' | 'wrong' | 'complete';

export interface Sounds {
  /** Call from a user-gesture handler: the audio context is created on the first play. Never throws. */
  play(name: SoundName): void;
  /** Release the audio context (call on unmount). A later play creates a new one. Never throws. */
  close(): void;
}

interface ParamLike {
  value: number;
  setValueAtTime(v: number, t: number): unknown;
  linearRampToValueAtTime(v: number, t: number): unknown;
  exponentialRampToValueAtTime(v: number, t: number): unknown;
}
interface NodeLike {
  connect(dest: unknown): unknown;
}
export interface AudioContextLike {
  currentTime: number;
  state?: string;
  destination: unknown;
  resume?: () => Promise<unknown>;
  close?: () => Promise<unknown> | void;
  createOscillator(): NodeLike & { type: string; frequency: ParamLike; start(t?: number): void; stop(t?: number): void };
  createGain(): NodeLike & { gain: ParamLike };
}

interface Note {
  /** Hz */
  f: number;
  /** Start offset (s) */
  at: number;
  /** Duration (s) */
  d: number;
  type: 'sine' | 'triangle' | 'square' | 'sawtooth';
  vol: number;
}

/** Peak gains stay at or below 0.2: noticeable, never loud. */
const PATTERNS: Record<SoundName, Note[]> = {
  // Two rising notes (E5 → A5).
  correct: [
    { f: 659.25, at: 0, d: 0.11, type: 'sine', vol: 0.16 },
    { f: 880, at: 0.09, d: 0.16, type: 'sine', vol: 0.16 },
  ],
  // A low, soft buzz.
  wrong: [{ f: 155.56, at: 0, d: 0.22, type: 'triangle', vol: 0.18 }],
  // A little major arpeggio (C5 E5 G5 C6).
  complete: [
    { f: 523.25, at: 0, d: 0.14, type: 'sine', vol: 0.14 },
    { f: 659.25, at: 0.1, d: 0.14, type: 'sine', vol: 0.14 },
    { f: 783.99, at: 0.2, d: 0.14, type: 'sine', vol: 0.14 },
    { f: 1046.5, at: 0.3, d: 0.32, type: 'sine', vol: 0.15 },
  ],
};

function defaultContext(): AudioContextLike | null {
  const g = globalThis as { AudioContext?: new () => AudioContextLike; webkitAudioContext?: new () => AudioContextLike };
  const Ctor = g.AudioContext ?? g.webkitAudioContext;
  return Ctor ? new Ctor() : null;
}

export function createSounds(opts: {
  enabled: () => boolean;
  createContext?: () => AudioContextLike | null;
}): Sounds {
  let ctx: AudioContextLike | null = null;
  let failed = false;
  const create = opts.createContext ?? defaultContext;

  return {
    play(name) {
      try {
        if (!opts.enabled() || failed) return;
        if (!ctx) {
          ctx = create();
          if (!ctx) {
            failed = true;
            return;
          }
        }
        if (ctx.state === 'suspended') void ctx.resume?.().catch(() => undefined);
        const t0 = ctx.currentTime + 0.01;
        for (const n of PATTERNS[name]) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = n.type;
          osc.frequency.setValueAtTime(n.f, t0 + n.at);
          gain.gain.setValueAtTime(0.0001, t0 + n.at);
          gain.gain.linearRampToValueAtTime(n.vol, t0 + n.at + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + n.d);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(t0 + n.at);
          osc.stop(t0 + n.at + n.d + 0.02);
        }
      } catch {
        failed = true; // no audio on this device: stay quiet
      }
    },
    close() {
      const c = ctx;
      ctx = null;
      if (!c) return;
      try {
        const p = c.close?.();
        if (p && typeof (p as Promise<unknown>).catch === 'function') void (p as Promise<unknown>).catch(() => undefined);
      } catch {
        // already closed or unsupported: nothing to release
      }
    },
  };
}

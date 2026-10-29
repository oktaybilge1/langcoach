import { describe, expect, it, vi } from 'vitest';
import { createSounds } from '../src/lib/sound';

function fakeContext() {
  const oscillators: { frequency: number[]; type: string; started: number; stopped: number }[] = [];
  const gains: number[] = [];
  const param = (log?: number[]) => ({
    value: 0,
    setValueAtTime: vi.fn((v: number) => log?.push(v)),
    linearRampToValueAtTime: vi.fn((v: number) => log?.push(v)),
    exponentialRampToValueAtTime: vi.fn((v: number) => log?.push(v)),
  });
  const ctx = {
    currentTime: 0,
    state: 'running',
    destination: {},
    resume: vi.fn(async () => undefined),
    createOscillator: vi.fn(() => {
      const o = { frequency: [] as number[], type: '', started: 0, stopped: 0 };
      oscillators.push(o);
      return {
        set type(v: string) {
          o.type = v;
        },
        frequency: param(o.frequency),
        connect: vi.fn(),
        start: vi.fn(() => {
          o.started++;
        }),
        stop: vi.fn(() => {
          o.stopped++;
        }),
      };
    }),
    createGain: vi.fn(() => ({ gain: param(gains), connect: vi.fn() })),
  };
  return { ctx, oscillators, gains };
}

describe('sound effects', () => {
  it('creates the audio context lazily, on the first play', () => {
    const f = fakeContext();
    const create = vi.fn(() => f.ctx);
    const s = createSounds({ enabled: () => true, createContext: create });
    expect(create).not.toHaveBeenCalled();
    s.play('correct');
    s.play('wrong');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('correct = two rising notes, wrong = one low tone, complete = an arpeggio', () => {
    const f = fakeContext();
    const s = createSounds({ enabled: () => true, createContext: () => f.ctx });
    s.play('correct');
    const correct = f.oscillators.splice(0);
    expect(correct).toHaveLength(2);
    expect(correct[1]!.frequency[0]!).toBeGreaterThan(correct[0]!.frequency[0]!);
    s.play('wrong');
    const wrong = f.oscillators.splice(0);
    expect(wrong).toHaveLength(1);
    expect(wrong[0]!.frequency[0]!).toBeLessThan(correct[0]!.frequency[0]!);
    s.play('complete');
    const complete = f.oscillators.splice(0);
    expect(complete.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < complete.length; i++) {
      expect(complete[i]!.frequency[0]!).toBeGreaterThan(complete[i - 1]!.frequency[0]!);
    }
    for (const o of [...correct, ...wrong, ...complete]) expect([o.started, o.stopped]).toEqual([1, 1]);
  });

  it('keeps the volume modest', () => {
    const f = fakeContext();
    createSounds({ enabled: () => true, createContext: () => f.ctx }).play('complete');
    expect(Math.max(...f.gains)).toBeLessThanOrEqual(0.2);
  });

  it('plays nothing (and creates no context) when sound effects are off', () => {
    const create = vi.fn(() => fakeContext().ctx);
    const s = createSounds({ enabled: () => false, createContext: create });
    s.play('correct');
    expect(create).not.toHaveBeenCalled();
  });

  it('close() closes the audio context once; a later play creates a fresh one', () => {
    const f = fakeContext();
    const close = vi.fn(async () => undefined);
    const create = vi.fn(() => ({ ...f.ctx, close }));
    const s = createSounds({ enabled: () => true, createContext: create });
    s.close(); // nothing created yet: no-op
    expect(close).not.toHaveBeenCalled();
    s.play('correct');
    s.close();
    s.close();
    expect(close).toHaveBeenCalledTimes(1);
    s.play('wrong');
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('close() never throws, even if the context refuses', () => {
    const f = fakeContext();
    const s = createSounds({
      enabled: () => true,
      createContext: () => ({
        ...f.ctx,
        close: () => {
          throw new Error('nope');
        },
      }),
    });
    s.play('correct');
    expect(() => s.close()).not.toThrow();
    const r = createSounds({ enabled: () => true, createContext: () => ({ ...f.ctx, close: () => Promise.reject(new Error('x')) }) });
    r.play('correct');
    expect(() => r.close()).not.toThrow();
  });

  it('never throws without Web Audio', () => {
    const s = createSounds({ enabled: () => true, createContext: () => null });
    expect(() => s.play('correct')).not.toThrow();
    const t = createSounds({
      enabled: () => true,
      createContext: () => {
        throw new Error('no audio');
      },
    });
    expect(() => t.play('wrong')).not.toThrow();
  });
});

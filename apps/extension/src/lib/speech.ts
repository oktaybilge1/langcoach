/** Text-to-speech helpers on top of the browser's speechSynthesis (voices are local or the browser's own). */

export interface Speech {
  /** True when a voice for this BCP-47 language exists. */
  canSpeak(bcp47: string): boolean;
  speak(text: string, bcp47: string): void;
}

const synth = (): SpeechSynthesis | null =>
  typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.speechSynthesis?.speak === 'function'
    ? window.speechSynthesis
    : null;

const baseOf = (tag: string) => tag.toLowerCase().split(/[-_]/)[0] ?? '';

export function hasVoiceFor(bcp47: string, voices: { lang: string }[] | null | undefined): boolean {
  if (!bcp47 || bcp47 === 'und' || !voices?.length) return false;
  const want = baseOf(bcp47);
  return voices.some((v) => baseOf(v.lang ?? '') === want);
}

/** Starts loading the voice list early (Chrome fills it asynchronously). */
export function warmVoices(): void {
  try {
    synth()?.getVoices();
  } catch {
    /* ignore */
  }
}

export const browserSpeech: Speech = {
  canSpeak(bcp47) {
    try {
      return hasVoiceFor(bcp47, synth()?.getVoices());
    } catch {
      return false;
    }
  },
  speak(text, bcp47) {
    const s = synth();
    if (!s || !text) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      if (bcp47 && bcp47 !== 'und') u.lang = bcp47;
      s.cancel();
      s.speak(u);
    } catch {
      /* ignore speech errors */
    }
  },
};

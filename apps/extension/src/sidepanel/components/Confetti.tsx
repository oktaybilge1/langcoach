import { useEffect, useMemo, useState } from 'preact/hooks';

const COLORS = ['#1a56db', '#0f7b4c', '#f59e0b', '#e11d48', '#7c3aed', '#06b6d4'];
const PIECES = 36;
const DURATION_MS = 1600;

export function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** A short burst of CSS confetti (~1.5 s), then nothing. Render it only when motion is welcome. */
export function Confetti() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => setOn(false), DURATION_MS + 200);
    return () => clearTimeout(id);
  }, []);
  const pieces = useMemo(
    () =>
      Array.from({ length: PIECES }, (_, i) => ({
        left: (i * 97) % 100,
        delay: ((i * 37) % 30) / 100,
        drift: ((i * 53) % 120) - 60,
        spin: ((i * 71) % 540) + 180,
        color: COLORS[i % COLORS.length],
        w: 6 + (i % 3) * 2,
      })),
    [],
  );
  if (!on) return null;
  return (
    <div class="confetti" data-testid="confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <span
          key={i}
          class="confetti-piece"
          style={{
            left: `${p.left}%`,
            background: p.color,
            width: `${p.w}px`,
            animationDelay: `${p.delay}s`,
            '--drift': `${p.drift}px`,
            '--spin': `${p.spin}deg`,
          }}
        />
      ))}
    </div>
  );
}

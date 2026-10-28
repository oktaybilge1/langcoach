import type { TranslateFn } from '../i18n';

export const MAX_STRENGTH = 5;

/** Five small bars; `value` 0–5 (lib/strength). Exposed as an ARIA meter. */
export function StrengthMeter({ value, t }: { value: number; t: TranslateFn }) {
  const v = Math.max(0, Math.min(MAX_STRENGTH, Math.round(value)));
  const label = t('strengthLabel', [String(v), String(MAX_STRENGTH)]);
  return (
    <span
      class={`strength s${v}`}
      role="meter"
      data-testid="strength-meter"
      data-strength={String(v)}
      aria-valuemin={0}
      aria-valuemax={MAX_STRENGTH}
      aria-valuenow={v}
      aria-label={label}
      title={label}
    >
      {Array.from({ length: MAX_STRENGTH }, (_, i) => (
        <span key={i} class={`strength-bar ${i < v ? 'on' : ''}`} aria-hidden="true" />
      ))}
    </span>
  );
}

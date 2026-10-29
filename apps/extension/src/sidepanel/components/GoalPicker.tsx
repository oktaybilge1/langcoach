import { DAILY_GOALS, type DailyGoalXp } from '@langcoach/core/browser';
import type { TranslateFn } from '../i18n';

const NAMES: Record<DailyGoalXp, { key: string; icon: string }> = {
  10: { key: 'goalCasual', icon: '🌱' },
  20: { key: 'goalRegular', icon: '🚶' },
  30: { key: 'goalSerious', icon: '🏃' },
  50: { key: 'goalIntense', icon: '🚀' },
};

/** Daily XP goal: Casual 10 / Regular 20 / Serious 30 / Intense 50, as a native radio group. */
export function GoalPicker({
  name,
  value,
  onChange,
  t,
}: {
  name: string;
  value: DailyGoalXp;
  onChange: (goal: DailyGoalXp) => void;
  t: TranslateFn;
}) {
  return (
    <fieldset class="goal-picker" role="radiogroup" data-testid="goal-picker" aria-labelledby={`${name}-legend`}>
      <legend id={`${name}-legend`}>{t('goalPickerLabel')}</legend>
      {DAILY_GOALS.map((g) => (
        <label key={g} class={`goal-option ${value === g ? 'active' : ''}`}>
          <input
            type="radio"
            name={name}
            value={String(g)}
            checked={value === g}
            data-testid={`goal-option-${g}`}
            onChange={() => onChange(g)}
          />
          <span class="goal-icon" aria-hidden="true">
            {NAMES[g].icon}
          </span>
          <span class="goal-name">{t(NAMES[g].key)}</span>
          <span class="goal-xp muted">{t('goalXpPerDay', String(g))}</span>
        </label>
      ))}
    </fieldset>
  );
}

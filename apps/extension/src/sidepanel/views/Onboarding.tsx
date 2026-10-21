import type { Cefr } from '@langcoach/core/browser';
import { useState } from 'preact/hooks';
import { LLL_LANGUAGES, resolveLanguage } from '../../lib/languages';
import { GOALS, suggestThemes, type Goal, type UiLocale } from '../../lib/themes';
import type { ProfileInput, Settings } from '../../shared/messages';
import type { PanelSend } from '../App';
import type { TranslateFn } from '../i18n';

const NATIVE_LANGUAGES = [
  'English',
  'Turkish',
  'Spanish',
  'French',
  'Portuguese',
  'German',
  'Arabic',
  'Chinese',
  'Japanese',
  'Korean',
  'Russian',
  'Hindi',
  'Italian',
  'Other',
];

const MINUTE_OPTIONS = [5, 10, 15, 20, 30] as const;
const DAY_OPTIONS = [1, 2, 3, 4, 5, 6, 7] as const;

export interface OnboardingProps {
  settings: Settings;
  uiLocale: UiLocale;
  t: TranslateFn;
  send: PanelSend;
  onComplete: () => Promise<void>;
}

export function Onboarding({ settings, uiLocale, t, send, onComplete }: OnboardingProps) {
  const prefilledTarget = (() => {
    if (settings.pendingTargetLanguage) {
      const resolved = resolveLanguage(settings.pendingTargetLanguage).label;
      if (LLL_LANGUAGES.some((l) => l.label === resolved)) return resolved;
    }
    return 'Spanish (Spain)';
  })();

  const [targetLanguage, setTargetLanguage] = useState(prefilledTarget);
  const [nativeLanguage, setNativeLanguage] = useState('English');
  const [level, setLevel] = useState<Cefr | 'unsure'>('A1');
  const [goal, setGoal] = useState<Goal>('travel');
  const [minutesPerDay, setMinutesPerDay] = useState<number>(15);
  const [daysPerWeek, setDaysPerWeek] = useState<number>(5);
  const [hasCamera, setHasCamera] = useState<boolean>(settings.hasCamera);
  const [busy, setBusy] = useState(false);

  const goalLabel = (g: Goal): string => {
    switch (g) {
      case 'travel':
        return t('goalTravel');
      case 'work':
        return t('goalWork');
      case 'study':
        return t('goalStudy');
      case 'moving':
        return t('goalMoving');
      case 'family':
        return t('goalFamily');
      case 'fun':
        return t('goalFun');
    }
  };

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (busy) return;
    const form = e.currentTarget as HTMLFormElement;
    const val = (id: string, fallback: string) =>
      form.querySelector<HTMLSelectElement>(`#${id}`)?.value ?? fallback;
    const camChecked = form.querySelector<HTMLInputElement>('#onboard-camera')?.checked ?? hasCamera;
    const chosenTarget = val('onboard-target', targetLanguage);
    const chosenNative = val('onboard-native', nativeLanguage);
    const chosenLevel = val('onboard-level', level) as Cefr | 'unsure';
    const chosenGoal = val('onboard-goal', goal) as Goal;
    const chosenMinutes = Number(val('onboard-minutes', String(minutesPerDay)));
    const chosenDays = Number(val('onboard-days', String(daysPerWeek)));

    setBusy(true);
    try {
      const resolvedLevel: Cefr = chosenLevel === 'unsure' ? 'A2' : chosenLevel;
      const profile: ProfileInput = {
        nativeLanguage: chosenNative,
        targetLanguage: chosenTarget,
        level: resolvedLevel,
        goal: chosenGoal,
        minutesPerDay: chosenMinutes,
        daysPerWeek: chosenDays,
      };
      await send({ type: 'setProfile', profile });
      await send({ type: 'setSettings', settings: { hasCamera: camChecked } });
      const theme = suggestThemes(chosenGoal, chosenLevel, uiLocale, 0)[0] ?? 'daily conversation';
      await send({ type: 'createPlan', theme });
      await onComplete();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section class="card" aria-labelledby="onboard-heading">
      <h1 id="onboard-heading">{t('onboardTitle')}</h1>
      <p class="muted" style={{ marginBottom: '12px' }}>
        {t('onboardSubtitle')}
      </p>
      <form class="form-grid" data-testid="onboard-form" onSubmit={handleSubmit}>
        <div class="field">
          <label for="onboard-target">{t('fieldTargetLang')}</label>
          <select
            id="onboard-target"
            data-testid="onboard-target"
            value={targetLanguage}
            onChange={(e) => setTargetLanguage((e.currentTarget as HTMLSelectElement).value)}
          >
            {LLL_LANGUAGES.map((l) => (
              <option key={l.label} value={l.label}>
                {l.label}
              </option>
            ))}
          </select>
        </div>

        <div class="field">
          <label for="onboard-native">{t('fieldNativeLang')}</label>
          <select
            id="onboard-native"
            data-testid="onboard-native"
            value={nativeLanguage}
            onChange={(e) => setNativeLanguage((e.currentTarget as HTMLSelectElement).value)}
          >
            {NATIVE_LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            ))}
          </select>
        </div>

        <div class="field">
          <label for="onboard-level">{t('fieldLevel')}</label>
          <select
            id="onboard-level"
            data-testid="onboard-level"
            value={level}
            onChange={(e) => setLevel((e.currentTarget as HTMLSelectElement).value as Cefr | 'unsure')}
          >
            <option value="A1">A1</option>
            <option value="A2">A2</option>
            <option value="B1">B1</option>
            <option value="B2">B2</option>
            <option value="C1">C1</option>
            <option value="C2">C2</option>
            <option value="unsure">{t('levelUnsure')}</option>
          </select>
        </div>

        <div class="field">
          <label for="onboard-goal">{t('fieldGoal')}</label>
          <select
            id="onboard-goal"
            data-testid="onboard-goal"
            value={goal}
            onChange={(e) => setGoal((e.currentTarget as HTMLSelectElement).value as Goal)}
          >
            {GOALS.map((g) => (
              <option key={g} value={g}>
                {goalLabel(g)}
              </option>
            ))}
          </select>
        </div>

        <div class="field">
          <label for="onboard-minutes">{t('fieldMinutes')}</label>
          <select
            id="onboard-minutes"
            data-testid="onboard-minutes"
            value={String(minutesPerDay)}
            onChange={(e) => setMinutesPerDay(Number((e.currentTarget as HTMLSelectElement).value))}
          >
            {MINUTE_OPTIONS.map((m) => (
              <option key={m} value={String(m)}>
                {t('minutesShort', String(m))}
              </option>
            ))}
          </select>
        </div>

        <div class="field">
          <label for="onboard-days">{t('fieldDays')}</label>
          <select
            id="onboard-days"
            data-testid="onboard-days"
            value={String(daysPerWeek)}
            onChange={(e) => setDaysPerWeek(Number((e.currentTarget as HTMLSelectElement).value))}
          >
            {DAY_OPTIONS.map((d) => (
              <option key={d} value={String(d)}>
                {d}
              </option>
            ))}
          </select>
        </div>

        <label class="field-row" for="onboard-camera">
          <input
            id="onboard-camera"
            data-testid="onboard-camera"
            type="checkbox"
            checked={hasCamera}
            onChange={(e) => setHasCamera((e.currentTarget as HTMLInputElement).checked)}
          />
          <span>{t('fieldCamera')}</span>
        </label>

        <button type="submit" class="primary" data-testid="onboard-submit" disabled={busy}>
          {t('btnStartPlan')}
        </button>
      </form>
    </section>
  );
}

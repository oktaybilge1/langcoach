import type { Cefr } from '@langcoach/core/browser';
import { useState } from 'preact/hooks';
import { LLL_LANGUAGES } from '../../lib/languages';
import { GOALS, type Goal } from '../../lib/themes';
import type { Settings as SettingsType, Snapshot } from '../../shared/messages';
import type { PanelSend } from '../App';
import type { TranslateFn } from '../i18n';

export interface SettingsProps {
  snapshot: Snapshot;
  settings: SettingsType;
  t: TranslateFn;
  send: PanelSend;
  onRefresh: () => Promise<void>;
}

export function Settings({ snapshot, settings, t, send, onRefresh }: SettingsProps) {
  const profile = snapshot.profile;
  const [targetLanguage, setTargetLanguage] = useState(profile?.targetLanguage ?? 'Spanish (Spain)');
  const [nativeLanguage, setNativeLanguage] = useState(profile?.nativeLanguage ?? 'English');
  const [level, setLevel] = useState<Cefr>(profile?.level ?? 'A2');
  const [goal, setGoal] = useState<Goal>((profile?.goal as Goal) ?? 'travel');
  const [minutesPerDay, setMinutesPerDay] = useState<number>(profile?.minutesPerDay ?? 15);
  const [daysPerWeek, setDaysPerWeek] = useState<number>(profile?.daysPerWeek ?? 5);
  const [resetStep, setResetStep] = useState<0 | 1 | 2>(0);

  async function handleSaveProfile(e: Event) {
    e.preventDefault();
    await send({
      type: 'setProfile',
      profile: { nativeLanguage, targetLanguage, level, goal, minutesPerDay, daysPerWeek },
    });
    await onRefresh();
  }

  async function updateSetting(patch: Partial<SettingsType>) {
    await send({ type: 'setSettings', settings: patch });
    await onRefresh();
  }

  async function handleExport() {
    const { json } = await send({ type: 'exportData' });
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'langcoach-backup.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportFile(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    const text = await file.text();
    await send({ type: 'importData', json: text });
    await onRefresh();
  }

  async function handleResetClick() {
    if (resetStep < 2) {
      setResetStep((s) => (s + 1) as 0 | 1 | 2);
      return;
    }
    await send({ type: 'reset' });
    setResetStep(0);
    await onRefresh();
  }

  return (
    <div class="form-grid" data-testid="settings-view">
      <h1>{t('settingsHeading')}</h1>

      <section class="card">
        <h2>{t('settingsProfileSection')}</h2>
        <form class="form-grid" onSubmit={handleSaveProfile}>
          <div class="field">
            <label for="set-target">{t('fieldTargetLang')}</label>
            <select
              id="set-target"
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
            <label for="set-level">{t('fieldLevel')}</label>
            <select
              id="set-level"
              value={level}
              onChange={(e) => setLevel((e.currentTarget as HTMLSelectElement).value as Cefr)}
            >
              {(['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const).map((lv) => (
                <option key={lv} value={lv}>
                  {lv}
                </option>
              ))}
            </select>
          </div>

          <div class="field">
            <label for="set-goal">{t('fieldGoal')}</label>
            <select
              id="set-goal"
              value={goal}
              onChange={(e) => setGoal((e.currentTarget as HTMLSelectElement).value as Goal)}
            >
              {GOALS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>

          <div class="field">
            <label for="set-minutes">{t('fieldMinutes')}</label>
            <select
              id="set-minutes"
              value={String(minutesPerDay)}
              onChange={(e) => setMinutesPerDay(Number((e.currentTarget as HTMLSelectElement).value))}
            >
              {[5, 10, 15, 20, 30].map((m) => (
                <option key={m} value={String(m)}>
                  {t('minutesShort', String(m))}
                </option>
              ))}
            </select>
          </div>

          <div class="field">
            <label for="set-days">{t('fieldDays')}</label>
            <select
              id="set-days"
              value={String(daysPerWeek)}
              onChange={(e) => setDaysPerWeek(Number((e.currentTarget as HTMLSelectElement).value))}
            >
              {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                <option key={d} value={String(d)}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <button type="submit" class="primary">
            {t('btnSaveProfile')}
          </button>
        </form>
      </section>

      <section class="card form-grid">
        <h2>{t('settingsPrefsSection')}</h2>

        <label class="field-row" for="pref-autosave">
          <input
            id="pref-autosave"
            data-testid="pref-autosave"
            type="checkbox"
            checked={settings.autoSave}
            onChange={(e) => updateSetting({ autoSave: (e.currentTarget as HTMLInputElement).checked })}
          />
          <span>{t('fieldAutoSave')}</span>
        </label>

        <label class="field-row" for="pref-camera">
          <input
            id="pref-camera"
            type="checkbox"
            checked={settings.hasCamera}
            onChange={(e) => updateSetting({ hasCamera: (e.currentTarget as HTMLInputElement).checked })}
          />
          <span>{t('fieldCamera')}</span>
        </label>

        <div class="field">
          <label for="pref-reminder">{t('fieldReminder')}</label>
          <div class="field-row">
            <input
              id="pref-reminder"
              data-testid="pref-reminder"
              type="time"
              value={settings.reminderTime ?? ''}
              onChange={(e) => {
                const v = (e.currentTarget as HTMLInputElement).value;
                void updateSetting({ reminderTime: v ? v : null });
              }}
            />
            {settings.reminderTime && (
              <button type="button" onClick={() => updateSetting({ reminderTime: null })}>
                {t('reminderOff')}
              </button>
            )}
          </div>
        </div>

        <div class="field">
          <label for="pref-uilang">{t('fieldUiLang')}</label>
          <select
            id="pref-uilang"
            data-testid="pref-uilang"
            value={settings.uiLanguage}
            onChange={(e) => updateSetting({ uiLanguage: (e.currentTarget as HTMLSelectElement).value })}
          >
            <option value="auto">{t('uiLangAuto')}</option>
            <option value="en">English</option>
            <option value="tr">Türkçe</option>
            <option value="es">Español</option>
            <option value="fr">Français</option>
            <option value="pt_BR">Português (Brasil)</option>
          </select>
        </div>
      </section>

      <section class="card form-grid">
        <h2>{t('settingsDataSection')}</h2>
        <div class="theme-actions">
          <button type="button" data-testid="btn-export" onClick={handleExport}>
            {t('btnExport')}
          </button>
          <label class="button" style={{ cursor: 'pointer' }}>
            <span>{t('btnImport')}</span>
            <input
              type="file"
              data-testid="input-import"
              accept="application/json,.json"
              style={{ display: 'none' }}
              onChange={handleImportFile}
            />
          </label>
        </div>

        <button type="button" class="danger" data-testid="btn-reset" onClick={handleResetClick}>
          {resetStep === 0
            ? t('btnReset')
            : resetStep === 1
              ? t('btnResetConfirm1')
              : t('btnResetConfirm2')}
        </button>
      </section>

      <section class="card form-grid">
        <h2>{t('settingsAboutSection')}</h2>
        <p class="muted">v0.1.0</p>
        <p class="muted">{t('aboutDisclaimer')}</p>
        <div class="theme-actions">
          <a href="https://github.com/oktaybilge1/langcoach" target="_blank" rel="noreferrer">
            {t('aboutGithub')}
          </a>
          <span>·</span>
          <a href="https://github.com/sponsors/oktaybilge1" target="_blank" rel="noreferrer">
            {t('aboutSupport')}
          </a>
        </div>
      </section>
    </div>
  );
}

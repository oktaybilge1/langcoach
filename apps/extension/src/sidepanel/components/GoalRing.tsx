/** Daily-goal ring: today's XP against the goal, as an accessible progressbar. */
export function GoalRing({
  value,
  goal,
  size = 56,
  label,
  testId,
}: {
  value: number;
  goal: number;
  size?: number;
  /** Accessible name (e.g. "12 / 20 XP today"). */
  label: string;
  testId?: string;
}) {
  const stroke = Math.max(5, Math.round(size / 9));
  const r = size / 2 - stroke / 2 - 1;
  const c = 2 * Math.PI * r;
  const safeGoal = goal > 0 ? goal : 1;
  const pct = Math.max(0, Math.min(1, value / safeGoal));
  const met = pct >= 1;
  const mid = size / 2;
  return (
    <div
      class={`goal-ring${met ? ' is-met' : ''}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={safeGoal}
      aria-valuenow={Math.min(Math.max(0, value), safeGoal)}
      aria-label={label}
      data-testid={testId}
      style={{ width: `${size}px`, height: `${size}px` }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" focusable="false">
        <circle cx={mid} cy={mid} r={r} class="goal-ring-track" stroke-width={stroke} />
        <circle
          cx={mid}
          cy={mid}
          r={r}
          class="goal-ring-fill"
          stroke-width={stroke}
          stroke-dasharray={`${c}`}
          stroke-dashoffset={`${c * (1 - pct)}`}
          transform={`rotate(-90 ${mid} ${mid})`}
        />
      </svg>
      <span class="goal-ring-text" aria-hidden="true" style={{ fontSize: `${Math.round(size / 4.2)}px` }}>
        {met ? '✓' : `${Math.round(pct * 100)}%`}
      </span>
    </div>
  );
}

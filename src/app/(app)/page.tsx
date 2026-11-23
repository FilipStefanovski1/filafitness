import Link from 'next/link';
import { requireUser } from '@/server/auth';
import { asUser } from '@/server/db';
import { getDay } from '@/server/services/diary';
import { addDays, formatDayLabel, resolveDate, todayIn } from '@/lib/dates';
import { fmtAmount, fmtGrams, fmtKcal, fmtMacro } from '@/lib/nutrition/format';
import { SLOTS, SLOT_LABEL } from '@/lib/nutrition/types';
import { remaining } from '@/lib/nutrition/calc';
import { DatePicker } from '@/components/DatePicker';

export default async function Today({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { userId, profile } = await requireUser();
  const sp = await searchParams;
  const today = todayIn(profile.timezone);
  const date = resolveDate(sp.date, profile.timezone);
  const day = await asUser(userId, (tx) => getDay(tx, date));
  const t = day.totals;
  const kcalLeft = remaining(profile.kcal_target, t.kcal);
  const proteinLeft = remaining(profile.protein_target_g, t.protein_g ?? 0);
  const proteinIncomplete = t.missing.includes('protein_g');

  return (
    <main className="page">
      <header className="mb-4 flex items-center justify-between gap-2" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <Link href={`/?date=${addDays(date, -1)}`} aria-label="Previous day" className="btn-ghost h-12 w-12 px-0">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </Link>
        <div className="flex flex-col items-center">
          <DatePicker date={date} label={formatDayLabel(date, today)} />
          {date !== today && (
            <Link href="/" className="text-xs font-semibold text-accent">
              Back to today
            </Link>
          )}
        </div>
        <Link href={`/?date=${addDays(date, 1)}`} aria-label="Next day" className="btn-ghost h-12 w-12 px-0">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </header>

      <section className="card mb-5 p-4" aria-label="Daily totals">
        <div className="grid grid-cols-2 gap-4">
          <Stat
            label="Calories"
            value={fmtKcal(t.kcal)}
            unit="kcal"
            target={`of ${fmtKcal(profile.kcal_target)}`}
            left={kcalLeft >= 0 ? `${fmtKcal(kcalLeft)} left` : `${fmtKcal(-kcalLeft)} over`}
            pct={t.kcal / profile.kcal_target}
            color="var(--ink)"
          />
          <Stat
            label="Protein"
            value={`${proteinIncomplete ? '≥' : ''}${fmtGrams(t.protein_g ?? 0)}`}
            unit="g"
            target={`of ${fmtGrams(profile.protein_target_g)} g`}
            left={proteinLeft > 0 ? `${proteinIncomplete ? '≤' : ''}${fmtGrams(proteinLeft)} g left` : 'Target reached'}
            pct={(t.protein_g ?? 0) / Math.max(profile.protein_target_g, 1)}
            color="var(--protein)"
          />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-3 text-sm">
          <Small label="Carbs" value={fmtMacro(t, 'carbs_g')} target={profile.carbs_target_g} color="text-carbs" />
          <Small label="Fat" value={fmtMacro(t, 'fat_g')} target={profile.fat_target_g} color="text-fat" />
        </div>
        {day.incompleteEntries > 0 && (
          <p className="mt-3 rounded-xl bg-warn-bg px-3 py-2 text-[13px] text-warn">
            {day.incompleteEntries} {day.incompleteEntries === 1 ? 'entry has' : 'entries have'} unknown{' '}
            {t.missing.map((m) => m.replace('_g', '')).join(', ')}. Those totals are at least the amount shown.
          </p>
        )}
      </section>

      {SLOTS.map((slot) => {
        const s = day.slots[slot];
        return (
          <section key={slot} className="mb-4" aria-label={SLOT_LABEL[slot]}>
            <div className="mb-1.5 flex items-baseline justify-between px-1">
              <h2 className="text-[15px] font-bold">{SLOT_LABEL[slot]}</h2>
              <span className="text-[13px] text-muted">
                {s.entries.length ? `${fmtKcal(s.totals.kcal)} kcal · P ${fmtMacro(s.totals, 'protein_g')}` : ''}
              </span>
            </div>
            <div className="card divide-y divide-line overflow-hidden">
              {s.entries.map((e) => (
                <Link key={e.id} href={`/entry/${e.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2.5 active:bg-line/50">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-medium">{e.name}</span>
                      {e.is_estimate && (
                        <span className="chip-estimate">{e.source_label?.includes('ChatGPT') ? 'ChatGPT' : 'Estimate'}</span>
                      )}
                      {e.source_label === 'Estimated batch yield' && <span className="chip-estimate">Est. yield</span>}
                    </div>
                    <div className="truncate text-[13px] text-muted">
                      {e.kind === 'meal'
                        ? e.components.map((c) => `${c.name} ${fmtAmount(c.amount, c.unit)}`).join(', ')
                        : fmtAmount(e.amount, e.unit) || (e.kind === 'quick' ? 'Quick add' : '')}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{fmtKcal(e.kcal)}</div>
                    <div className={`text-[12px] ${e.missing.includes('protein_g') ? 'font-semibold text-warn' : 'text-protein'}`}>
                      {e.missing.includes('protein_g') && e.protein_g == null ? 'P unknown' : `P ${fmtMacro(e, 'protein_g')}`}
                    </div>
                  </div>
                </Link>
              ))}
              <div className="flex">
                <Link
                  href={`/add?date=${date}&slot=${slot}`}
                  className="flex min-h-12 flex-1 items-center gap-2 px-4 text-[15px] font-semibold text-accent active:bg-line/50"
                >
                  <span className="text-xl leading-none">+</span> Add food
                </Link>
                <Link
                  href={`/copy?date=${date}&slot=${slot}`}
                  className="flex min-h-12 items-center px-4 text-[13px] font-medium text-muted active:bg-line/50"
                >
                  Copy or save
                </Link>
              </div>
            </div>
          </section>
        );
      })}
      <p className="mt-6 text-center text-[12px] text-muted">
        {profile.display_name} · {profile.timezone}
      </p>
    </main>
  );
}

function Stat({
  label,
  value,
  unit,
  target,
  left,
  pct,
  color,
}: {
  label: string;
  value: string;
  unit: string;
  target: string;
  left: string;
  pct: number;
  color: string;
}) {
  const w = Math.max(0, Math.min(1, pct)) * 100;
  return (
    <div>
      <div className="section-title">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-3xl font-bold tracking-tight">{value}</span>
        <span className="text-sm text-muted">{unit}</span>
      </div>
      <div className="text-[12px] text-muted">{target}</div>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-valuenow={Math.round(pct * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label} progress`}
      >
        <div className="h-full rounded-full" style={{ width: `${w}%`, background: pct > 1.05 ? 'var(--warn)' : color }} />
      </div>
      <div className="mt-1 text-[13px] font-semibold">{left}</div>
    </div>
  );
}

function Small({ label, value, target, color }: { label: string; value: string; target: number | null; color: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className={`font-medium ${color}`}>{label}</span>
      <span>
        <b>{value}</b>
        {target != null && <span className="text-muted"> / {fmtGrams(target)} g</span>}
      </span>
    </div>
  );
}

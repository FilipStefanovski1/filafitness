import Link from 'next/link';
import { requireUser } from '@/server/auth';
import { asUser } from '@/server/db';
import { getDay } from '@/server/services/diary';
import { getWater } from '@/server/services/water';
import { loggingStreak } from '@/server/services/streak';
import { addDays, formatDayLabel, resolveDate, todayIn } from '@/lib/dates';
import { fmtAmount, fmtGrams, fmtKcal, fmtMacro } from '@/lib/nutrition/format';
import { SLOTS, SLOT_LABEL, type Macro, type Slot } from '@/lib/nutrition/types';
import { remaining } from '@/lib/nutrition/calc';
import { DatePicker } from '@/components/DatePicker';
import { Ring } from '@/components/Ring';
import { WaterCard } from './_today/WaterCard';

const SLOT_ICON: Record<Slot, string> = {
  breakfast: 'M12 4v2M5.6 6.6l1.4 1.4M4 13h2M18 13h2M17 8l1.4-1.4M7 17a5 5 0 0 1 10 0M3 20h18',
  lunch: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v5l3 2',
  dinner: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z',
  snacks:
    'M14.5 3.5c-2 0-3 1.5-3 1.5M8.5 7.5c-3 0-4.5 2.5-4.5 5.5 0 4 3 8 5.5 8 1 0 1.5-.5 2.5-.5s1.5.5 2.5.5c2.5 0 5.5-4 5.5-8 0-3-1.5-5.5-4.5-5.5-1.5 0-2.5 1-3.5 1s-2-1-3.5-1Z',
};

export default async function Today({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { userId, profile } = await requireUser();
  const sp = await searchParams;
  const today = todayIn(profile.timezone);
  const date = resolveDate(sp.date, profile.timezone);
  const { day, water, streak } = await asUser(userId, async (tx) => ({
    day: await getDay(tx, date),
    water: await getWater(tx, date),
    streak: await loggingStreak(tx, today),
  }));
  const t = day.totals;
  const kcalLeft = remaining(profile.kcal_target, t.kcal);
  const kcalFromMacro = (m: Macro, k: number) => (t[m] ?? 0) * k;
  const macroKcal = kcalFromMacro('protein_g', 4) + kcalFromMacro('carbs_g', 4) + kcalFromMacro('fat_g', 9);
  const pctOf = (m: Macro, k: number) => (macroKcal > 0 ? Math.round((kcalFromMacro(m, k) / macroKcal) * 100) : 0);

  return (
    <main className="page">
      <header className="mb-3 flex items-center justify-between gap-2" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <Link href={`/?date=${addDays(date, -1)}`} aria-label="Previous day" className="btn-ghost h-12 w-12 px-0">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </Link>
        <div className="flex flex-col items-center">
          <DatePicker date={date} label={formatDayLabel(date, today)} />
          {date !== today ? (
            <Link href="/" className="text-xs font-semibold text-accent">
              Back to today
            </Link>
          ) : streak > 0 ? (
            <span className="flex items-center gap-1 text-xs font-semibold text-carbs" aria-label={`${streak} day logging streak`}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                <path d="M13.5 2s.6 3.2-1.9 6.1C9.8 10.2 8 11.6 8 14.6A4 4 0 0 0 12 19a4 4 0 0 0 4-4.2c0-1.5-.8-2.6-.8-2.6s2.8 1 2.8 4.6A6 6 0 0 1 12 22.5 6.5 6.5 0 0 1 5.5 16c0-6 8-8.4 8-14Z" />
              </svg>
              {streak}-day streak
            </span>
          ) : null}
        </div>
        <Link href={`/?date=${addDays(date, 1)}`} aria-label="Next day" className="btn-ghost h-12 w-12 px-0">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </header>

      <section className="card mb-4 overflow-hidden" aria-label="Calories">
        <div className="flex items-center gap-4 p-4">
          <Ring
            pct={t.kcal / profile.kcal_target}
            size={150}
            stroke={13}
            label={`${fmtKcal(t.kcal)} of ${fmtKcal(profile.kcal_target)} kcal eaten`}
          >
            <span className="text-[30px] font-bold leading-none tracking-tight">{fmtKcal(Math.abs(kcalLeft))}</span>
            <span className="mt-1 text-[12px] font-medium text-muted">{kcalLeft >= 0 ? 'kcal left' : 'kcal over'}</span>
          </Ring>
          <dl className="flex-1 space-y-2.5 text-[14px]">
            <Row label="Goal" value={fmtKcal(profile.kcal_target)} />
            <Row label="Food" value={`− ${fmtKcal(t.kcal)}`} />
            <div className="border-t border-line pt-2.5">
              <Row label="Remaining" value={fmtKcal(kcalLeft)} strong warn={kcalLeft < 0} />
            </div>
          </dl>
        </div>
        <div className="grid grid-cols-3 border-t border-line bg-paper">
          <Macro
            label="Protein"
            color="var(--protein)"
            value={fmtMacro(t, 'protein_g')}
            target={profile.protein_target_g}
            amount={t.protein_g ?? 0}
            pct={pctOf('protein_g', 4)}
          />
          <Macro
            label="Carbs"
            color="var(--carbs)"
            value={fmtMacro(t, 'carbs_g')}
            target={profile.carbs_target_g}
            amount={t.carbs_g ?? 0}
            pct={pctOf('carbs_g', 4)}
          />
          <Macro
            label="Fat"
            color="var(--fat)"
            value={fmtMacro(t, 'fat_g')}
            target={profile.fat_target_g}
            amount={t.fat_g ?? 0}
            pct={pctOf('fat_g', 9)}
          />
        </div>
        {day.incompleteEntries > 0 && (
          <p className="border-t border-line bg-warn-bg px-4 py-2 text-[13px] text-warn">
            {day.incompleteEntries} {day.incompleteEntries === 1 ? 'entry has' : 'entries have'} unknown{' '}
            {t.missing.map((m) => m.replace('_g', '')).join(', ')}; those totals are at least what’s shown.
          </p>
        )}
      </section>

      <WaterCard date={date} ml={water} target={profile.water_target_ml} />

      {SLOTS.map((slot) => {
        const s = day.slots[slot];
        return (
          <section key={slot} className="mb-4" aria-label={SLOT_LABEL[slot]}>
            <div className="mb-1.5 flex items-center justify-between px-1">
              <h2 className="flex items-center gap-2 text-[15px] font-bold">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d={SLOT_ICON[slot]} />
                </svg>
                {SLOT_LABEL[slot]}
              </h2>
              <span className="text-[13px] font-semibold">{s.entries.length ? `${fmtKcal(s.totals.kcal)} kcal` : ''}</span>
            </div>
            <div className="card divide-y divide-line overflow-hidden">
              {s.entries.map((e) => (
                <Link key={e.id} href={`/entry/${e.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2.5 active:bg-paper">
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
                  className="flex min-h-12 flex-1 items-center gap-2 px-4 text-[15px] font-semibold text-accent active:bg-paper"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-white">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </span>
                  Add {SLOT_LABEL[slot].toLowerCase()}
                </Link>
                <Link
                  href={`/copy?date=${date}&slot=${slot}`}
                  className="flex min-h-12 items-center px-4 text-[13px] font-medium text-muted active:bg-paper"
                >
                  Copy / save
                </Link>
              </div>
            </div>
          </section>
        );
      })}

      <Link href={`/history`} className="mt-2 flex min-h-12 items-center justify-center rounded-xl text-sm font-semibold text-accent">
        See weekly averages →
      </Link>
    </main>
  );
}

function Row({ label, value, strong, warn }: { label: string; value: string; strong?: boolean; warn?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className={strong ? 'font-semibold' : 'text-muted'}>{label}</dt>
      <dd className={`${strong ? 'text-lg font-bold' : 'font-semibold'} ${warn ? 'text-warn' : ''}`}>{value}</dd>
    </div>
  );
}

function Macro({
  label,
  color,
  value,
  target,
  amount,
  pct,
}: {
  label: string;
  color: string;
  value: string;
  target: number | null;
  amount: number;
  pct: number;
}) {
  const p = target ? amount / target : 0;
  return (
    <div className="px-3 py-3 text-center">
      <div className="text-[12px] font-semibold" style={{ color }}>
        {label}
      </div>
      <div className="mt-0.5 text-[15px] font-bold">{value}</div>
      <div className="mx-auto mt-1.5 h-1.5 w-full max-w-24 overflow-hidden rounded-full bg-line">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.min(1, target ? p : pct / 100) * 100}%`, background: color }}
        />
      </div>
      <div className="mt-1 text-[11px] text-muted">{target ? `of ${fmtGrams(target)} g` : `${pct}% of kcal`}</div>
    </div>
  );
}

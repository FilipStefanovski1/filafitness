import { requireUser } from '@/server/auth';
import { asUser } from '@/server/db';
import { weeklyAverages } from '@/server/services/history';
import { addDays, formatShortDate, todayIn } from '@/lib/dates';
import { fmtGrams, fmtKcal } from '@/lib/nutrition/format';
import { Header } from '@/components/ui';

export default async function HistoryPage() {
  const { userId, profile } = await requireUser();
  const today = todayIn(profile.timezone);
  const weeks = await asUser(userId, (tx) => weeklyAverages(tx, today, 8));
  return (
    <main className="page">
      <Header title="Weekly averages" back="/weight" />
      <p className="mb-3 text-[13px] text-muted">
        Averages over days with at least one entry. Unlogged days aren’t counted as zero. Targets: {fmtKcal(profile.kcal_target)} kcal ·{' '}
        {fmtGrams(profile.protein_target_g)} g protein.
      </p>
      <ul className="space-y-2">
        {weeks.map((w) => {
          const kcalPct = w.avg_kcal ? w.avg_kcal / profile.kcal_target : 0;
          const pPct = w.avg_protein_g ? w.avg_protein_g / profile.protein_target_g : 0;
          return (
            <li key={w.week_start} className="card p-4">
              <div className="flex items-baseline justify-between">
                <span className="font-semibold">
                  {formatShortDate(w.week_start)} – {formatShortDate(addDays(w.week_start, 6))}
                </span>
                <span className="text-[12px] text-muted">{w.days_logged}/7 days logged</span>
              </div>
              {w.days_logged ? (
                <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
                  <Bar label="kcal/day" value={fmtKcal(w.avg_kcal)} pct={kcalPct} color="var(--ink)" />
                  <Bar
                    label="protein/day"
                    value={`${w.protein_incomplete_days ? '≥' : ''}${fmtGrams(w.avg_protein_g)} g`}
                    pct={pPct}
                    color="var(--protein)"
                  />
                </div>
              ) : (
                <p className="mt-1 text-sm text-muted">No entries.</p>
              )}
              {w.protein_incomplete_days > 0 && (
                <p className="mt-2 text-[12px] text-warn">{w.protein_incomplete_days} day(s) include entries with unknown protein.</p>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}

function Bar({ label, value, pct, color }: { label: string; value: string; pct: number; color: string }) {
  return (
    <div>
      <div>
        <b className="text-base">{value}</b> <span className="text-muted">{label}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 1) * 100}%`, background: color }} />
      </div>
      <div className="text-[11px] text-muted">{Math.round(pct * 100)}% of target</div>
    </div>
  );
}

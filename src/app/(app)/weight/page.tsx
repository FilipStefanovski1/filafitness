import Link from 'next/link';
import { requireUser } from '@/server/auth';
import { asUser } from '@/server/db';
import { weightTrend } from '@/server/services/weight';
import { formatShortDate, todayIn } from '@/lib/dates';
import { WeightForm } from './WeightForm';
import { WeightChart } from './WeightChart';

const kg = (n: number | null | undefined, dp = 1) => (n == null ? '–' : n.toFixed(dp));

export default async function WeightPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { userId, profile } = await requireUser();
  const sp = await searchParams;
  const days = sp.range === '90' ? 90 : sp.range === '14' ? 14 : 42;
  const today = todayIn(profile.timezone);
  const t = await asUser(userId, (tx) => weightTrend(tx, today, days));
  const s = t.summary;
  return (
    <main className="page">
      <header className="mb-3 flex items-center justify-between" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <h1 className="h1">Weight</h1>
        <Link href="/history" className="btn min-h-11 text-sm">
          Weekly averages
        </Link>
      </header>

      <WeightForm today={today} latest={s.latest?.weight_kg ?? null} />

      <section className="card mt-4 p-4" aria-label="Seven-day average">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="section-title">7-day average</div>
            <div className="mt-1 text-3xl font-bold">
              {kg(s.current.average, 2)}
              <span className="text-sm font-normal text-muted"> kg</span>
            </div>
            <div className="text-[12px] text-muted">{s.current.days} of 7 days recorded</div>
          </div>
          <div>
            <div className="section-title">vs previous 7 days</div>
            <div className={`mt-1 text-3xl font-bold ${s.change == null ? 'text-muted' : ''}`}>
              {s.change == null ? '–' : `${s.change > 0 ? '+' : ''}${s.change.toFixed(2)}`}
              {s.change != null && <span className="text-sm font-normal text-muted"> kg</span>}
            </div>
            <div className="text-[12px] text-muted">
              {s.previous.days ? `prev avg ${kg(s.previous.average, 2)} kg (${s.previous.days} days)` : 'Not enough data yet'}
            </div>
          </div>
        </div>
        {(s.current.sparse || (s.previous.days > 0 && s.previous.sparse)) && (
          <p className="mt-3 rounded-xl bg-warn-bg px-3 py-2 text-[13px] text-warn">
            Sparse data: fewer than 4 weigh-ins in a 7-day window, so the average is less reliable. Missing days are skipped, never counted
            as zero.
          </p>
        )}
        {profile.goal_weight_kg && s.current.average != null && (
          <p className="mt-3 text-[13px] text-muted">
            Goal {profile.goal_weight_kg} kg · {(profile.goal_weight_kg - s.current.average).toFixed(1)} kg to go
          </p>
        )}
      </section>

      <section className="card mt-4 p-3">
        <div className="mb-2 flex justify-end gap-1">
          {[14, 42, 90].map((d) => (
            <Link
              key={d}
              href={`/weight?range=${d}`}
              className={`rounded-lg px-3 py-1.5 text-[13px] font-semibold ${days === d ? 'bg-accent text-white' : 'text-muted'}`}
            >
              {d === 42 ? '6w' : d === 14 ? '2w' : '3m'}
            </Link>
          ))}
        </div>
        <WeightChart series={t.series} goal={profile.goal_weight_kg} />
        <div className="mt-2 flex gap-4 px-1 text-[12px] text-muted">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-ink/40" /> weigh-in
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-4 bg-accent" /> 7-day average
          </span>
        </div>
      </section>

      <section className="mt-4">
        <h2 className="section-title mb-2 px-1">Recorded</h2>
        <ul className="card divide-y divide-line">
          {t.weights.length === 0 && <li className="p-4 text-center text-sm text-muted">No weigh-ins in this range.</li>}
          {[...t.weights].reverse().map((w) => (
            <li key={w.local_date} className="flex min-h-12 items-center justify-between px-4">
              <span>
                {formatShortDate(w.local_date)} <span className="text-[12px] text-muted">{w.local_date}</span>
              </span>
              <span className="font-semibold">{w.weight_kg} kg</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 px-1 text-[12px] text-muted">
          To edit a day, pick its date above and save a new weight. Your weigh-ins are private.
        </p>
      </section>
    </main>
  );
}

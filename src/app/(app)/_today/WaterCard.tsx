'use client';
import { useOptimistic, useTransition } from 'react';
import { addWaterAction } from '@/app/actions';

export function WaterCard({ date, ml, target }: { date: string; ml: number; target: number }) {
  const [pending, start] = useTransition();
  const [value, setValue] = useOptimistic(ml);
  const add = (d: number) =>
    start(async () => {
      setValue(Math.max(0, value + d));
      await addWaterAction(date, d);
    });
  const pct = target ? Math.min(1, value / target) : 0;
  const glasses = Math.round(value / 250);
  return (
    <section className="card mb-5 p-4" aria-label="Water">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2.7c-.3 0-.6.2-.8.4C9.4 5.4 5.5 10.4 5.5 14.3a6.5 6.5 0 0 0 13 0c0-3.9-3.9-8.9-5.7-11.2a1 1 0 0 0-.8-.4Z" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between">
            <span className="font-semibold">Water</span>
            <span className="text-[13px] text-muted">
              <b className="text-ink">{Number((value / 1000).toFixed(2))} L</b> / {Number((target / 1000).toFixed(2))} L · {glasses} glass
              {glasses === 1 ? '' : 'es'}
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${pct * 100}%` }} />
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <button className="btn min-h-11 text-sm" disabled={pending || value <= 0} onClick={() => add(-250)} aria-label="Remove 250 mL">
          −250 mL
        </button>
        <button className="btn min-h-11 text-sm" onClick={() => add(250)} aria-label="Add a 250 mL glass">
          + Glass
        </button>
        <button className="btn min-h-11 text-sm" onClick={() => add(500)} aria-label="Add 500 mL bottle">
          + 500 mL
        </button>
      </div>
    </section>
  );
}

'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { copyEntriesAction, saveEntriesAsMealAction } from '@/app/actions';
import { useAction } from '@/components/useAction';
import { ErrorText, Header } from '@/components/ui';
import { SlotPicker } from '@/components/SlotPicker';
import { fmtKcal, fmtMacro } from '@/lib/nutrition/format';
import { SLOTS, SLOT_LABEL, type Slot } from '@/lib/nutrition/types';
import type { DayView } from '@/server/services/diary';

export function CopyEntries({
  date,
  slot: s0,
  from,
  source,
  target,
}: {
  date: string;
  slot: Slot;
  from: string;
  source: DayView;
  target: DayView;
}) {
  const router = useRouter();
  const { run, pending, error } = useAction();
  const [mode, setMode] = useState<'copy' | 'meal'>('copy');
  const [slot, setSlot] = useState(s0);
  const [sel, setSel] = useState<string[]>([]);
  const [mealName, setMealName] = useState('');
  const day = mode === 'copy' ? source : target;
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <main className="page">
      <Header title={mode === 'copy' ? 'Copy from another day' : 'Save as meal'} back={`/?date=${date}`} />
      <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-line/60 p-1">
        {(['copy', 'meal'] as const).map((m) => (
          <button
            key={m}
            className={`min-h-10 rounded-lg text-sm font-semibold ${mode === m ? 'bg-card shadow-sm' : 'text-muted'}`}
            onClick={() => {
              setMode(m);
              setSel([]);
            }}
          >
            {m === 'copy' ? 'Copy to this day' : 'Save entries as meal'}
          </button>
        ))}
      </div>

      {mode === 'copy' && (
        <div className="mb-3">
          <label className="label" htmlFor="from">
            Copy from
          </label>
          <input
            id="from"
            type="date"
            className="input"
            value={from}
            onChange={(e) => e.target.value && router.replace(`/copy?date=${date}&slot=${s0}&from=${e.target.value}`)}
          />
        </div>
      )}
      {mode === 'meal' && (
        <p className="mb-3 text-sm text-muted">
          Pick entries from {date} to turn into a reusable meal. Items without a saved food are saved as foods first.
        </p>
      )}

      <div className="space-y-3">
        {SLOTS.map((s) => {
          const es = day.slots[s].entries;
          if (!es.length) return null;
          const all = es.every((e) => sel.includes(e.id));
          return (
            <section key={s} className="card overflow-hidden">
              <button
                className="flex min-h-12 w-full items-center justify-between px-4 text-left font-semibold"
                onClick={() =>
                  setSel((cur) => (all ? cur.filter((id) => !es.some((e) => e.id === id)) : [...new Set([...cur, ...es.map((e) => e.id)])]))
                }
              >
                {SLOT_LABEL[s]} <span className="text-sm text-accent">{all ? 'Clear' : 'Select all'}</span>
              </button>
              <ul className="divide-y divide-line border-t border-line">
                {es.map((e) => (
                  <li key={e.id}>
                    <label className="flex min-h-12 items-center gap-3 px-4 py-2">
                      <input
                        type="checkbox"
                        className="h-5 w-5 accent-[var(--accent)]"
                        checked={sel.includes(e.id)}
                        onChange={() => toggle(e.id)}
                      />
                      <span className="min-w-0 flex-1 truncate">{e.name}</span>
                      <span className="text-sm text-muted">
                        {fmtKcal(e.kcal)} kcal · P {fmtMacro(e, 'protein_g')}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        {day.entries.length === 0 && (
          <p className="card p-6 text-center text-sm text-muted">No entries on {mode === 'copy' ? from : date}.</p>
        )}
      </div>

      <div className="card mt-4 space-y-3 p-4">
        {mode === 'copy' ? (
          <>
            <p className="text-sm">
              Copy {sel.length} selected to <b>{date}</b>:
            </p>
            <SlotPicker value={slot} onChange={setSlot} />
            <ErrorText error={error} />
            <button
              className="btn-primary w-full"
              disabled={pending || sel.length === 0}
              onClick={() =>
                run(
                  () => copyEntriesAction({ ids: sel, date, slot }),
                  () => router.push(`/?date=${date}`),
                )
              }
            >
              {pending ? 'Copying…' : `Copy ${sel.length} entr${sel.length === 1 ? 'y' : 'ies'}`}
            </button>
            <button
              className="btn w-full"
              disabled={pending || sel.length === 0}
              onClick={() =>
                run(
                  () => copyEntriesAction({ ids: sel, date }),
                  () => router.push(`/?date=${date}`),
                )
              }
            >
              Copy keeping original meals
            </button>
          </>
        ) : (
          <>
            <label className="label" htmlFor="mname">
              Meal name
            </label>
            <input
              id="mname"
              className="input"
              value={mealName}
              onChange={(e) => setMealName(e.target.value)}
              placeholder="e.g. Raspberry oats"
            />
            <ErrorText error={error} />
            <button
              className="btn-primary w-full"
              disabled={pending || sel.length === 0 || !mealName.trim()}
              onClick={() =>
                run(
                  () => saveEntriesAsMealAction({ ids: sel, name: mealName, slot: s0 }),
                  (id) => router.push(`/library/meals/${id}`),
                )
              }
            >
              Save {sel.length} as meal
            </button>
          </>
        )}
      </div>
    </main>
  );
}

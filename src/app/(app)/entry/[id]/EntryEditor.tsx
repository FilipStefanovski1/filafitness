'use client';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { copyEntriesAction, deleteEntryAction, saveEntryAsFoodAction, updateEntryAction } from '@/app/actions';
import { useAction } from '@/components/useAction';
import { ErrorText, Header, MacroLine } from '@/components/ui';
import { SlotPicker } from '@/components/SlotPicker';
import { AmountInput } from '@/components/AmountInput';
import { availableUnits, portion, sum } from '@/lib/nutrition/calc';
import { UNIT_LABEL } from '@/lib/nutrition/format';
import type { NutritionTotals, Unit } from '@/lib/nutrition/types';
import type { Entry } from '@/server/services/diary';

const str = (n: number | null | undefined) => (n == null ? '' : String(Math.round(n * 100) / 100));
const num = (s: string) => (s.trim() === '' ? null : Number(s));

export function EntryEditor({ entry }: { entry: Entry }) {
  const router = useRouter();
  const { run, pending, error } = useAction();
  const [date, setDate] = useState(entry.local_date);
  const [slot, setSlot] = useState(entry.slot);
  const [name, setName] = useState(entry.name);
  const [notes, setNotes] = useState(entry.notes ?? '');
  const [assumptions, setAssumptions] = useState(entry.assumptions ?? '');
  const [comps, setComps] = useState(
    entry.components.map((c) => ({
      id: c.id,
      name: c.name,
      spec: c.snapshot,
      amount: str(c.amount ?? 1),
      unit: (c.unit ?? 'serving') as Unit,
    })),
  );
  const direct = entry.components.length === 1 && (entry.kind === 'quick' || entry.kind === 'estimate');
  const [vals, setVals] = useState({
    kcal: str(entry.kcal),
    protein_g: str(entry.protein_g),
    carbs_g: str(entry.carbs_g),
    fat_g: str(entry.fat_g),
  });
  const [editVals, setEditVals] = useState(false);
  const [copyDate, setCopyDate] = useState('');
  const [foodName, setFoodName] = useState(entry.name);
  const [savedFood, setSavedFood] = useState(false);

  const preview = useMemo((): { t?: NutritionTotals; err?: string } => {
    if (editVals)
      return {
        t: {
          kcal: Number(vals.kcal) || 0,
          protein_g: num(vals.protein_g),
          carbs_g: num(vals.carbs_g),
          fat_g: num(vals.fat_g),
          missing: (['protein_g', 'carbs_g', 'fat_g'] as const).filter((m) => num(vals[m]) == null),
        },
      };
    const parts = [];
    for (const c of comps) {
      const p = portion(c.spec, Number(c.amount), c.unit);
      if (!p.ok) return { err: p.reason };
      parts.push(p);
    }
    return { t: sum(parts) };
  }, [comps, vals, editVals]);

  function save() {
    run(
      () =>
        updateEntryAction(entry.id, {
          date,
          slot,
          name,
          notes: notes || null,
          assumptions: assumptions || null,
          ...(editVals
            ? {
                values: {
                  kcal: Number(vals.kcal),
                  protein_g: num(vals.protein_g),
                  carbs_g: num(vals.carbs_g),
                  fat_g: num(vals.fat_g),
                  amount: Number(comps[0].amount),
                  unit: comps[0].unit,
                },
              }
            : { components: comps.map((c) => ({ id: c.id, amount: Number(c.amount), unit: c.unit })) }),
        }),
      () => router.push(`/?date=${date}`),
    );
  }

  return (
    <main className="page">
      <Header title="Edit entry" back={`/?date=${entry.local_date}`} />
      <div className="card space-y-4 p-4">
        <div>
          <label className="label" htmlFor="ename">
            Name
          </label>
          <input id="ename" className="input" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="mt-1 flex flex-wrap gap-1">
            {entry.is_estimate && <span className="chip-estimate">{entry.source_label || 'Estimate'}</span>}
            {!entry.is_estimate && entry.source_label && <span className="chip bg-line text-muted">{entry.source_label}</span>}
            <span className="chip bg-line text-muted">{entry.kind}</span>
          </div>
        </div>

        {comps.map((c, idx) => (
          <div key={c.id} className="flex items-end gap-2">
            <AmountInput
              label={comps.length > 1 ? c.name : 'Amount'}
              value={c.amount}
              onChange={(v) => setComps((cs) => cs.map((x, j) => (j === idx ? { ...x, amount: v } : x)))}
            />
            <select
              aria-label={`${c.name} unit`}
              className="input w-32"
              value={c.unit}
              onChange={(e) => setComps((cs) => cs.map((x, j) => (j === idx ? { ...x, unit: e.target.value as Unit } : x)))}
            >
              {availableUnits(c.spec).map((u) => (
                <option key={u} value={u}>
                  {UNIT_LABEL[u]}
                </option>
              ))}
            </select>
          </div>
        ))}
        <p className="text-[12px] text-muted">
          Amounts recalculate from the nutrition saved with this entry, so later label or recipe edits never change it.
        </p>

        {direct && (
          <div>
            <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
              <input
                type="checkbox"
                className="h-5 w-5 accent-[var(--accent)]"
                checked={editVals}
                onChange={(e) => setEditVals(e.target.checked)}
              />
              Correct calories and macros for this amount
            </label>
            {editVals && (
              <div className="mt-2 grid grid-cols-4 gap-2">
                {(['kcal', 'protein_g', 'carbs_g', 'fat_g'] as const).map((k) => (
                  <AmountInput
                    key={k}
                    label={k === 'kcal' ? 'kcal' : k.replace('_g', '')}
                    value={vals[k]}
                    placeholder="?"
                    onChange={(v) => setVals((x) => ({ ...x, [k]: v }))}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        <div className="rounded-xl bg-paper px-3 py-2">
          {preview.t ? <MacroLine t={preview.t} className="text-[15px]" /> : <span className="text-sm text-warn">{preview.err}</span>}
        </div>

        {(entry.is_estimate || entry.assumptions) && (
          <div>
            <label className="label" htmlFor="assume">
              Portion assumptions
            </label>
            <textarea
              id="assume"
              className="input min-h-16 py-2 text-sm"
              value={assumptions}
              onChange={(e) => setAssumptions(e.target.value)}
            />
          </div>
        )}
        <SlotPicker value={slot} onChange={setSlot} />
        <div>
          <label className="label" htmlFor="edate">
            Date
          </label>
          <input id="edate" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="notes">
            Notes
          </label>
          <input id="notes" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <ErrorText error={error} />
        <button className="btn-primary w-full" disabled={pending || !preview.t} onClick={save}>
          {pending ? 'Saving…' : 'Save changes'}
        </button>
      </div>

      <section className="card mt-4 space-y-3 p-4">
        <h2 className="section-title">More</h2>
        {entry.components.length === 1 && entry.kind !== 'recipe' && (
          <div className="space-y-2">
            {savedFood ? (
              <p className="text-sm font-medium text-good">Saved to your foods ✓</p>
            ) : (
              <div className="flex gap-2">
                <input aria-label="Food name" className="input" value={foodName} onChange={(e) => setFoodName(e.target.value)} />
                <button
                  className="btn shrink-0"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => saveEntryAsFoodAction({ id: entry.id, name: foodName }),
                      () => setSavedFood(true),
                    )
                  }
                >
                  Save as food
                </button>
              </div>
            )}
          </div>
        )}
        <div className="flex gap-2">
          <input aria-label="Copy to date" type="date" className="input" value={copyDate} onChange={(e) => setCopyDate(e.target.value)} />
          <button
            className="btn shrink-0"
            disabled={pending || !copyDate}
            onClick={() =>
              run(
                () => copyEntriesAction({ ids: [entry.id], date: copyDate }),
                () => router.push(`/?date=${copyDate}`),
              )
            }
          >
            Copy to day
          </button>
        </div>
        <button
          className="btn-danger w-full"
          disabled={pending}
          onClick={() => {
            if (confirm(`Delete “${entry.name}” from ${entry.local_date}?`))
              run(
                () => deleteEntryAction(entry.id),
                () => router.push(`/?date=${entry.local_date}`),
              );
          }}
        >
          Delete entry
        </button>
      </section>
    </main>
  );
}

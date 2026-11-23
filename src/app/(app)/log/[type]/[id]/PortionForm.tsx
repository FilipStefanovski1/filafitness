'use client';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { logItemAction } from '@/app/actions';
import { useAction } from '@/components/useAction';
import { ErrorText, Header, MacroLine } from '@/components/ui';
import { SlotPicker } from '@/components/SlotPicker';
import { AmountInput } from '@/components/AmountInput';
import { availableUnits, portion, sum } from '@/lib/nutrition/calc';
import { UNIT_LABEL } from '@/lib/nutrition/format';
import type { NutritionSpec, NutritionTotals, Slot, Unit } from '@/lib/nutrition/types';

export type PortionTarget =
  | {
      type: 'food' | 'recipe';
      id: string;
      name: string;
      spec: NutritionSpec;
      amount: number;
      unit: Unit;
      note: string;
      isEstimate: boolean;
      assumptions: string | null;
    }
  | {
      type: 'meal';
      id: string;
      name: string;
      note: string;
      items: Array<{ id: string; name: string; spec: NutritionSpec; amount: number; unit: Unit }>;
    };

export function PortionForm({ target, date, slot: initialSlot }: { target: PortionTarget; date: string; slot: Slot }) {
  const router = useRouter();
  const [slot, setSlot] = useState(initialSlot);
  const [logDate, setLogDate] = useState(date);
  const { run, pending, error } = useAction();

  // Single food / recipe
  const [amount, setAmount] = useState(target.type !== 'meal' ? String(target.amount) : '');
  const [unit, setUnit] = useState<Unit>(target.type !== 'meal' ? target.unit : 'g');
  // Meal items
  const [items, setItems] = useState(target.type === 'meal' ? target.items.map((i) => ({ ...i, value: String(i.amount) })) : []);
  const [saveDefault, setSaveDefault] = useState(false);

  const preview = useMemo((): { totals?: NutritionTotals; error?: string } => {
    if (target.type !== 'meal') {
      const p = portion(target.spec, Number(amount), unit);
      return p.ok ? { totals: p } : { error: p.reason };
    }
    const parts: NutritionTotals[] = [];
    for (const i of items) {
      const p = portion(i.spec, Number(i.value), i.unit);
      if (!p.ok) return { error: p.reason };
      parts.push(p);
    }
    return { totals: sum(parts) };
  }, [target, amount, unit, items]);

  const changed = target.type === 'meal' && items.some((i) => Number(i.value) !== i.amount);
  const done = () => router.push(`/?date=${logDate}`);

  function submit() {
    if (target.type !== 'meal')
      return run(() => logItemAction({ type: target.type, id: target.id, date: logDate, slot, amount: Number(amount), unit }), done);
    const overrides = Object.fromEntries(
      items.filter((i) => Number(i.value) !== i.amount).map((i) => [i.id, { amount: Number(i.value), unit: i.unit }]),
    );
    run(() => logItemAction({ type: 'meal', id: target.id, date: logDate, slot, overrides, saveAsDefault: saveDefault && changed }), done);
  }

  return (
    <main className="page">
      <Header title={target.name} back={`/add?date=${date}&slot=${initialSlot}`} />
      {target.note && <p className="mb-3 text-sm text-muted">{target.note}</p>}
      {target.type !== 'meal' && target.isEstimate && (
        <p className="mb-3 rounded-xl bg-estimate-bg px-3 py-2 text-[13px] text-estimate">
          <b>Estimate.</b> {target.assumptions || 'Values are estimated, not from a label.'}
        </p>
      )}

      <div className="card space-y-4 p-4">
        {target.type !== 'meal' ? (
          <div className="flex gap-2">
            <AmountInput value={amount} onChange={setAmount} label="Amount" autoFocus />
            <div className="w-36">
              <label className="label" htmlFor="unit">
                Unit
              </label>
              <select id="unit" className="input" value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
                {availableUnits(target.spec).map((u) => (
                  <option key={u} value={u}>
                    {u === 'scoop' || u === 'serving'
                      ? target.spec.servingLabel && u === 'serving'
                        ? `serving (${target.spec.servingLabel})`
                        : UNIT_LABEL[u]
                      : UNIT_LABEL[u]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-[13px] text-muted">Change any amount for this entry only.</p>
            {items.map((i, idx) => (
              <div key={i.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{i.name}</span>
                <input
                  inputMode="decimal"
                  aria-label={`${i.name} amount`}
                  className={`input w-24 text-right ${Number(i.value) !== i.amount ? 'border-accent' : ''}`}
                  value={i.value}
                  onChange={(e) =>
                    setItems((arr) => arr.map((x, j) => (j === idx ? { ...x, value: e.target.value.replace(',', '.') } : x)))
                  }
                />
                <span className="w-14 text-sm text-muted">{UNIT_LABEL[i.unit]}</span>
              </div>
            ))}
            {changed && (
              <label className="mt-2 flex min-h-12 items-center gap-3 rounded-xl bg-line/50 px-3 text-sm">
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-[var(--accent)]"
                  checked={saveDefault}
                  onChange={(e) => setSaveDefault(e.target.checked)}
                />
                Also save these amounts as the new default for “{target.name}”
              </label>
            )}
          </div>
        )}

        <div className="rounded-xl bg-paper px-3 py-2">
          {preview.totals ? (
            <MacroLine t={preview.totals} className="text-[15px]" />
          ) : (
            <span className="text-sm text-warn">{preview.error}</span>
          )}
        </div>

        <SlotPicker value={slot} onChange={setSlot} />
        <div>
          <label className="label" htmlFor="date">
            Date
          </label>
          <input id="date" type="date" className="input" value={logDate} onChange={(e) => setLogDate(e.target.value)} />
        </div>
        <ErrorText error={error} />
        <button className="btn-primary w-full text-base" disabled={pending || !preview.totals} onClick={submit}>
          {pending ? 'Saving…' : 'Log it'}
        </button>
      </div>
    </main>
  );
}

'use client';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { deleteMealAction, saveMealAction } from '@/app/actions';
import { useAction } from '@/components/useAction';
import { ErrorText, Header, MacroLine } from '@/components/ui';
import { ItemPicker } from '@/components/ItemPicker';
import { ShareBox } from '@/components/ShareBox';
import { portion, sum } from '@/lib/nutrition/calc';
import { UNIT_LABEL } from '@/lib/nutrition/format';
import { SLOTS, SLOT_LABEL, type NutritionTotals, type Slot, type Unit } from '@/lib/nutrition/types';
import type { PickData } from '@/server/pickOptions';

interface Row {
  kind: 'food' | 'recipe';
  id: string;
  amount: string;
  unit: Unit;
}
interface Initial {
  name: string;
  aliases: string[];
  default_slot: Slot | null;
  notes: string | null;
  is_favorite: boolean;
  items: Array<{ kind: 'food' | 'recipe'; id: string; amount: number; unit: Unit }>;
}

export function MealForm({
  id,
  initial,
  options,
  recipients,
}: {
  id: string | null;
  initial: Initial | null;
  options: PickData[];
  recipients: { user_id: string; display_name: string }[];
}) {
  const router = useRouter();
  const { run, pending, error } = useAction();
  const [name, setName] = useState(initial?.name ?? '');
  const [aliases, setAliases] = useState((initial?.aliases ?? []).join(', '));
  const [slot, setSlot] = useState<Slot | ''>(initial?.default_slot ?? '');
  const [fav, setFav] = useState(initial?.is_favorite ?? false);
  const [rows, setRows] = useState<Row[]>((initial?.items ?? []).map((i) => ({ ...i, amount: String(i.amount) })));
  const byKey = useMemo(() => new Map(options.map((o) => [`${o.kind}:${o.id}`, o])), [options]);

  const calc = rows.map((r) => {
    const o = byKey.get(`${r.kind}:${r.id}`);
    const p = o ? portion(o.spec, Number(r.amount), r.unit) : null;
    return { o, p };
  });
  const totals: NutritionTotals | null = calc.every((c) => c.p?.ok) && rows.length ? sum(calc.map((c) => c.p as NutritionTotals)) : null;

  function save() {
    run(
      () =>
        saveMealAction(id, {
          name,
          aliases: aliases
            .split(',')
            .map((a) => a.trim())
            .filter(Boolean),
          default_slot: slot || null,
          is_favorite: fav,
          items: rows.map((r) => ({ [r.kind === 'food' ? 'food_id' : 'recipe_id']: r.id, amount: Number(r.amount), unit: r.unit })),
        }),
      () => router.push('/library?tab=meal'),
    );
  }

  return (
    <main className="page">
      <Header title={id ? 'Edit meal' : 'New meal'} back="/library?tab=meal" />
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <section className="card space-y-3 p-4">
          <div>
            <label className="label" htmlFor="mn">
              Name
            </label>
            <input id="mn" className="input" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Raspberry oats" />
          </div>
          <div>
            <label className="label" htmlFor="ma">
              Also known as
            </label>
            <input
              id="ma"
              className="input"
              value={aliases}
              onChange={(e) => setAliases(e.target.value)}
              placeholder="ovesna kasha, овесна каша"
            />
          </div>
          <div>
            <label className="label" htmlFor="ms">
              Usual meal
            </label>
            <select id="ms" className="input" value={slot} onChange={(e) => setSlot(e.target.value as Slot)}>
              <option value="">Any</option>
              {SLOTS.map((s) => (
                <option key={s} value={s}>
                  {SLOT_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="card space-y-3 p-4">
          <h2 className="section-title">Items and default amounts</h2>
          {rows.map((r, idx) => {
            const { o, p } = calc[idx];
            return (
              <div key={idx} className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {o?.name ?? 'Missing item'}
                    {r.kind === 'recipe' && <span className="chip ml-1 bg-line text-muted">recipe</span>}
                  </span>
                  <input
                    aria-label={`${o?.name} amount`}
                    inputMode="decimal"
                    className="input w-20 px-2 text-right"
                    value={r.amount}
                    onChange={(e) =>
                      setRows((rs) => rs.map((x, j) => (j === idx ? { ...x, amount: e.target.value.replace(',', '.') } : x)))
                    }
                  />
                  <select
                    aria-label={`${o?.name} unit`}
                    className="input w-24 px-2"
                    value={r.unit}
                    onChange={(e) => setRows((rs) => rs.map((x, j) => (j === idx ? { ...x, unit: e.target.value as Unit } : x)))}
                  >
                    {(o?.units ?? [r.unit]).map((u) => (
                      <option key={u} value={u}>
                        {UNIT_LABEL[u]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    aria-label="Remove"
                    className="btn-ghost h-12 w-9 px-0 text-muted"
                    onClick={() => setRows((rs) => rs.filter((_, j) => j !== idx))}
                  >
                    ✕
                  </button>
                </div>
                {p && !p.ok && <p className="text-[12px] text-warn">{p.reason}</p>}
              </div>
            );
          })}
          <ItemPicker
            options={options}
            placeholder="Add a food or recipe…"
            onPick={(o) => {
              const d = byKey.get(`${o.kind}:${o.id}`)!;
              setRows((rs) => [...rs, { kind: o.kind, id: o.id, amount: String(d.default_amount), unit: d.default_unit }]);
            }}
          />
          <div className="rounded-xl bg-paper px-3 py-2">
            {totals ? <MacroLine t={totals} /> : <span className="text-sm text-muted">Add items to see totals</span>}
          </div>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={fav} onChange={(e) => setFav(e.target.checked)} />{' '}
            Favorite
          </label>
        </section>
        <ErrorText error={error} />
        <button className="btn-primary w-full" disabled={pending || !name.trim() || !totals}>
          {pending ? 'Saving…' : 'Save meal'}
        </button>
        {id && <p className="text-center text-[12px] text-muted">Changing defaults here affects future logs only.</p>}
      </form>
      {id && <ShareBox type="meal" id={id} recipients={recipients} />}
      {id && (
        <button
          className="btn-danger mt-4 w-full"
          disabled={pending}
          onClick={() =>
            confirm('Delete this meal? Diary entries keep their numbers.') &&
            run(
              () => deleteMealAction(id),
              () => router.push('/library?tab=meal'),
            )
          }
        >
          Delete meal
        </button>
      )}
    </main>
  );
}

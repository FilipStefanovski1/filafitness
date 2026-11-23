'use client';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { deleteRecipeAction, saveRecipeAction } from '@/app/actions';
import { useAction } from '@/components/useAction';
import { ErrorText, Header, MacroLine } from '@/components/ui';
import { ItemPicker } from '@/components/ItemPicker';
import { ShareBox } from '@/components/ShareBox';
import { availableUnits, portion, recipe } from '@/lib/nutrition/calc';
import { UNIT_LABEL } from '@/lib/nutrition/format';
import type { Unit } from '@/lib/nutrition/types';
import type { PickData } from '@/server/pickOptions';

interface Initial {
  name: string;
  aliases: string[];
  yield_unit: 'g' | 'servings';
  yield_amount: number;
  yield_estimated: boolean;
  serving_grams: number | null;
  default_amount: number;
  default_unit: Unit;
  notes: string | null;
  is_favorite: boolean;
  ingredients: Array<{ id: string; amount: number; unit: Unit }>;
}
const clean = (v: string) => v.replace(',', '.').replace(/[^0-9.]/g, '');

export function RecipeForm({
  id,
  initial,
  options,
  recipients,
  source,
}: {
  id: string | null;
  initial: Initial | null;
  options: PickData[];
  recipients: { user_id: string; display_name: string }[];
  source: string | null;
}) {
  const router = useRouter();
  const { run, pending, error } = useAction();
  const [name, setName] = useState(initial?.name ?? '');
  const [aliases, setAliases] = useState((initial?.aliases ?? []).join(', '));
  const [yieldUnit, setYieldUnit] = useState<'g' | 'servings'>(initial?.yield_unit ?? 'g');
  const [yieldAmount, setYieldAmount] = useState(String(initial?.yield_amount ?? ''));
  const [estimated, setEstimated] = useState(initial?.yield_estimated ?? false);
  const [servingGrams, setServingGrams] = useState(initial?.serving_grams ? String(initial.serving_grams) : '');
  const [defAmount, setDefAmount] = useState(String(initial?.default_amount ?? 250));
  const [defUnit, setDefUnit] = useState<Unit>(initial?.default_unit ?? 'g');
  const [fav, setFav] = useState(initial?.is_favorite ?? false);
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [rows, setRows] = useState((initial?.ingredients ?? []).map((i) => ({ ...i, amount: String(i.amount) })));
  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);

  const result = useMemo(() => {
    if (!rows.length || !(Number(yieldAmount) > 0)) return null;
    for (const r of rows) if (!byId.get(r.id)) return null;
    return recipe({
      name: name || 'Recipe',
      yieldUnit,
      yieldAmount: Number(yieldAmount),
      yieldEstimated: estimated,
      servingGrams: servingGrams ? Number(servingGrams) : null,
      ingredients: rows.map((r) => ({ spec: byId.get(r.id)!.spec, amount: Number(r.amount), unit: r.unit })),
    });
  }, [rows, yieldAmount, yieldUnit, estimated, servingGrams, name, byId]);
  const units = result?.ok ? availableUnits(result.spec) : ([yieldUnit === 'g' ? 'g' : 'serving'] as Unit[]);
  const portionPreview = result?.ok ? portion(result.spec, Number(defAmount), defUnit) : null;

  function save() {
    run(
      () =>
        saveRecipeAction(id, {
          name,
          aliases: aliases
            .split(',')
            .map((a) => a.trim())
            .filter(Boolean),
          yield_unit: yieldUnit,
          yield_amount: Number(yieldAmount),
          yield_estimated: estimated,
          serving_grams: servingGrams ? Number(servingGrams) : null,
          default_amount: Number(defAmount),
          default_unit: defUnit,
          notes: notes || null,
          is_favorite: fav,
          ingredients: rows.map((r) => ({ food_id: r.id, amount: Number(r.amount), unit: r.unit })),
        }),
      () => router.push('/library?tab=recipe'),
    );
  }

  return (
    <main className="page">
      <Header title={id ? 'Edit recipe' : 'New recipe'} back="/library?tab=recipe" />
      {source && <p className="mb-3 text-[13px] text-muted">{source}</p>}
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <section className="card space-y-3 p-4">
          <div>
            <label className="label" htmlFor="rn">
              Name
            </label>
            <input
              id="rn"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Homemade podvarok"
            />
          </div>
          <div>
            <label className="label" htmlFor="ra">
              Also known as
            </label>
            <input
              id="ra"
              className="input"
              value={aliases}
              onChange={(e) => setAliases(e.target.value)}
              placeholder="подварок, podvarok"
            />
          </div>
        </section>

        <section className="card space-y-3 p-4">
          <h2 className="section-title">Ingredients (as weighed, raw/dry)</h2>
          {rows.map((r, idx) => {
            const o = byId.get(r.id);
            const p = o ? portion(o.spec, Number(r.amount), r.unit) : null;
            return (
              <div key={idx}>
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-medium">{o?.name ?? 'Missing food'}</span>
                  <input
                    aria-label={`${o?.name} amount`}
                    inputMode="decimal"
                    className="input w-20 px-2 text-right"
                    value={r.amount}
                    onChange={(e) => setRows((rs) => rs.map((x, j) => (j === idx ? { ...x, amount: clean(e.target.value) } : x)))}
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
            placeholder="Add an ingredient…"
            onPick={(o) => {
              const d = byId.get(o.id)!;
              setRows((rs) => [...rs, { id: o.id, amount: String(d.default_amount), unit: d.default_unit }]);
            }}
          />
        </section>

        <section className="card space-y-3 p-4">
          <h2 className="section-title">Finished batch</h2>
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-line/60 p-1">
            {(['g', 'servings'] as const).map((u) => (
              <button
                type="button"
                key={u}
                className={`min-h-10 rounded-lg text-sm font-semibold ${yieldUnit === u ? 'bg-card shadow-sm' : 'text-muted'}`}
                onClick={() => {
                  setYieldUnit(u);
                  setDefUnit(u === 'g' ? 'g' : 'serving');
                  setDefAmount(u === 'g' ? '250' : '1');
                }}
              >
                {u === 'g' ? 'Cooked weight (g)' : 'Number of servings'}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="label" htmlFor="ya">
                {yieldUnit === 'g' ? 'Finished weight, g' : 'Servings'}
              </label>
              <input
                id="ya"
                inputMode="decimal"
                className="input text-lg font-semibold"
                value={yieldAmount}
                onChange={(e) => setYieldAmount(clean(e.target.value))}
                placeholder={yieldUnit === 'g' ? '1400' : '4'}
              />
            </div>
            {yieldUnit === 'servings' && (
              <div className="flex-1">
                <label className="label" htmlFor="sg">
                  1 serving = g (optional)
                </label>
                <input
                  id="sg"
                  inputMode="decimal"
                  className="input"
                  value={servingGrams}
                  onChange={(e) => setServingGrams(clean(e.target.value))}
                  placeholder="unknown"
                />
              </div>
            )}
          </div>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="h-5 w-5 accent-[var(--accent)]"
              checked={estimated}
              onChange={(e) => setEstimated(e.target.checked)}
            />
            The finished amount is an estimate (entries will be marked)
          </label>
          {result && !result.ok && <p className="text-sm text-warn">{result.reason}</p>}
          {result?.ok && (
            <div className="space-y-1 rounded-xl bg-paper px-3 py-2">
              <div className="text-[12px] font-semibold text-muted">Whole batch</div>
              <MacroLine t={result.batch} />
              <div className="pt-1 text-[12px] font-semibold text-muted">{yieldUnit === 'g' ? 'Per 100 g cooked' : 'Per serving'}</div>
              <MacroLine t={{ ...result.spec.per, missing: result.spec.missing ?? [] }} />
            </div>
          )}
        </section>

        <section className="card space-y-3 p-4">
          <h2 className="section-title">Usual portion</h2>
          <div className="flex gap-2">
            <input
              aria-label="Default amount"
              inputMode="decimal"
              className="input flex-1"
              value={defAmount}
              onChange={(e) => setDefAmount(clean(e.target.value))}
            />
            <select aria-label="Default unit" className="input w-32" value={defUnit} onChange={(e) => setDefUnit(e.target.value as Unit)}>
              {units.map((u) => (
                <option key={u} value={u}>
                  {UNIT_LABEL[u]}
                </option>
              ))}
            </select>
          </div>
          {portionPreview &&
            (portionPreview.ok ? <MacroLine t={portionPreview} /> : <p className="text-sm text-warn">{portionPreview.reason}</p>)}
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={fav} onChange={(e) => setFav(e.target.checked)} />{' '}
            Favorite
          </label>
          <div>
            <label className="label" htmlFor="rnotes">
              Notes
            </label>
            <input id="rnotes" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </section>

        <ErrorText error={error} />
        <button className="btn-primary w-full" disabled={pending || !name.trim() || !result?.ok}>
          {pending ? 'Saving…' : 'Save recipe'}
        </button>
        {id && (
          <p className="text-center text-[12px] text-muted">
            Ingredient changes affect future logs only. Past diary entries keep their numbers.
          </p>
        )}
      </form>
      {id && <ShareBox type="recipe" id={id} recipients={recipients} />}
      {id && (
        <button
          className="btn-danger mt-4 w-full"
          disabled={pending}
          onClick={() =>
            confirm('Delete this recipe? Diary entries keep their numbers.') &&
            run(
              () => deleteRecipeAction(id),
              () => router.push('/library?tab=recipe'),
            )
          }
        >
          Delete recipe
        </button>
      )}
    </main>
  );
}

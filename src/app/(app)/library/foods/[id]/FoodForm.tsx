'use client';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { deleteFoodAction, saveFoodAction } from '@/app/actions';
import { useAction } from '@/components/useAction';
import { ErrorText, Header, MacroLine } from '@/components/ui';
import { ShareBox } from '@/components/ShareBox';
import { BarcodeLookup } from './BarcodeLookup';
import { availableUnits, portion } from '@/lib/nutrition/calc';
import { UNIT_LABEL } from '@/lib/nutrition/format';
import type { Basis, CountUnit, NutritionSpec, Unit } from '@/lib/nutrition/types';
import type { FoodInput } from '@/server/services/schemas';

const s = (n: number | null | undefined) => (n == null ? '' : String(n));
const n = (v: string) => (v.trim() === '' ? null : Number(v));
const clean = (v: string) => v.replace(',', '.').replace(/[^0-9.]/g, '');

interface UnitRow {
  unit: CountUnit;
  label: string;
  grams: string;
  ml: string;
  servings: string;
}

export function FoodForm({
  id,
  initial,
  meta,
  recipients,
  logAfter,
}: {
  id: string | null;
  initial: FoodInput | null;
  meta: { source: string; archived: boolean } | null;
  recipients: { user_id: string; display_name: string }[];
  logAfter: string | null;
}) {
  const router = useRouter();
  const { run, pending, error } = useAction();
  const i = initial;
  const [f, setF] = useState({
    name: i?.name ?? '',
    brand: i?.brand ?? '',
    barcode: i?.barcode ?? '',
    aliases: (i?.aliases ?? []).join(', '),
    basis: (i?.basis ?? 'per_100g') as Basis,
    serving_label: i?.serving_label ?? '',
    serving_grams: s(i?.serving_grams),
    serving_ml: s(i?.serving_ml),
    grams_per_ml: s(i?.grams_per_ml),
    kcal: s(i?.kcal),
    protein_g: s(i?.protein_g),
    carbs_g: s(i?.carbs_g),
    fat_g: s(i?.fat_g),
    default_amount: s(i?.default_amount ?? 100),
    default_unit: (i?.default_unit ?? 'g') as Unit,
    state: i?.state ?? '',
    notes: i?.notes ?? '',
    is_favorite: i?.is_favorite ?? false,
  });
  const [units, setUnits] = useState<UnitRow[]>(
    (i?.units ?? []).map((u) => ({ unit: u.unit, label: u.label ?? '', grams: s(u.grams), ml: s(u.ml), servings: s(u.servings) })),
  );
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));

  const input = useMemo(
    (): FoodInput => ({
      name: f.name.trim(),
      brand: f.brand || null,
      barcode: f.barcode || null,
      aliases: f.aliases
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean),
      basis: f.basis,
      serving_label: f.serving_label || null,
      serving_grams: n(f.serving_grams),
      serving_ml: n(f.serving_ml),
      grams_per_ml: n(f.grams_per_ml),
      kcal: Number(f.kcal),
      protein_g: n(f.protein_g),
      carbs_g: n(f.carbs_g),
      fat_g: n(f.fat_g),
      units: units.map((u) => ({ unit: u.unit, label: u.label || null, grams: n(u.grams), ml: n(u.ml), servings: n(u.servings) })),
      default_amount: Number(f.default_amount),
      default_unit: f.default_unit,
      state: (f.state || null) as FoodInput['state'],
      source: (i?.source ?? 'manual') as FoodInput['source'],
      source_label: i?.source_label ?? null,
      assumptions: i?.assumptions ?? null,
      notes: f.notes || null,
      is_favorite: f.is_favorite,
    }),
    [f, units, i],
  );
  const spec: NutritionSpec = {
    name: input.name || 'This food',
    basis: input.basis,
    per: { kcal: input.kcal || 0, protein_g: input.protein_g, carbs_g: input.carbs_g, fat_g: input.fat_g },
    servingLabel: input.serving_label,
    servingGrams: input.serving_grams,
    servingMl: input.serving_ml,
    gramsPerMl: input.grams_per_ml,
    units: input.units,
  };
  const units_ = availableUnits(spec);
  const prev = portion(spec, input.default_amount, input.default_unit);
  const perLabel = f.basis === 'per_100g' ? 'per 100 g' : f.basis === 'per_100ml' ? 'per 100 mL' : `per ${f.serving_label || 'serving'}`;

  function save() {
    run(
      () => saveFoodAction(id, input),
      (newId) => router.push(logAfter ? `/log/food/${newId}?${logAfter}` : '/library?tab=food'),
    );
  }

  return (
    <main className="page">
      <Header title={id ? 'Edit food' : 'New food'} back={logAfter ? `/add?${logAfter}` : '/library?tab=food'} />
      {i?.source === 'gpt_estimate' && (
        <p className="mb-3 rounded-xl bg-estimate-bg px-3 py-2 text-[13px] text-estimate">
          <b>{i.source_label || 'GPT estimate'}.</b> {i.assumptions}
        </p>
      )}
      {meta?.archived && (
        <p className="mb-3 rounded-xl bg-warn-bg px-3 py-2 text-[13px] text-warn">Archived: still used by a meal or recipe.</p>
      )}
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <section className="card space-y-3 p-4">
          <Text label="Name" value={f.name} onChange={(v) => set({ name: v })} required placeholder="e.g. Подварок / Greek yogurt" />
          <Text
            label="Also known as (comma-separated)"
            value={f.aliases}
            onChange={(v) => set({ aliases: v })}
            placeholder="podvarok, подварок"
          />
          <div className="grid grid-cols-2 gap-2">
            <Text label="Brand (optional)" value={f.brand} onChange={(v) => set({ brand: v })} />
            <Text
              label="Barcode (optional)"
              value={f.barcode}
              onChange={(v) => set({ barcode: v.replace(/\D/g, '') })}
              inputMode="numeric"
            />
          </div>
          <BarcodeLookup
            barcode={f.barcode}
            onResult={(r) =>
              set({
                name: f.name || r.name,
                brand: f.brand || r.brand,
                basis: 'per_100g',
                kcal: s(r.kcal),
                protein_g: s(r.protein_g),
                carbs_g: s(r.carbs_g),
                fat_g: s(r.fat_g),
              })
            }
          />
          <div>
            <label className="label" htmlFor="state">
              Form
            </label>
            <select id="state" className="input" value={f.state} onChange={(e) => set({ state: e.target.value })}>
              <option value="">Not specified</option>
              <option value="raw">Raw</option>
              <option value="dry">Dry (uncooked)</option>
              <option value="cooked">Cooked</option>
            </select>
          </div>
        </section>

        <section className="card space-y-3 p-4">
          <h2 className="section-title">Nutrition label</h2>
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-line/60 p-1">
            {(['per_100g', 'per_100ml', 'per_serving'] as Basis[]).map((b) => (
              <button
                type="button"
                key={b}
                onClick={() =>
                  set({
                    basis: b,
                    default_unit: b === 'per_100g' ? 'g' : b === 'per_100ml' ? 'ml' : 'serving',
                    default_amount: b === 'per_serving' ? '1' : '100',
                  })
                }
                className={`min-h-10 rounded-lg text-[13px] font-semibold ${f.basis === b ? 'bg-card shadow-sm' : 'text-muted'}`}
              >
                {b === 'per_100g' ? 'Per 100 g' : b === 'per_100ml' ? 'Per 100 mL' : 'Per serving'}
              </button>
            ))}
          </div>
          {f.basis === 'per_serving' && (
            <div className="grid grid-cols-3 gap-2">
              <Text label="Serving name" value={f.serving_label} onChange={(v) => set({ serving_label: v })} placeholder="scoop" />
              <Num label="Weight g" value={f.serving_grams} onChange={(v) => set({ serving_grams: v })} placeholder="unknown" />
              <Num label="Volume mL" value={f.serving_ml} onChange={(v) => set({ serving_ml: v })} placeholder="unknown" />
            </div>
          )}
          <div className="grid grid-cols-4 gap-2">
            <Num label={`kcal`} value={f.kcal} onChange={(v) => set({ kcal: v })} />
            <Num label="Protein g" value={f.protein_g} onChange={(v) => set({ protein_g: v })} placeholder="?" />
            <Num label="Carbs g" value={f.carbs_g} onChange={(v) => set({ carbs_g: v })} placeholder="?" />
            <Num label="Fat g" value={f.fat_g} onChange={(v) => set({ fat_g: v })} placeholder="?" />
          </div>
          <p className="text-[12px] text-muted">Values {perLabel}. Leave a macro empty if the label doesn’t list it.</p>
        </section>

        <section className="card space-y-3 p-4">
          <h2 className="section-title">Units</h2>
          <Num
            label="Density g/mL (lets you switch between g and mL)"
            value={f.grams_per_ml}
            onChange={(v) => set({ grams_per_ml: v })}
            placeholder="unknown"
          />
          {units.map((u, idx) => (
            <div key={idx} className="grid grid-cols-[6.5rem_1fr_1fr_auto] items-end gap-2">
              <div>
                <label className="label">1 ×</label>
                <select
                  aria-label="Unit"
                  className="input px-2"
                  value={u.unit}
                  onChange={(e) => setUnits((us) => us.map((x, j) => (j === idx ? { ...x, unit: e.target.value as CountUnit } : x)))}
                >
                  {(['piece', 'slice', 'scoop', 'serving'] as CountUnit[]).map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </div>
              <Num
                label="= grams"
                value={u.grams}
                onChange={(v) => setUnits((us) => us.map((x, j) => (j === idx ? { ...x, grams: v } : x)))}
              />
              {f.basis === 'per_serving' ? (
                <Num
                  label="= servings"
                  value={u.servings}
                  onChange={(v) => setUnits((us) => us.map((x, j) => (j === idx ? { ...x, servings: v } : x)))}
                />
              ) : (
                <Num label="= mL" value={u.ml} onChange={(v) => setUnits((us) => us.map((x, j) => (j === idx ? { ...x, ml: v } : x)))} />
              )}
              <button
                type="button"
                aria-label="Remove unit"
                className="btn-ghost h-12 w-10 px-0 text-muted"
                onClick={() => setUnits((us) => us.filter((_, j) => j !== idx))}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn w-full"
            onClick={() => setUnits((us) => [...us, { unit: 'piece', label: '', grams: '', ml: '', servings: '' }])}
          >
            + Add piece / slice / scoop
          </button>
          <p className="text-[12px] text-muted">Available units: {units_.map((u) => UNIT_LABEL[u]).join(', ') || 'none yet'}.</p>
        </section>

        <section className="card space-y-3 p-4">
          <h2 className="section-title">Default portion</h2>
          <div className="flex gap-2">
            <Num label="Amount" value={f.default_amount} onChange={(v) => set({ default_amount: v })} />
            <div className="w-36">
              <label className="label" htmlFor="du">
                Unit
              </label>
              <select id="du" className="input" value={f.default_unit} onChange={(e) => set({ default_unit: e.target.value as Unit })}>
                {(units_.length ? units_ : [f.default_unit]).map((u) => (
                  <option key={u} value={u}>
                    {UNIT_LABEL[u]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="rounded-xl bg-paper px-3 py-2">
            {prev.ok && f.kcal !== '' ? (
              <MacroLine t={prev} />
            ) : (
              <span className="text-sm text-muted">{prev.ok ? 'Enter calories' : prev.reason}</span>
            )}
          </div>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="h-5 w-5 accent-[var(--accent)]"
              checked={f.is_favorite}
              onChange={(e) => set({ is_favorite: e.target.checked })}
            />{' '}
            Favorite
          </label>
          <Text label="Notes" value={f.notes} onChange={(v) => set({ notes: v })} />
        </section>

        <ErrorText error={error} />
        <button className="btn-primary w-full" disabled={pending || !f.name.trim() || f.kcal === ''}>
          {pending ? 'Saving…' : logAfter ? 'Save and log' : 'Save food'}
        </button>
        {id && (
          <p className="text-center text-[12px] text-muted">
            Editing the label changes future logs only. Past diary entries keep their numbers.
          </p>
        )}
      </form>

      {id && <ShareBox type="food" id={id} recipients={recipients} />}
      {id && (
        <button
          className="btn-danger mt-4 w-full"
          disabled={pending}
          onClick={() =>
            confirm('Delete this food? Diary entries keep their numbers.') &&
            run(
              () => deleteFoodAction(id),
              () => router.push('/library?tab=food'),
            )
          }
        >
          Delete food
        </button>
      )}
    </main>
  );
}

function Text({
  label,
  value,
  onChange,
  ...rest
}: { label: string; value: string; onChange: (v: string) => void } & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'onChange' | 'value'
>) {
  const id = `f-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div className="min-w-0">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)} {...rest} />
    </div>
  );
}

function Num({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const id = `n-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div className="min-w-0 flex-1">
      <label className="label truncate" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="input px-2"
        inputMode="decimal"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(clean(e.target.value))}
      />
    </div>
  );
}

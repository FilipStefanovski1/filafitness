'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { saveEstimatesAction } from '@/app/actions';
import { useAction } from '@/components/useAction';
import { ErrorText, Header } from '@/components/ui';
import { SlotPicker } from '@/components/SlotPicker';
import { parseEstimate, type EstimateItem } from '@/lib/gpt';
import { kcalFromMacros } from '@/lib/nutrition/calc';
import { fmtKcal, UNIT_LABEL } from '@/lib/nutrition/format';
import { UNITS, type Slot, type Unit } from '@/lib/nutrition/types';

interface Row {
  key: number;
  selected: boolean;
  save_as_food: boolean;
  name: string;
  amount: string;
  unit: Unit | '';
  state: EstimateItem['state'];
  kcal: string;
  protein_g: string;
  carbs_g: string;
  fat_g: string;
  assumptions: string;
}

const s = (n: number | null) => (n == null ? '' : String(n));
const n = (v: string) => (v.trim() === '' ? null : Number(v));
let keySeq = 1;
const toRow = (i: EstimateItem): Row => ({
  key: keySeq++,
  selected: true,
  save_as_food: false,
  name: i.name,
  amount: s(i.amount),
  unit: i.unit ?? '',
  state: i.state,
  kcal: s(i.kcal),
  protein_g: s(i.protein_g),
  carbs_g: s(i.carbs_g),
  fat_g: s(i.fat_g),
  assumptions: i.assumptions,
});
const blank = (): Row =>
  toRow({ name: '', amount: null, unit: 'g', state: null, kcal: null, protein_g: null, carbs_g: null, fat_g: null, assumptions: '' });

export function EstimateImport({ date, slot: s0, prompt }: { date: string; slot: Slot; prompt: string }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [slot, setSlot] = useState(s0);
  const { run, pending, error } = useAction();

  function parse() {
    const r = parseEstimate(text);
    if (!r.ok) {
      setParseError(r.error);
      setRows(null);
      return;
    }
    setParseError(null);
    setWarnings(r.warnings);
    setRows(r.items.map(toRow));
  }
  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs!.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const clean = (v: string) => v.replace(',', '.').replace(/[^0-9.]/g, '');
  const selected = rows?.filter((r) => r.selected) ?? [];
  const invalid = selected.some((r) => !r.name.trim() || r.kcal.trim() === '' || (r.amount !== '' && !r.unit));
  const total = selected.reduce((a, r) => a + (Number(r.kcal) || 0), 0);

  function save() {
    run(
      () =>
        saveEstimatesAction({
          date,
          slot,
          items: selected.map((r) => ({
            name: r.name,
            amount: n(r.amount),
            unit: r.unit || null,
            state: r.state,
            kcal: Number(r.kcal),
            protein_g: n(r.protein_g),
            carbs_g: n(r.carbs_g),
            fat_g: n(r.fat_g),
            assumptions: r.assumptions || null,
            save_as_food: r.save_as_food,
            aliases: [],
          })),
        }),
      () => router.push(`/?date=${date}`),
    );
  }

  return (
    <main className="page">
      <Header title="Paste GPT estimate" back={`/add?date=${date}&slot=${s0}`} />

      <details className="card mb-3 p-4" open={!rows}>
        <summary className="cursor-pointer text-[15px] font-semibold">1 · Copy the prompt into ChatGPT</summary>
        <p className="mt-2 text-sm text-muted">
          Paste it with your message or photo, e.g. “Izedov 230g podvarok i 36g kifla”. It asks ChatGPT for JSON this app can read.
        </p>
        <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-xl bg-paper p-3 text-[12px] leading-snug">{prompt}</pre>
        <button
          type="button"
          className="btn-ink mt-2 w-full"
          onClick={async () => {
            await navigator.clipboard.writeText(prompt).catch(() => undefined);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? 'Copied ✓' : 'Copy prompt'}
        </button>
      </details>

      <section className="card mb-3 p-4">
        <label htmlFor="paste" className="text-[15px] font-semibold">
          2 · Paste ChatGPT’s reply
        </label>
        <textarea
          id="paste"
          className="input mt-2 min-h-32 py-2 font-mono text-[13px]"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='{"items":[{"name":"Подварок","amount":230,"unit":"g",...}]}'
        />
        <div className="mt-2 flex gap-2">
          <button type="button" className="btn-primary flex-1" onClick={parse} disabled={!text.trim()}>
            Read estimate
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setRows((r) => [...(r ?? []), blank()]);
              setParseError(null);
            }}
          >
            Enter manually
          </button>
        </div>
        {parseError && (
          <div className="mt-2">
            <ErrorText error={parseError} />
          </div>
        )}
      </section>

      {rows && (
        <section className="space-y-3">
          <h2 className="px-1 text-[15px] font-semibold">3 · Review and correct</h2>
          {warnings.map((w) => (
            <p key={w} className="rounded-xl bg-warn-bg px-3 py-2 text-[13px] text-warn">
              {w}
            </p>
          ))}
          {rows.map((r) => {
            const implied = kcalFromMacros({ kcal: 0, protein_g: n(r.protein_g), carbs_g: n(r.carbs_g), fat_g: n(r.fat_g) });
            const mismatch = implied != null && r.kcal !== '' && Math.abs(implied - Number(r.kcal)) > Math.max(40, Number(r.kcal) * 0.2);
            return (
              <div key={r.key} className={`card space-y-3 p-4 ${r.selected ? '' : 'opacity-60'}`}>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    aria-label="Include this item"
                    className="h-6 w-6 accent-[var(--accent)]"
                    checked={r.selected}
                    onChange={(e) => update(r.key, { selected: e.target.checked })}
                  />
                  <input
                    aria-label="Food name"
                    className="input font-semibold"
                    value={r.name}
                    onChange={(e) => update(r.key, { name: e.target.value })}
                    placeholder="Food name"
                  />
                  <span className="chip-estimate shrink-0">Estimate</span>
                </div>
                <div className="grid grid-cols-[1fr_7rem_7rem] gap-2">
                  <Field label="Amount" value={r.amount} onChange={(v) => update(r.key, { amount: clean(v) })} />
                  <div>
                    <label className="label">Unit</label>
                    <select
                      aria-label="Unit"
                      className="input"
                      value={r.unit}
                      onChange={(e) => update(r.key, { unit: e.target.value as Unit })}
                    >
                      <option value="">—</option>
                      {UNITS.map((u) => (
                        <option key={u} value={u}>
                          {UNIT_LABEL[u]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">State</label>
                    <select
                      aria-label="State"
                      className="input"
                      value={r.state ?? ''}
                      onChange={(e) => update(r.key, { state: (e.target.value || null) as Row['state'] })}
                    >
                      <option value="">—</option>
                      <option value="raw">raw</option>
                      <option value="dry">dry</option>
                      <option value="cooked">cooked</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <Field label="kcal" value={r.kcal} onChange={(v) => update(r.key, { kcal: clean(v) })} />
                  <Field label="Protein" value={r.protein_g} onChange={(v) => update(r.key, { protein_g: clean(v) })} placeholder="?" />
                  <Field label="Carbs" value={r.carbs_g} onChange={(v) => update(r.key, { carbs_g: clean(v) })} placeholder="?" />
                  <Field label="Fat" value={r.fat_g} onChange={(v) => update(r.key, { fat_g: clean(v) })} placeholder="?" />
                </div>
                {mismatch && <p className="text-[12px] text-warn">Macros imply about {fmtKcal(implied)} kcal. Check the numbers.</p>}
                <div>
                  <label className="label">Portion assumptions</label>
                  <textarea
                    aria-label="Portion assumptions"
                    className="input min-h-16 py-2 text-sm"
                    value={r.assumptions}
                    onChange={(e) => update(r.key, { assumptions: e.target.value })}
                  />
                </div>
                <label className="flex min-h-11 items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-[var(--accent)]"
                    checked={r.save_as_food}
                    onChange={(e) => update(r.key, { save_as_food: e.target.checked })}
                  />
                  Save as a food for next time (keeps the “GPT estimate” label)
                </label>
              </div>
            );
          })}
          <button type="button" className="btn w-full" onClick={() => setRows((rs) => [...(rs ?? []), blank()])}>
            + Add another item
          </button>
          <div className="card space-y-3 p-4">
            <SlotPicker value={slot} onChange={setSlot} />
            <ErrorText error={error} />
            {invalid && (
              <p className="text-[13px] text-warn">Each selected item needs a name and calories (and a unit if an amount is given).</p>
            )}
            <button type="button" className="btn-primary w-full" disabled={pending || selected.length === 0 || invalid} onClick={save}>
              {pending ? 'Saving…' : `Save ${selected.length} item${selected.length === 1 ? '' : 's'} · ${fmtKcal(total)} kcal`}
            </button>
          </div>
        </section>
      )}
    </main>
  );
}

function Field({
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
  return (
    <div className="min-w-0">
      <label className="label">{label}</label>
      <input
        aria-label={label}
        inputMode="decimal"
        className="input px-2"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { quickAddAction } from '@/app/actions';
import { useAction } from '@/components/useAction';
import { ErrorText, Header } from '@/components/ui';
import { SlotPicker } from '@/components/SlotPicker';
import { AmountInput } from '@/components/AmountInput';
import type { Slot } from '@/lib/nutrition/types';

const num = (s: string) => (s.trim() === '' ? null : Number(s));

export function QuickAdd({ date, slot: s0, name: n0 }: { date: string; slot: Slot; name: string }) {
  const router = useRouter();
  const [slot, setSlot] = useState(s0);
  const [name, setName] = useState(n0);
  const [kcal, setKcal] = useState('');
  const [p, setP] = useState('');
  const [c, setC] = useState('');
  const [f, setF] = useState('');
  const { run, pending, error } = useAction();
  return (
    <main className="page">
      <Header title="Quick add" back={`/add?date=${date}&slot=${s0}`} />
      <form
        className="card space-y-4 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () => quickAddAction({ date, slot, name, kcal: Number(kcal), protein_g: num(p), carbs_g: num(c), fat_g: num(f) }),
            () => router.push(`/?date=${date}`),
          );
        }}
      >
        <div>
          <label className="label" htmlFor="qname">
            Name
          </label>
          <input
            id="qname"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={200}
            placeholder="e.g. Бурек со сирење"
          />
        </div>
        <AmountInput label="Calories (kcal)" value={kcal} onChange={setKcal} />
        <div className="grid grid-cols-3 gap-2">
          <AmountInput label="Protein g" value={p} onChange={setP} placeholder="?" />
          <AmountInput label="Carbs g" value={c} onChange={setC} placeholder="?" />
          <AmountInput label="Fat g" value={f} onChange={setF} placeholder="?" />
        </div>
        <p className="text-[13px] text-muted">Leave a macro empty if you don’t know it. It will show as unknown, not 0 g.</p>
        <SlotPicker value={slot} onChange={setSlot} />
        <ErrorText error={error} />
        <button className="btn-primary w-full" disabled={pending || !name.trim() || kcal === ''}>
          {pending ? 'Saving…' : 'Add to diary'}
        </button>
      </form>
    </main>
  );
}

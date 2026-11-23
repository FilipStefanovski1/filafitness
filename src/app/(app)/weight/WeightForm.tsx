'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { deleteWeighInAction, saveWeighInAction } from '@/app/actions';
import { useAction } from '@/components/useAction';
import { ErrorText } from '@/components/ui';
import { AmountInput } from '@/components/AmountInput';

export function WeightForm({ today, latest }: { today: string; latest: number | null }) {
  const [date, setDate] = useState(today);
  const [kg, setKg] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const router = useRouter();
  const { run, pending, error } = useAction();
  return (
    <form
      className="card space-y-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () => saveWeighInAction({ date, weight_kg: Number(kg) }),
          () => {
            setSaved(`${kg} kg on ${date}`);
            setKg('');
            router.refresh();
          },
        );
      }}
    >
      <div className="flex items-end gap-2">
        <AmountInput label="Weight (kg)" value={kg} onChange={setKg} placeholder={latest ? String(latest) : '75.0'} />
        <div className="w-40">
          <label className="label" htmlFor="wdate">
            Date
          </label>
          <input id="wdate" type="date" className="input" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
      <ErrorText error={error} />
      {saved && <p className="text-sm font-medium text-good">Saved {saved} ✓</p>}
      <div className="flex gap-2">
        <button className="btn-primary flex-1" disabled={pending || !(Number(kg) > 0)}>
          {pending ? 'Saving…' : 'Save weigh-in'}
        </button>
        <button
          type="button"
          className="btn-ghost text-sm text-muted"
          disabled={pending}
          onClick={() =>
            confirm(`Delete the weigh-in for ${date}?`) &&
            run(
              () => deleteWeighInAction(date),
              () => router.refresh(),
            )
          }
        >
          Delete day
        </button>
      </div>
    </form>
  );
}

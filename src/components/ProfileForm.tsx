'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { saveProfileAction } from '@/app/actions';
import { useAction } from './useAction';
import { AmountInput } from './AmountInput';
import { ErrorText } from './ui';

const TZ = [
  'Europe/Skopje',
  'Europe/Belgrade',
  'Europe/Sofia',
  'Europe/Athens',
  'Europe/Berlin',
  'Europe/London',
  'America/New_York',
  'UTC',
];
const s = (n: number | null | undefined) => (n == null ? '' : String(n));

export interface ProfileValues {
  display_name: string;
  timezone: string;
  kcal_target: number;
  protein_target_g: number;
  carbs_target_g: number | null;
  fat_target_g: number | null;
  goal_weight_kg: number | null;
}

export function ProfileForm({ initial, onboarding, today }: { initial: ProfileValues; onboarding?: boolean; today: string }) {
  const router = useRouter();
  const { run, pending, error } = useAction();
  const [saved, setSaved] = useState(false);
  const [v, setV] = useState({
    display_name: initial.display_name,
    timezone: initial.timezone,
    kcal: s(initial.kcal_target),
    protein: s(initial.protein_target_g),
    carbs: s(initial.carbs_target_g),
    fat: s(initial.fat_target_g),
    goal: s(initial.goal_weight_kg),
    weight: '',
  });
  const set = (p: Partial<typeof v>) => {
    setSaved(false);
    setV((x) => ({ ...x, ...p }));
  };
  const n = (x: string) => (x.trim() === '' ? null : Number(x));
  const zones = TZ.includes(v.timezone) ? TZ : [v.timezone, ...TZ];
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () =>
            saveProfileAction(
              {
                display_name: v.display_name,
                timezone: v.timezone,
                kcal_target: Number(v.kcal),
                protein_target_g: Number(v.protein),
                carbs_target_g: n(v.carbs),
                fat_target_g: n(v.fat),
                goal_weight_kg: n(v.goal),
                current_weight_kg: n(v.weight) ?? undefined,
                today,
              },
              !!onboarding,
            ),
          () => (onboarding ? router.push('/') : (setSaved(true), router.refresh())),
        );
      }}
    >
      <div>
        <label className="label" htmlFor="dn">
          Your name
        </label>
        <input
          id="dn"
          className="input"
          value={v.display_name}
          onChange={(e) => set({ display_name: e.target.value })}
          required
          maxLength={60}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <AmountInput label="Calories / day" value={v.kcal} onChange={(x) => set({ kcal: x })} />
        <AmountInput label="Protein g / day" value={v.protein} onChange={(x) => set({ protein: x })} />
        <AmountInput label="Carbs g (optional)" value={v.carbs} onChange={(x) => set({ carbs: x })} placeholder="–" />
        <AmountInput label="Fat g (optional)" value={v.fat} onChange={(x) => set({ fat: x })} placeholder="–" />
        <AmountInput label="Goal weight kg (optional)" value={v.goal} onChange={(x) => set({ goal: x })} placeholder="–" />
        {onboarding && (
          <AmountInput label="Today’s weight kg (optional)" value={v.weight} onChange={(x) => set({ weight: x })} placeholder="–" />
        )}
      </div>
      <div>
        <label className="label" htmlFor="tz">
          Timezone (decides which day late meals belong to)
        </label>
        <select id="tz" className="input" value={v.timezone} onChange={(e) => set({ timezone: e.target.value })}>
          {zones.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
      </div>
      <ErrorText error={error} />
      {saved && <p className="text-sm font-medium text-good">Saved ✓</p>}
      <button className="btn-primary w-full" disabled={pending || !(Number(v.kcal) > 0) || v.protein === ''}>
        {pending ? 'Saving…' : onboarding ? 'Start tracking' : 'Save goals'}
      </button>
    </form>
  );
}

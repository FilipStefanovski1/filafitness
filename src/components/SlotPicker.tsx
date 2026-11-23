'use client';
import { SLOTS, SLOT_LABEL, type Slot } from '@/lib/nutrition/types';

export function SlotPicker({ value, onChange }: { value: Slot; onChange: (s: Slot) => void }) {
  return (
    <div className="grid grid-cols-4 gap-1 rounded-xl bg-line/60 p-1" role="radiogroup" aria-label="Meal">
      {SLOTS.map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={value === s}
          onClick={() => onChange(s)}
          className={`min-h-10 rounded-lg text-[13px] font-semibold ${value === s ? 'bg-accent text-white' : 'text-muted'}`}
        >
          {SLOT_LABEL[s]}
        </button>
      ))}
    </div>
  );
}

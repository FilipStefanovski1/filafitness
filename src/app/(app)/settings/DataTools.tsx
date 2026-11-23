'use client';
import { useState } from 'react';
import { importStarterAction } from '@/app/actions';
import { useAction } from '@/components/useAction';
import { ErrorText } from '@/components/ui';

export function DataTools() {
  const { run, pending, error } = useAction();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <section className="card space-y-3 p-4" id="starter">
      <h2 className="section-title">Your data</h2>
      <div className="grid grid-cols-2 gap-2">
        <a className="btn text-sm" href="/api/export?type=diary" download>
          Export diary CSV
        </a>
        <a className="btn text-sm" href="/api/export?type=weight" download>
          Export weigh-ins CSV
        </a>
      </div>
      <div>
        <button
          className="btn w-full text-sm"
          disabled={pending}
          onClick={() =>
            run(
              () => importStarterAction(),
              (n) => setMsg(n ? `Added ${n} starter foods.` : 'Starter foods are already in your library.'),
            )
          }
        >
          Import starter foods (oats, milk, rice, eggs…)
        </button>
        <p className="mt-1 text-[12px] text-muted">
          Generic values rounded from USDA FoodData Central. Only added when you tap this. Edit them freely.
        </p>
      </div>
      {msg && <p className="text-sm font-medium text-good">{msg}</p>}
      <ErrorText error={error} />
    </section>
  );
}

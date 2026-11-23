'use client';
import { useMemo, useState } from 'react';
import { matchScore } from '@/lib/search';

export interface PickOption {
  kind: 'food' | 'recipe';
  id: string;
  name: string;
  key: string;
  hint: string;
}

/** Search-as-you-type picker for adding foods/recipes to a meal or recipe. */
export function ItemPicker({
  options,
  onPick,
  placeholder,
}: {
  options: PickOption[];
  onPick: (o: PickOption) => void;
  placeholder: string;
}) {
  const [q, setQ] = useState('');
  const hits = useMemo(
    () =>
      q.trim()
        ? options
            .map((o) => ({ o, s: matchScore(q, o.key) }))
            .filter((x) => x.s > 0)
            .sort((a, b) => b.s - a.s)
            .slice(0, 8)
            .map((x) => x.o)
        : [],
    [q, options],
  );
  return (
    <div>
      <input
        type="search"
        className="input"
        placeholder={placeholder}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label={placeholder}
      />
      {hits.length > 0 && (
        <ul className="card mt-1 divide-y divide-line overflow-hidden">
          {hits.map((o) => (
            <li key={`${o.kind}:${o.id}`}>
              <button
                type="button"
                className="flex min-h-12 w-full items-center justify-between px-3 text-left active:bg-line/50"
                onClick={() => {
                  onPick(o);
                  setQ('');
                }}
              >
                <span className="font-medium">{o.name}</span>
                <span className="text-[12px] text-muted">
                  {o.kind === 'recipe' ? 'recipe · ' : ''}
                  {o.hint}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.trim() && hits.length === 0 && <p className="mt-1 text-sm text-muted">No match. Create the food first in Library.</p>}
    </div>
  );
}

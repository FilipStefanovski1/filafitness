import Link from 'next/link';
import type { NutritionTotals } from '@/lib/nutrition/types';
import { fmtKcal, fmtMacro } from '@/lib/nutrition/format';

export function Header({ title, back, action }: { title: string; back?: string; action?: React.ReactNode }) {
  return (
    <header
      className="sticky top-0 z-20 -mx-4 mb-3 flex min-h-14 items-center gap-2 border-b border-line bg-paper/95 px-2 backdrop-blur"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {back ? (
        <Link href={back} aria-label="Back" className="flex h-12 w-12 items-center justify-center rounded-xl text-ink active:bg-line">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </Link>
      ) : (
        <span className="w-2" />
      )}
      <h1 className="flex-1 truncate text-lg font-bold">{title}</h1>
      {action}
    </header>
  );
}

/** Compact kcal + macros line. Unknown macros render as "?" and partial sums as "≥". */
export function MacroLine({
  t,
  className = '',
}: {
  t: Pick<NutritionTotals, 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g' | 'missing'>;
  className?: string;
}) {
  return (
    <span className={`text-[13px] text-muted ${className}`}>
      <b className="font-semibold text-ink">{fmtKcal(t.kcal)}</b> kcal · <span className="text-protein">P {fmtMacro(t, 'protein_g')}</span>{' '}
      · C {fmtMacro(t, 'carbs_g')} · F {fmtMacro(t, 'fat_g')}
    </span>
  );
}

export function ErrorText({ error }: { error: string | null | undefined }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-xl bg-warn-bg px-3 py-2 text-sm font-medium text-warn">
      {error}
    </p>
  );
}

export function EstimateChip({ label }: { label?: string | null }) {
  return <span className="chip-estimate">{label || 'Estimate'}</span>;
}

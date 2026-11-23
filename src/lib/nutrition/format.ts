import type { Macro, NutritionTotals, Unit } from './types';

/** Display-boundary rounding. */
export function fmtKcal(n: number | null | undefined): string {
  if (n == null) return '?';
  return Math.round(n).toLocaleString('en-US');
}

export function fmtGrams(n: number | null | undefined): string {
  if (n == null) return '?';
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/** A macro with its completeness: "32 g", "≥32 g" (some unknown), or "? g" (none known). */
export function fmtMacro(t: Pick<NutritionTotals, Macro | 'missing'>, m: Macro): string {
  const v = t[m];
  if (v == null) return '? g';
  return `${t.missing.includes(m) ? '≥' : ''}${fmtGrams(v)} g`;
}

export function fmtAmount(amount: number | null | undefined, unit: string | null | undefined): string {
  if (amount == null || !unit) return '';
  const a = fmtGrams(amount);
  if (unit === 'g' || unit === 'ml') return `${a} ${unit === 'ml' ? 'mL' : 'g'}`;
  const plural = amount === 1 ? unit : unit === 'piece' ? 'pieces' : `${unit}s`;
  return `${a} ${plural}`;
}

export const UNIT_LABEL: Record<Unit, string> = {
  g: 'g',
  ml: 'mL',
  serving: 'serving',
  piece: 'piece',
  slice: 'slice',
  scoop: 'scoop',
};

export const MACRO_LABEL: Record<Macro, string> = { protein_g: 'Protein', carbs_g: 'Carbs', fat_g: 'Fat' };

export function round(n: number, dp = 1): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

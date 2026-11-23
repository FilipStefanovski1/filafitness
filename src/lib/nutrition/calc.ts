import Decimal from 'decimal.js';
import { MACROS, type Macro, type NutritionSpec, type NutritionTotals, type NutritionValues, type Unit, type UnitDef } from './types';

/**
 * All nutrition arithmetic lives here. Calculations use decimal.js and are never
 * rounded internally; round only for display (see format.ts).
 */

export type ConversionResult = { ok: true; basisQty: Decimal; grams: Decimal | null } | { ok: false; reason: string };

const D = (n: number | string | Decimal) => new Decimal(n);

function unitDef(spec: NutritionSpec, unit: Unit): UnitDef | undefined {
  return spec.units?.find((u) => u.unit === unit);
}

/** Amount of the unit, expressed in grams, if knowable from explicit conversions. */
function toGrams(spec: NutritionSpec, amount: Decimal, unit: Unit): Decimal | null {
  if (unit === 'g') return amount;
  if (unit === 'ml') return spec.gramsPerMl ? amount.mul(spec.gramsPerMl) : null;
  if (unit === 'serving' && spec.basis === 'per_serving' && spec.servingGrams) return amount.mul(spec.servingGrams);
  const def = unitDef(spec, unit);
  if (def?.grams) return amount.mul(def.grams);
  if (def?.servings && spec.servingGrams) return amount.mul(def.servings).mul(spec.servingGrams);
  if (unit === 'serving' && spec.servingGrams) return amount.mul(spec.servingGrams);
  return null;
}

function toMl(spec: NutritionSpec, amount: Decimal, unit: Unit): Decimal | null {
  if (unit === 'ml') return amount;
  if (unit === 'g') return spec.gramsPerMl ? amount.div(spec.gramsPerMl) : null;
  const def = unitDef(spec, unit);
  if (def?.ml) return amount.mul(def.ml);
  if (def?.servings && spec.servingMl) return amount.mul(def.servings).mul(spec.servingMl);
  if (unit === 'serving' && spec.servingMl) return amount.mul(spec.servingMl);
  return null;
}

function toServings(spec: NutritionSpec, amount: Decimal, unit: Unit): Decimal | null {
  if (unit === 'serving') return amount;
  const def = unitDef(spec, unit);
  if (def?.servings) return amount.mul(def.servings);
  if (unit === 'g' && spec.servingGrams) return amount.div(spec.servingGrams);
  if (unit === 'ml' && spec.servingMl) return amount.div(spec.servingMl);
  if (def?.grams && spec.servingGrams) return amount.mul(def.grams).div(spec.servingGrams);
  if (def?.ml && spec.servingMl) return amount.mul(def.ml).div(spec.servingMl);
  // A per-serving food whose serving is named e.g. "scoop" accepts that unit as 1 serving.
  if (spec.servingLabel && spec.servingLabel.toLowerCase() === unit) return amount;
  return null;
}

/** Convert a portion into a multiple of the spec's basis quantity, or explain why not. */
export function convert(spec: NutritionSpec, amount: number, unit: Unit): ConversionResult {
  if (!(amount > 0) || !Number.isFinite(amount)) return { ok: false, reason: 'Amount must be greater than 0' };
  const a = D(amount);
  const grams = toGrams(spec, a, unit);
  if (spec.basis === 'per_100g') {
    if (!grams) return { ok: false, reason: `${spec.name} has no defined conversion from ${unit} to grams` };
    return { ok: true, basisQty: grams.div(100), grams };
  }
  if (spec.basis === 'per_100ml') {
    const ml = toMl(spec, a, unit);
    if (!ml) return { ok: false, reason: `${spec.name} has no defined conversion from ${unit} to mL` };
    return { ok: true, basisQty: ml.div(100), grams };
  }
  const servings = toServings(spec, a, unit);
  if (!servings) return { ok: false, reason: `${spec.name} has no defined conversion from ${unit} to servings` };
  return { ok: true, basisQty: servings, grams };
}

/** Units this spec can be logged in, given its explicit conversions. */
export function availableUnits(spec: NutritionSpec): Unit[] {
  const all: Unit[] = ['g', 'ml', 'serving', 'piece', 'slice', 'scoop'];
  return all.filter((u) => convert(spec, 1, u).ok);
}

export function scale(values: NutritionValues, factor: Decimal | number): NutritionValues {
  const f = D(factor);
  return {
    kcal: D(values.kcal).mul(f).toNumber(),
    protein_g: values.protein_g == null ? null : D(values.protein_g).mul(f).toNumber(),
    carbs_g: values.carbs_g == null ? null : D(values.carbs_g).mul(f).toNumber(),
    fat_g: values.fat_g == null ? null : D(values.fat_g).mul(f).toNumber(),
  };
}

export type PortionResult = ({ ok: true; grams: number | null } & NutritionTotals) | { ok: false; reason: string };

/** Nutrition for `amount` `unit` of a food or recipe. */
export function portion(spec: NutritionSpec, amount: number, unit: Unit): PortionResult {
  const c = convert(spec, amount, unit);
  if (!c.ok) return c;
  const v = scale(spec.per, c.basisQty);
  const missing = new Set<Macro>(spec.missing ?? []);
  for (const m of MACROS) if (spec.per[m] == null) missing.add(m);
  return { ok: true, ...v, missing: MACROS.filter((m) => missing.has(m)), grams: c.grams ? c.grams.toNumber() : null };
}

/** Sum totals. Unknown macros are excluded from the sum and reported in `missing`. */
export function sum(items: Array<NutritionValues & { missing?: Macro[] }>): NutritionTotals {
  let kcal = D(0);
  const acc: Record<Macro, Decimal | null> = { protein_g: null, carbs_g: null, fat_g: null };
  const missing = new Set<Macro>();
  for (const it of items) {
    kcal = kcal.add(it.kcal);
    for (const m of MACROS) {
      const v = it[m];
      if (v == null) missing.add(m);
      else acc[m] = (acc[m] ?? D(0)).add(v);
    }
    for (const m of it.missing ?? []) missing.add(m);
  }
  return {
    kcal: kcal.toNumber(),
    protein_g: acc.protein_g?.toNumber() ?? null,
    carbs_g: acc.carbs_g?.toNumber() ?? null,
    fat_g: acc.fat_g?.toNumber() ?? null,
    missing: MACROS.filter((m) => missing.has(m)),
  };
}

export interface RecipeInput {
  name: string;
  yieldUnit: 'g' | 'servings';
  yieldAmount: number;
  yieldEstimated?: boolean;
  servingGrams?: number | null;
  state?: NutritionSpec['state'];
  ingredients: Array<{ spec: NutritionSpec; amount: number; unit: Unit }>;
}

export type RecipeResult =
  { ok: true; batch: NutritionTotals; spec: NutritionSpec; ingredientTotals: NutritionTotals[] } | { ok: false; reason: string };

/**
 * Batch nutrition from ingredients, then a spec per 100 g of finished weight (gram yield)
 * or per serving (servings yield) so that any eaten portion scales from the finished batch.
 */
export function recipe(input: RecipeInput): RecipeResult {
  if (!(input.yieldAmount > 0)) return { ok: false, reason: 'Batch yield must be greater than 0' };
  if (input.ingredients.length === 0) return { ok: false, reason: 'Add at least one ingredient' };
  const ingredientTotals: NutritionTotals[] = [];
  for (const ing of input.ingredients) {
    const p = portion(ing.spec, ing.amount, ing.unit);
    if (!p.ok) return { ok: false, reason: p.reason };
    ingredientTotals.push(p);
  }
  const batch = sum(ingredientTotals);
  const yieldD = D(input.yieldAmount);
  const per = input.yieldUnit === 'g' ? scale(batch, D(100).div(yieldD)) : scale(batch, D(1).div(yieldD));
  const spec: NutritionSpec = {
    name: input.name,
    basis: input.yieldUnit === 'g' ? 'per_100g' : 'per_serving',
    per,
    missing: batch.missing,
    servingGrams: input.yieldUnit === 'servings' ? (input.servingGrams ?? null) : null,
    // A gram-yield recipe can also be logged as a fraction of the batch: 1 "serving" = whole batch is
    // not intuitive, so we only expose servings when the batch is defined in servings.
    units: [],
    state: input.state ?? 'cooked',
    estimatedYield: !!input.yieldEstimated,
  };
  return { ok: true, batch, spec, ingredientTotals };
}

/** Kcal implied by macros (4/4/9). Used only to warn about inconsistent estimates. */
export function kcalFromMacros(v: NutritionValues): number | null {
  if (v.protein_g == null || v.carbs_g == null || v.fat_g == null) return null;
  return D(v.protein_g).mul(4).add(D(v.carbs_g).mul(4)).add(D(v.fat_g).mul(9)).toNumber();
}

export function remaining(target: number, consumed: number): number {
  return D(target).sub(consumed).toNumber();
}

import type { Tx } from '../db';
import Decimal from 'decimal.js';
import { convert, scale } from '@/lib/nutrition/calc';
import type { CountUnit, NutritionSpec, NutritionValues, Unit, UnitDef } from '@/lib/nutrition/types';
import { buildSearchKey } from '@/lib/search';
import { foodInputSchema, type FoodInput } from './schemas';
import { AppError } from './errors';

export interface FoodRow {
  id: string;
  user_id: string;
  name: string;
  brand: string | null;
  barcode: string | null;
  aliases: string[];
  basis: NutritionSpec['basis'];
  serving_label: string | null;
  serving_grams: number | null;
  serving_ml: number | null;
  grams_per_ml: number | null;
  kcal: number;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  units: UnitDef[];
  default_amount: number;
  default_unit: Unit;
  state: NutritionSpec['state'];
  source: string;
  source_label: string | null;
  assumptions: string | null;
  notes: string | null;
  is_favorite: boolean;
  archived: boolean;
  created_at: Date;
  updated_at: Date;
}

export function foodSpec(
  f: Pick<
    FoodRow,
    | 'name'
    | 'basis'
    | 'kcal'
    | 'protein_g'
    | 'carbs_g'
    | 'fat_g'
    | 'serving_label'
    | 'serving_grams'
    | 'serving_ml'
    | 'grams_per_ml'
    | 'units'
    | 'state'
  > & { source?: string },
): NutritionSpec {
  return {
    name: f.name,
    basis: f.basis,
    per: { kcal: f.kcal, protein_g: f.protein_g, carbs_g: f.carbs_g, fat_g: f.fat_g },
    servingLabel: f.serving_label,
    servingGrams: f.serving_grams,
    servingMl: f.serving_ml,
    gramsPerMl: f.grams_per_ml,
    units: f.units ?? [],
    state: f.state,
    isEstimate: f.source === 'gpt_estimate',
  };
}

/**
 * Turn a total for a stated amount (an estimate or quick add) into a spec, so the
 * entry can be re-portioned later: 230 g -> per 100 g; 2 pieces -> per piece; none -> 1 serving.
 */
export function estimateSpec(
  name: string,
  values: NutritionValues,
  amount: number | null | undefined,
  unit: Unit | null | undefined,
  state?: NutritionSpec['state'],
): { spec: NutritionSpec; amount: number; unit: Unit } {
  // The stated portion is one "serving" holding the exact stated totals, so logging the
  // same portion reproduces the numbers exactly and other portions scale from it.
  const per = { kcal: values.kcal, protein_g: values.protein_g, carbs_g: values.carbs_g, fat_g: values.fat_g };
  const base = { name, basis: 'per_serving' as const, per, state, isEstimate: true };
  if (amount && amount > 0 && unit === 'g') return { spec: { ...base, servingLabel: 'portion', servingGrams: amount }, amount, unit };
  if (amount && amount > 0 && unit === 'ml') return { spec: { ...base, servingLabel: 'portion', servingMl: amount }, amount, unit };
  if (amount && amount > 0 && unit) {
    if (unit === 'serving') return { spec: { ...base, per: scale(per, new Decimal(1).div(amount)) }, amount, unit };
    const units: UnitDef[] = [{ unit: unit as CountUnit, servings: new Decimal(1).div(amount).toNumber() }];
    return { spec: { ...base, servingLabel: `${amount} ${unit}`, units }, amount, unit };
  }
  return { spec: base, amount: 1, unit: 'serving' };
}

export function validateFood(input: FoodInput) {
  const spec = foodSpec({
    ...input,
    units: input.units as UnitDef[],
    serving_label: input.serving_label ?? null,
    serving_grams: input.serving_grams ?? null,
    serving_ml: input.serving_ml ?? null,
    grams_per_ml: input.grams_per_ml ?? null,
    state: input.state ?? null,
  });
  const c = convert(spec, input.default_amount, input.default_unit);
  if (!c.ok) throw new AppError(`Default portion: ${c.reason}`);
  return spec;
}

function foodColumns(input: FoodInput, tx: Tx) {
  return {
    name: input.name,
    brand: input.brand ?? null,
    barcode: input.barcode ?? null,
    aliases: tx.array(input.aliases),
    search_key: buildSearchKey(input.name, input.aliases, [input.brand]),
    basis: input.basis,
    serving_label: input.serving_label ?? null,
    serving_grams: input.serving_grams ?? null,
    serving_ml: input.serving_ml ?? null,
    grams_per_ml: input.grams_per_ml ?? null,
    kcal: input.kcal,
    protein_g: input.protein_g,
    carbs_g: input.carbs_g,
    fat_g: input.fat_g,
    units: tx.json(input.units as never),
    default_amount: input.default_amount,
    default_unit: input.default_unit,
    state: input.state ?? null,
    source: input.source,
    source_label: input.source_label ?? null,
    assumptions: input.assumptions ?? null,
    notes: input.notes ?? null,
    is_favorite: input.is_favorite,
  };
}

export async function createFood(tx: Tx, raw: unknown): Promise<FoodRow> {
  const input = foodInputSchema.parse(raw);
  validateFood(input);
  const cols = foodColumns(input, tx);
  const [row] = await tx<FoodRow[]>`insert into foods ${tx(cols)} returning *`;
  return row;
}

export async function updateFood(tx: Tx, id: string, raw: unknown): Promise<FoodRow> {
  const input = foodInputSchema.parse(raw);
  validateFood(input);
  const cols = foodColumns(input, tx);
  const [row] = await tx<FoodRow[]>`update foods set ${tx(cols)} where id = ${id} returning *`;
  if (!row) throw new AppError('Food not found', 404);
  return row;
}

export async function getFood(tx: Tx, id: string): Promise<FoodRow> {
  const [row] = await tx<FoodRow[]>`select * from foods where id = ${id}`;
  if (!row) throw new AppError('Food not found', 404);
  return row;
}

export async function listFoods(tx: Tx, opts: { includeArchived?: boolean } = {}): Promise<FoodRow[]> {
  return tx<FoodRow[]>`
    select * from foods where (${!!opts.includeArchived} or not archived)
    order by is_favorite desc, lower(name)`;
}

export async function setFoodFavorite(tx: Tx, id: string, fav: boolean) {
  await tx`update foods set is_favorite = ${fav} where id = ${id}`;
}

/** Foods referenced by meals/recipes are archived instead of deleted; diary entries keep snapshots either way. */
export async function deleteFood(tx: Tx, id: string): Promise<'deleted' | 'archived'> {
  const [{ used }] = await tx<{ used: boolean }[]>`
    select exists(select 1 from recipe_ingredients where food_id = ${id})
        or exists(select 1 from meal_items where food_id = ${id}) as used`;
  if (used) {
    await tx`update foods set archived = true, is_favorite = false where id = ${id}`;
    return 'archived';
  }
  await tx`delete from foods where id = ${id}`;
  return 'deleted';
}

export function foodToInput(f: FoodRow): FoodInput {
  return {
    name: f.name,
    brand: f.brand,
    barcode: f.barcode,
    aliases: f.aliases,
    basis: f.basis,
    serving_label: f.serving_label,
    serving_grams: f.serving_grams,
    serving_ml: f.serving_ml,
    grams_per_ml: f.grams_per_ml,
    kcal: f.kcal,
    protein_g: f.protein_g,
    carbs_g: f.carbs_g,
    fat_g: f.fat_g,
    units: (f.units ?? []).map((u) => ({ ...u, label: u.label ?? null })),
    default_amount: f.default_amount,
    default_unit: f.default_unit,
    state: f.state,
    source: f.source as FoodInput['source'],
    source_label: f.source_label,
    assumptions: f.assumptions,
    notes: f.notes,
    is_favorite: f.is_favorite,
  };
}

import type { Tx } from '../db';
import { recipe as computeRecipe, convert } from '@/lib/nutrition/calc';
import type { NutritionSpec, NutritionTotals, Unit } from '@/lib/nutrition/types';
import { buildSearchKey } from '@/lib/search';
import { AppError } from './errors';
import { foodSpec, type FoodRow } from './foods';
import { recipeInputSchema, type RecipeInput } from './schemas';

export interface RecipeRow {
  id: string;
  user_id: string;
  name: string;
  aliases: string[];
  yield_unit: 'g' | 'servings';
  yield_amount: number;
  yield_estimated: boolean;
  serving_grams: number | null;
  default_amount: number;
  default_unit: Unit;
  state: NutritionSpec['state'];
  source: string;
  source_label: string | null;
  notes: string | null;
  is_favorite: boolean;
  archived: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface IngredientRow {
  id: string;
  recipe_id: string;
  position: number;
  food_id: string;
  amount: number;
  unit: Unit;
  food: FoodRow;
}

export interface ResolvedRecipe extends RecipeRow {
  ingredients: Array<IngredientRow & { totals: NutritionTotals }>;
  batch: NutritionTotals;
  spec: NutritionSpec;
}

function resolve(r: RecipeRow, ingredients: IngredientRow[]): ResolvedRecipe {
  const res = computeRecipe({
    name: r.name,
    yieldUnit: r.yield_unit,
    yieldAmount: r.yield_amount,
    yieldEstimated: r.yield_estimated,
    servingGrams: r.serving_grams,
    state: r.state,
    ingredients: ingredients.map((i) => ({ spec: foodSpec(i.food), amount: i.amount, unit: i.unit })),
  });
  if (!res.ok) throw new AppError(`${r.name}: ${res.reason}`);
  return {
    ...r,
    ingredients: ingredients.map((i, idx) => ({ ...i, totals: res.ingredientTotals[idx] })),
    batch: res.batch,
    spec: res.spec,
  };
}

async function loadIngredients(tx: Tx, recipeIds: string[]): Promise<IngredientRow[]> {
  if (recipeIds.length === 0) return [];
  const rows = await tx<(Omit<IngredientRow, 'food'> & { food: FoodRow })[]>`
    select ri.id, ri.recipe_id, ri.position, ri.food_id, ri.amount, ri.unit, to_jsonb(f) as food
    from recipe_ingredients ri join foods f on f.id = ri.food_id
    where ri.recipe_id = any(${tx.array(recipeIds)}::uuid[])
    order by ri.recipe_id, ri.position`;
  return rows.map((r) => ({ ...r, food: normalizeJsonFood(r.food) }));
}

/** to_jsonb() returns numerics as JSON numbers already; keep types tidy. */
export function normalizeJsonFood(f: FoodRow): FoodRow {
  return { ...f, units: f.units ?? [] };
}

export async function getRecipe(tx: Tx, id: string): Promise<ResolvedRecipe> {
  const [r] = await tx<RecipeRow[]>`select * from recipes where id = ${id}`;
  if (!r) throw new AppError('Recipe not found', 404);
  return resolve(r, await loadIngredients(tx, [id]));
}

export async function getRecipes(tx: Tx, ids: string[]): Promise<Map<string, ResolvedRecipe>> {
  if (ids.length === 0) return new Map();
  const rows = await tx<RecipeRow[]>`select * from recipes where id = any(${tx.array(ids)}::uuid[])`;
  const ings = await loadIngredients(
    tx,
    rows.map((r) => r.id),
  );
  return new Map(
    rows.map((r) => [
      r.id,
      resolve(
        r,
        ings.filter((i) => i.recipe_id === r.id),
      ),
    ]),
  );
}

export async function listRecipes(tx: Tx): Promise<ResolvedRecipe[]> {
  const rows = await tx<RecipeRow[]>`select * from recipes where not archived order by is_favorite desc, lower(name)`;
  const ings = await loadIngredients(
    tx,
    rows.map((r) => r.id),
  );
  return rows.map((r) =>
    resolve(
      r,
      ings.filter((i) => i.recipe_id === r.id),
    ),
  );
}

async function validateAgainstFoods(tx: Tx, input: RecipeInput) {
  const ids = [...new Set(input.ingredients.map((i) => i.food_id))];
  const foods = await tx<FoodRow[]>`select * from foods where id = any(${tx.array(ids)}::uuid[])`;
  const byId = new Map(foods.map((f) => [f.id, f]));
  for (const i of input.ingredients) {
    const f = byId.get(i.food_id);
    if (!f) throw new AppError('An ingredient food was not found in your library');
    const c = convert(foodSpec(f), i.amount, i.unit);
    if (!c.ok) throw new AppError(c.reason);
  }
  const fake: RecipeRow = {
    id: '',
    user_id: '',
    name: input.name,
    aliases: [],
    yield_unit: input.yield_unit,
    yield_amount: input.yield_amount,
    yield_estimated: input.yield_estimated,
    serving_grams: input.serving_grams ?? null,
    default_amount: input.default_amount,
    default_unit: input.default_unit,
    state: 'cooked',
    source: 'manual',
    source_label: null,
    notes: null,
    is_favorite: false,
    archived: false,
    created_at: new Date(),
    updated_at: new Date(),
  };
  const resolved = resolve(
    fake,
    input.ingredients.map((i, idx) => ({ id: '', recipe_id: '', position: idx, ...i, food: byId.get(i.food_id)! })),
  );
  const c = convert(resolved.spec, input.default_amount, input.default_unit);
  if (!c.ok) throw new AppError(`Default portion: ${c.reason}`);
}

function columns(input: RecipeInput, tx: Tx, extra: { source?: string; source_label?: string | null } = {}) {
  return {
    name: input.name,
    aliases: tx.array(input.aliases),
    search_key: buildSearchKey(input.name, input.aliases),
    yield_unit: input.yield_unit,
    yield_amount: input.yield_amount,
    yield_estimated: input.yield_estimated,
    serving_grams: input.serving_grams ?? null,
    default_amount: input.default_amount,
    default_unit: input.default_unit,
    notes: input.notes ?? null,
    is_favorite: input.is_favorite,
    ...(extra.source ? { source: extra.source, source_label: extra.source_label ?? null } : {}),
  };
}

async function writeIngredients(tx: Tx, recipeId: string, input: RecipeInput) {
  await tx`delete from recipe_ingredients where recipe_id = ${recipeId}`;
  const rows = input.ingredients.map((i, idx) => ({
    recipe_id: recipeId,
    position: idx,
    food_id: i.food_id,
    amount: i.amount,
    unit: i.unit,
  }));
  await tx`insert into recipe_ingredients ${tx(rows)}`;
}

export async function createRecipe(
  tx: Tx,
  raw: unknown,
  extra?: { source?: string; source_label?: string | null },
): Promise<ResolvedRecipe> {
  const input = recipeInputSchema.parse(raw);
  await validateAgainstFoods(tx, input);
  const [r] = await tx<{ id: string }[]>`insert into recipes ${tx(columns(input, tx, extra))} returning id`;
  await writeIngredients(tx, r.id, input);
  return getRecipe(tx, r.id);
}

/** Editing ingredients changes future logs only; diary entries keep their own snapshots. */
export async function updateRecipe(tx: Tx, id: string, raw: unknown): Promise<ResolvedRecipe> {
  const input = recipeInputSchema.parse(raw);
  await validateAgainstFoods(tx, input);
  const res = await tx`update recipes set ${tx(columns(input, tx))} where id = ${id} returning id`;
  if (res.length === 0) throw new AppError('Recipe not found', 404);
  await writeIngredients(tx, id, input);
  return getRecipe(tx, id);
}

export async function setRecipeFavorite(tx: Tx, id: string, fav: boolean) {
  await tx`update recipes set is_favorite = ${fav} where id = ${id}`;
}

export async function deleteRecipe(tx: Tx, id: string): Promise<'deleted' | 'archived'> {
  const [{ used }] = await tx<{ used: boolean }[]>`select exists(select 1 from meal_items where recipe_id = ${id}) as used`;
  if (used) {
    await tx`update recipes set archived = true, is_favorite = false where id = ${id}`;
    return 'archived';
  }
  await tx`delete from recipes where id = ${id}`;
  return 'deleted';
}

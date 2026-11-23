import type { Tx } from '../db';
import { portion, sum } from '@/lib/nutrition/calc';
import type { NutritionSpec, NutritionTotals, Slot, Unit } from '@/lib/nutrition/types';
import { buildSearchKey } from '@/lib/search';
import { AppError } from './errors';
import { foodSpec, type FoodRow } from './foods';
import { getRecipes, normalizeJsonFood, type ResolvedRecipe } from './recipes';
import { mealInputSchema, type MealInput } from './schemas';

export interface MealRow {
  id: string;
  user_id: string;
  name: string;
  aliases: string[];
  default_slot: Slot | null;
  source: string;
  source_label: string | null;
  notes: string | null;
  is_favorite: boolean;
  archived: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface ResolvedMealItem {
  id: string;
  position: number;
  food_id: string | null;
  recipe_id: string | null;
  amount: number;
  unit: Unit;
  name: string;
  spec: NutritionSpec;
  totals: NutritionTotals;
  food?: FoodRow;
  recipe?: ResolvedRecipe;
}

export interface ResolvedMeal extends MealRow {
  items: ResolvedMealItem[];
  totals: NutritionTotals;
}

async function resolveMeals(tx: Tx, meals: MealRow[]): Promise<ResolvedMeal[]> {
  if (meals.length === 0) return [];
  const items = await tx<
    {
      id: string;
      meal_id: string;
      position: number;
      food_id: string | null;
      recipe_id: string | null;
      amount: number;
      unit: Unit;
      food: FoodRow | null;
    }[]
  >`
    select mi.id, mi.meal_id, mi.position, mi.food_id, mi.recipe_id, mi.amount, mi.unit,
           case when f.id is null then null else to_jsonb(f) end as food
    from meal_items mi left join foods f on f.id = mi.food_id
    where mi.meal_id = any(${tx.array(meals.map((m) => m.id))}::uuid[])
    order by mi.meal_id, mi.position`;
  const recipes = await getRecipes(tx, [...new Set(items.map((i) => i.recipe_id).filter(Boolean) as string[])]);
  return meals.map((m) => {
    const resolved: ResolvedMealItem[] = items
      .filter((i) => i.meal_id === m.id)
      .map((i) => {
        const food = i.food ? normalizeJsonFood(i.food) : undefined;
        const recipe = i.recipe_id ? recipes.get(i.recipe_id) : undefined;
        const spec = food ? foodSpec(food) : recipe!.spec;
        const p = portion(spec, i.amount, i.unit);
        if (!p.ok) throw new AppError(`${m.name}: ${p.reason}`);
        return {
          id: i.id,
          position: i.position,
          food_id: i.food_id,
          recipe_id: i.recipe_id,
          amount: i.amount,
          unit: i.unit,
          name: food?.name ?? recipe!.name,
          spec,
          totals: p,
          food,
          recipe,
        };
      });
    return { ...m, items: resolved, totals: sum(resolved.map((r) => r.totals)) };
  });
}

export async function getMeal(tx: Tx, id: string): Promise<ResolvedMeal> {
  const rows = await tx<MealRow[]>`select * from meals where id = ${id}`;
  if (!rows[0]) throw new AppError('Meal not found', 404);
  return (await resolveMeals(tx, rows))[0];
}

export async function listMeals(tx: Tx): Promise<ResolvedMeal[]> {
  const rows = await tx<MealRow[]>`select * from meals where not archived order by is_favorite desc, lower(name)`;
  return resolveMeals(tx, rows);
}

async function validateItems(tx: Tx, input: MealInput) {
  const foodIds = input.items.map((i) => i.food_id).filter(Boolean) as string[];
  const recipeIds = input.items.map((i) => i.recipe_id).filter(Boolean) as string[];
  const foods = foodIds.length ? await tx<FoodRow[]>`select * from foods where id = any(${tx.array(foodIds)}::uuid[])` : [];
  const recipes = await getRecipes(tx, recipeIds);
  const fMap = new Map(foods.map((f) => [f.id, f]));
  for (const i of input.items) {
    const spec = i.food_id ? (fMap.get(i.food_id) ? foodSpec(fMap.get(i.food_id)!) : null) : (recipes.get(i.recipe_id!)?.spec ?? null);
    if (!spec) throw new AppError('A meal item was not found in your library');
    const p = portion(spec, i.amount, i.unit);
    if (!p.ok) throw new AppError(p.reason);
  }
}

async function writeItems(tx: Tx, mealId: string, input: MealInput) {
  await tx`delete from meal_items where meal_id = ${mealId}`;
  const rows = input.items.map((i, idx) => ({
    meal_id: mealId,
    position: idx,
    food_id: i.food_id ?? null,
    recipe_id: i.recipe_id ?? null,
    amount: i.amount,
    unit: i.unit,
  }));
  await tx`insert into meal_items ${tx(rows)}`;
}

function columns(input: MealInput, tx: Tx) {
  return {
    name: input.name,
    aliases: tx.array(input.aliases),
    search_key: buildSearchKey(input.name, input.aliases),
    default_slot: input.default_slot ?? null,
    notes: input.notes ?? null,
    is_favorite: input.is_favorite,
  };
}

export async function createMeal(
  tx: Tx,
  raw: unknown,
  extra: { source?: string; source_label?: string | null } = {},
): Promise<ResolvedMeal> {
  const input = mealInputSchema.parse(raw);
  await validateItems(tx, input);
  const cols = { ...columns(input, tx), ...(extra.source ? { source: extra.source, source_label: extra.source_label ?? null } : {}) };
  const [m] = await tx<{ id: string }[]>`insert into meals ${tx(cols)} returning id`;
  await writeItems(tx, m.id, input);
  return getMeal(tx, m.id);
}

export async function updateMeal(tx: Tx, id: string, raw: unknown): Promise<ResolvedMeal> {
  const input = mealInputSchema.parse(raw);
  await validateItems(tx, input);
  const res = await tx`update meals set ${tx(columns(input, tx))} where id = ${id} returning id`;
  if (res.length === 0) throw new AppError('Meal not found', 404);
  await writeItems(tx, id, input);
  return getMeal(tx, id);
}

/** Explicitly save new default quantities for a meal's existing items. */
export async function saveMealDefaults(tx: Tx, id: string, items: Array<{ item_id: string; amount: number; unit: Unit }>) {
  const meal = await getMeal(tx, id);
  for (const it of items) {
    const existing = meal.items.find((m) => m.id === it.item_id);
    if (!existing) throw new AppError('Meal item not found');
    const p = portion(existing.spec, it.amount, it.unit);
    if (!p.ok) throw new AppError(p.reason);
    await tx`update meal_items set amount = ${it.amount}, unit = ${it.unit} where id = ${it.item_id} and meal_id = ${id}`;
  }
  await tx`update meals set updated_at = now() where id = ${id}`;
  return getMeal(tx, id);
}

export async function setMealFavorite(tx: Tx, id: string, fav: boolean) {
  await tx`update meals set is_favorite = ${fav} where id = ${id}`;
}

export async function deleteMeal(tx: Tx, id: string) {
  await tx`delete from meals where id = ${id}`;
}

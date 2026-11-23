import type { Tx } from '../db';
import { AppError } from './errors';
import { createFood, foodToInput, getFood } from './foods';
import { createMeal, getMeal } from './meals';
import { createRecipe, getRecipe, type ResolvedRecipe } from './recipes';
import type { FoodInput } from './schemas';
import type { Unit } from '@/lib/nutrition/types';

/**
 * A share payload is a self-contained copy of one library item and the foods/recipes it
 * needs. It never contains diary entries, targets, weigh-ins or other library items.
 */
type RecipePayload = {
  name: string;
  aliases: string[];
  yield_unit: 'g' | 'servings';
  yield_amount: number;
  yield_estimated: boolean;
  serving_grams: number | null;
  default_amount: number;
  default_unit: Unit;
  notes: string | null;
  ingredients: Array<{ food: FoodInput; amount: number; unit: Unit }>;
};
export type SharePayload =
  | { version: 1; type: 'food'; sender_name: string; food: FoodInput }
  | { version: 1; type: 'recipe'; sender_name: string; recipe: RecipePayload }
  | {
      version: 1;
      type: 'meal';
      sender_name: string;
      meal: {
        name: string;
        aliases: string[];
        default_slot: string | null;
        notes: string | null;
        items: Array<{ food?: FoodInput; recipe?: RecipePayload; amount: number; unit: Unit }>;
      };
    };

const cleanFood = (f: FoodInput): FoodInput => ({ ...f, is_favorite: false });

function recipePayload(r: ResolvedRecipe): RecipePayload {
  return {
    name: r.name,
    aliases: r.aliases,
    yield_unit: r.yield_unit,
    yield_amount: r.yield_amount,
    yield_estimated: r.yield_estimated,
    serving_grams: r.serving_grams,
    default_amount: r.default_amount,
    default_unit: r.default_unit,
    notes: r.notes,
    ingredients: r.ingredients.map((i) => ({ food: cleanFood(foodToInput(i.food)), amount: i.amount, unit: i.unit })),
  };
}

export async function buildPayload(tx: Tx, type: 'food' | 'meal' | 'recipe', id: string, senderName: string): Promise<SharePayload> {
  if (type === 'food') return { version: 1, type, sender_name: senderName, food: cleanFood(foodToInput(await getFood(tx, id))) };
  if (type === 'recipe') return { version: 1, type, sender_name: senderName, recipe: recipePayload(await getRecipe(tx, id)) };
  const m = await getMeal(tx, id);
  return {
    version: 1,
    type,
    sender_name: senderName,
    meal: {
      name: m.name,
      aliases: m.aliases,
      default_slot: m.default_slot,
      notes: m.notes,
      items: m.items.map((i) =>
        i.food
          ? { food: cleanFood(foodToInput(i.food)), amount: i.amount, unit: i.unit }
          : { recipe: recipePayload(i.recipe!), amount: i.amount, unit: i.unit },
      ),
    },
  };
}

export async function createShare(
  tx: Tx,
  senderName: string,
  input: { type: 'food' | 'meal' | 'recipe'; id: string; recipient_id: string },
) {
  const [ok] = await tx<{ user_id: string }[]>`select user_id from share_recipients() where user_id = ${input.recipient_id}`;
  if (!ok) throw new AppError('Recipient not found');
  const payload = await buildPayload(tx, input.type, input.id, senderName);
  const name = payload.type === 'food' ? payload.food.name : payload.type === 'recipe' ? payload.recipe.name : payload.meal.name;
  const [row] = await tx<{ id: string }[]>`
    insert into shares (recipient_id, item_type, item_name, payload)
    values (${input.recipient_id}, ${input.type}, ${name}, ${tx.json(payload as never)}) returning id`;
  return row;
}

export interface ShareRow {
  id: string;
  sender_id: string;
  recipient_id: string;
  item_type: 'food' | 'meal' | 'recipe';
  item_name: string;
  payload: SharePayload;
  status: 'pending' | 'accepted' | 'declined';
  created_at: Date;
}

export async function listShares(tx: Tx, userId: string) {
  const rows = await tx<ShareRow[]>`select * from shares order by created_at desc limit 50`;
  return {
    incoming: rows.filter((r) => r.recipient_id === userId),
    outgoing: rows.filter((r) => r.sender_id === userId),
  };
}

export async function listRecipients(tx: Tx) {
  return tx<{ user_id: string; display_name: string }[]>`select * from share_recipients()`;
}

async function importFood(tx: Tx, f: FoodInput, label: string) {
  return createFood(tx, {
    ...f,
    source: 'shared',
    source_label: f.source === 'gpt_estimate' ? `${f.source_label ?? 'GPT estimate'} · ${label}` : label,
  });
}

async function importRecipe(tx: Tx, r: RecipePayload, label: string) {
  const ingredients = [];
  for (const i of r.ingredients) ingredients.push({ food_id: (await importFood(tx, i.food, label)).id, amount: i.amount, unit: i.unit });
  return createRecipe(tx, { ...r, ingredients, is_favorite: false }, { source: 'shared', source_label: label });
}

/** Accept a share: create independent copies in the recipient's own library. */
export async function acceptShare(tx: Tx, userId: string, shareId: string) {
  const [s] = await tx<ShareRow[]>`select * from shares where id = ${shareId} and recipient_id = ${userId} and status = 'pending'`;
  if (!s) throw new AppError('Share not found', 404);
  const p = s.payload;
  const label = `Shared by ${p.sender_name}`;
  let created: { type: string; id: string };
  if (p.type === 'food') created = { type: 'food', id: (await importFood(tx, p.food, label)).id };
  else if (p.type === 'recipe') created = { type: 'recipe', id: (await importRecipe(tx, p.recipe, label)).id };
  else {
    const items = [];
    for (const i of p.meal.items) {
      if (i.food) items.push({ food_id: (await importFood(tx, i.food, label)).id, amount: i.amount, unit: i.unit });
      else items.push({ recipe_id: (await importRecipe(tx, i.recipe!, label)).id, amount: i.amount, unit: i.unit });
    }
    const m = await createMeal(
      tx,
      { name: p.meal.name, aliases: p.meal.aliases, default_slot: p.meal.default_slot, notes: p.meal.notes, items },
      { source: 'shared', source_label: label },
    );
    created = { type: 'meal', id: m.id };
  }
  await tx`update shares set status = 'accepted', responded_at = now() where id = ${shareId}`;
  return created;
}

export async function declineShare(tx: Tx, userId: string, shareId: string) {
  const r =
    await tx`update shares set status = 'declined', responded_at = now() where id = ${shareId} and recipient_id = ${userId} and status = 'pending' returning id`;
  if (r.length === 0) throw new AppError('Share not found', 404);
}

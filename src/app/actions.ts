'use server';

import { revalidatePath } from 'next/cache';
import { unstable_rethrow } from 'next/navigation';
import { z } from 'zod';
import { requireUser } from '@/server/auth';
import { asUser, type Tx } from '@/server/db';
import type { Profile } from '@/server/services/profile';
import { errorMessage } from '@/server/services/errors';
import { dateSchema, estimateItemSchema, quickAddSchema, slotSchema, unitSchema, uuidSchema } from '@/server/services/schemas';
import {
  copyEntries,
  deleteEntry,
  draftFromEstimate,
  draftQuick,
  insertEntry,
  logFood,
  logMeal,
  logRecipe,
  saveEntriesAsMeal,
  saveEntryAsFood,
  updateEntry,
} from '@/server/services/diary';
import { createFood, deleteFood, setFoodFavorite, updateFood } from '@/server/services/foods';
import { createMeal, deleteMeal, saveMealDefaults, setMealFavorite, updateMeal } from '@/server/services/meals';
import { createRecipe, deleteRecipe, setRecipeFavorite, updateRecipe } from '@/server/services/recipes';
import { deleteWeighIn, upsertWeighIn } from '@/server/services/weight';
import { updateProfile } from '@/server/services/profile';
import { createPersonalToken, revokeToken } from '@/server/services/tokens';
import { acceptShare, createShare, declineShare } from '@/server/services/shares';
import { importStarterFoods } from '@/server/demo';
import { addWater } from '@/server/services/water';

export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

async function act<T>(
  fn: (tx: Tx, ctx: { userId: string; profile: Profile }) => Promise<T>,
  opts: { onboarding?: boolean } = {},
): Promise<ActionResult<T>> {
  try {
    const ctx = await requireUser({ allowNotOnboarded: opts.onboarding });
    const data = await asUser(ctx.userId, (tx) => fn(tx, ctx));
    revalidatePath('/', 'layout');
    return { ok: true, data };
  } catch (e) {
    unstable_rethrow(e);
    return { ok: false, error: errorMessage(e) };
  }
}

const where = z.object({ date: dateSchema, slot: slotSchema });
const itemRef = z.object({ type: z.enum(['food', 'meal', 'recipe']), id: uuidSchema });

// ------------------------------------------------------------ logging

/** One-tap log of an item's default portion. */
export async function quickLogAction(raw: unknown) {
  return act(async (tx) => {
    const a = itemRef.merge(where).parse(raw);
    const e =
      a.type === 'food'
        ? await logFood(tx, a.id, a.date, a.slot)
        : a.type === 'recipe'
          ? await logRecipe(tx, a.id, a.date, a.slot)
          : await logMeal(tx, a.id, a.date, a.slot);
    return { id: e.id, name: e.name, kcal: e.kcal };
  });
}

const logItemSchema = itemRef.merge(where).extend({
  amount: z.coerce.number().positive().optional(),
  unit: unitSchema.optional(),
  overrides: z.record(z.string(), z.object({ amount: z.coerce.number().positive(), unit: unitSchema })).optional(),
  saveAsDefault: z.boolean().optional(),
});

/** Log with a custom portion. For meals, overrides apply to this entry only unless saveAsDefault is set. */
export async function logItemAction(raw: unknown) {
  return act(async (tx) => {
    const a = logItemSchema.parse(raw);
    if (a.type === 'food') return (await logFood(tx, a.id, a.date, a.slot, a.amount, a.unit)).id;
    if (a.type === 'recipe') return (await logRecipe(tx, a.id, a.date, a.slot, a.amount, a.unit)).id;
    const e = await logMeal(tx, a.id, a.date, a.slot, a.overrides);
    if (a.saveAsDefault && a.overrides) {
      await saveMealDefaults(
        tx,
        a.id,
        Object.entries(a.overrides).map(([item_id, v]) => ({ item_id, ...v })),
      );
    }
    return e.id;
  });
}

export async function quickAddAction(raw: unknown) {
  return act(async (tx) => {
    const a = where.parse(raw);
    const q = quickAddSchema.parse(raw);
    return (await insertEntry(tx, draftQuick(q, a.date, a.slot))).id;
  });
}

const estimateSaveSchema = where.extend({
  items: z
    .array(estimateItemSchema.extend({ save_as_food: z.boolean().default(false), aliases: z.array(z.string().trim().min(1)).default([]) }))
    .min(1, 'Select at least one item'),
});

/** Save reviewed GPT estimate items in one transaction; optionally save some as foods. */
export async function saveEstimatesAction(raw: unknown) {
  return act(async (tx) => {
    const a = estimateSaveSchema.parse(raw);
    const ids: string[] = [];
    for (const it of a.items) {
      const e = await insertEntry(tx, draftFromEstimate(it, a.date, a.slot, 'GPT estimate'));
      ids.push(e.id);
      if (it.save_as_food) await saveEntryAsFood(tx, e.id, { aliases: it.aliases });
    }
    return ids;
  });
}

// ------------------------------------------------------------ entries

const patchSchema = z.object({
  date: dateSchema.optional(),
  slot: slotSchema.optional(),
  name: z.string().trim().min(1).max(200).optional(),
  notes: z.string().max(2000).nullable().optional(),
  assumptions: z.string().max(2000).nullable().optional(),
  components: z.array(z.object({ id: uuidSchema, amount: z.coerce.number().positive(), unit: unitSchema })).optional(),
  values: z
    .object({
      kcal: z.coerce.number().min(0),
      protein_g: z.number().min(0).nullable(),
      carbs_g: z.number().min(0).nullable(),
      fat_g: z.number().min(0).nullable(),
      amount: z.number().positive().nullable().optional(),
      unit: unitSchema.nullable().optional(),
    })
    .optional(),
});

export async function updateEntryAction(id: string, raw: unknown) {
  return act(async (tx) => (await updateEntry(tx, uuidSchema.parse(id), patchSchema.parse(raw))).id);
}
export async function deleteEntryAction(id: string) {
  return act((tx) => deleteEntry(tx, uuidSchema.parse(id)));
}
export async function copyEntriesAction(raw: unknown) {
  return act(async (tx) => {
    const a = z
      .object({ ids: z.array(uuidSchema).min(1, 'Select at least one entry'), date: dateSchema, slot: slotSchema.optional() })
      .parse(raw);
    return (await copyEntries(tx, a.ids, a.date, a.slot)).length;
  });
}
export async function saveEntryAsFoodAction(raw: unknown) {
  return act(async (tx) => {
    const a = z
      .object({
        id: uuidSchema,
        name: z.string().trim().max(200).optional(),
        aliases: z.array(z.string()).default([]),
        favorite: z.boolean().default(false),
      })
      .parse(raw);
    return (await saveEntryAsFood(tx, a.id, a)).id;
  });
}
export async function saveEntriesAsMealAction(raw: unknown) {
  return act(async (tx) => {
    const a = z
      .object({
        ids: z.array(uuidSchema).min(1, 'Select at least one entry'),
        name: z.string().trim().min(1, 'Name the meal').max(200),
        slot: slotSchema.nullable().optional(),
      })
      .parse(raw);
    return (await saveEntriesAsMeal(tx, a.ids, a.name, a.slot)).id;
  });
}

// ------------------------------------------------------------ library

export async function saveFoodAction(id: string | null, raw: unknown) {
  return act(async (tx) => (id ? await updateFood(tx, uuidSchema.parse(id), raw) : await createFood(tx, raw)).id);
}
export async function deleteFoodAction(id: string) {
  return act((tx) => deleteFood(tx, uuidSchema.parse(id)));
}
export async function saveMealAction(id: string | null, raw: unknown) {
  return act(async (tx) => (id ? await updateMeal(tx, uuidSchema.parse(id), raw) : await createMeal(tx, raw)).id);
}
export async function deleteMealAction(id: string) {
  return act((tx) => deleteMeal(tx, uuidSchema.parse(id)));
}
export async function saveRecipeAction(id: string | null, raw: unknown) {
  return act(async (tx) => (id ? await updateRecipe(tx, uuidSchema.parse(id), raw) : await createRecipe(tx, raw)).id);
}
export async function deleteRecipeAction(id: string) {
  return act((tx) => deleteRecipe(tx, uuidSchema.parse(id)));
}
export async function toggleFavoriteAction(raw: unknown) {
  return act(async (tx) => {
    const a = itemRef.extend({ favorite: z.boolean() }).parse(raw);
    if (a.type === 'food') await setFoodFavorite(tx, a.id, a.favorite);
    else if (a.type === 'meal') await setMealFavorite(tx, a.id, a.favorite);
    else await setRecipeFavorite(tx, a.id, a.favorite);
    return a.favorite;
  });
}

// ------------------------------------------------------------ weight, profile

export async function saveWeighInAction(raw: unknown) {
  return act(async (tx) => (await upsertWeighIn(tx, raw)).id);
}
export async function deleteWeighInAction(date: string) {
  return act((tx) => deleteWeighIn(tx, dateSchema.parse(date)));
}
export async function saveProfileAction(raw: unknown, onboard = false) {
  return act(
    async (tx, { userId }) => {
      const p = await updateProfile(tx, userId, raw, { onboard });
      const w = z
        .object({ current_weight_kg: z.coerce.number().min(20).max(400).optional().catch(undefined), today: dateSchema.optional() })
        .parse(raw);
      if (onboard && w.current_weight_kg && w.today) await upsertWeighIn(tx, { date: w.today, weight_kg: w.current_weight_kg });
      return p.user_id;
    },
    { onboarding: true },
  );
}

// ------------------------------------------------------------ MCP tokens, sharing, starter data

export async function createTokenAction(name: string) {
  return act(async (tx) => (await createPersonalToken(tx, z.string().max(60).parse(name))).token);
}
export async function revokeTokenAction(id: string) {
  return act((tx) => revokeToken(tx, uuidSchema.parse(id)));
}
export async function shareAction(raw: unknown) {
  return act(async (tx, { profile }) => {
    const a = itemRef.extend({ recipient_id: uuidSchema }).parse(raw);
    return (await createShare(tx, profile.display_name || 'Your partner', { ...a })).id;
  });
}
export async function acceptShareAction(id: string) {
  return act((tx, { userId }) => acceptShare(tx, userId, uuidSchema.parse(id)));
}
export async function declineShareAction(id: string) {
  return act((tx, { userId }) => declineShare(tx, userId, uuidSchema.parse(id)));
}
export async function importStarterAction() {
  return act((tx) => importStarterFoods(tx));
}

export async function addWaterAction(date: string, deltaMl: number) {
  return act((tx) => addWater(tx, dateSchema.parse(date), z.number().int().parse(deltaMl)));
}

const onlineFoodSchema = z.object({
  code: z.string().regex(/^\d{4,14}$/),
  name: z.string().trim().min(1).max(200),
  brand: z.string().max(120).nullable(),
  kcal: z.number().min(0).max(950),
  protein_g: z.number().min(0).nullable(),
  carbs_g: z.number().min(0).nullable(),
  fat_g: z.number().min(0).nullable(),
  serving_g: z.number().positive().nullable(),
  serving_label: z.string().max(40).nullable(),
});

/** Save an Open Food Facts result into your own library (reusing it if the barcode is already saved). */
export async function importOnlineFoodAction(raw: unknown) {
  return act(async (tx) => {
    const f = onlineFoodSchema.parse(raw);
    const [existing] = await tx<{ id: string }[]>`select id from foods where barcode = ${f.code} and not archived limit 1`;
    if (existing) return existing.id;
    const food = await createFood(tx, {
      name: f.name,
      brand: f.brand,
      barcode: f.code,
      aliases: [],
      basis: 'per_100g',
      kcal: f.kcal,
      protein_g: f.protein_g,
      carbs_g: f.carbs_g,
      fat_g: f.fat_g,
      units: f.serving_g ? [{ unit: 'serving', label: f.serving_label, grams: f.serving_g }] : [],
      default_amount: f.serving_g ? 1 : 100,
      default_unit: f.serving_g ? 'serving' : 'g',
      source: 'open_food_facts',
      source_label: 'Open Food Facts',
      is_favorite: false,
    });
    return food.id;
  });
}

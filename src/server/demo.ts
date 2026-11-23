import type { Tx } from './db';
import { addDays } from '@/lib/dates';
import { STARTER_FOODS } from '@/lib/starter-foods';
import { createFood } from './services/foods';
import { createMeal } from './services/meals';
import { createRecipe } from './services/recipes';
import { draftFromEstimate, insertEntry, logFood, logMeal, logRecipe } from './services/diary';
import { upsertWeighIn } from './services/weight';
import type { FoodInput } from './services/schemas';

const byName = (n: string) => {
  const f = STARTER_FOODS.find((x) => x.name === n);
  if (!f) throw new Error(`starter food ${n} missing`);
  return f;
};

/** Import the starter library (skips foods with the same name already present). */
export async function importStarterFoods(tx: Tx): Promise<number> {
  const existing = new Set((await tx<{ name: string }[]>`select lower(name) as name from foods`).map((r) => r.name));
  let n = 0;
  for (const f of STARTER_FOODS) {
    if (existing.has(f.name.toLowerCase())) continue;
    await createFood(tx, f);
    n++;
  }
  return n;
}

export const DEMO_SHAKE: FoodInput = {
  name: 'Protein shake (demo label)',
  aliases: ['shake', 'protein', 'whey', 'протеин'],
  brand: 'Demo whey',
  barcode: null,
  basis: 'per_serving',
  serving_label: 'scoop',
  serving_grams: null, // weight per scoop unknown: logged per scoop only
  serving_ml: null,
  grams_per_ml: null,
  kcal: 120,
  protein_g: 25,
  carbs_g: 3,
  fat_g: 1.5,
  units: [{ unit: 'scoop', label: 'scoop', servings: 1 }],
  default_amount: 1,
  default_unit: 'scoop',
  state: null,
  source: 'demo',
  source_label: 'Demo values. Replace with your own label.',
  assumptions: null,
  notes: '25 g protein per scoop. Calories and other macros are placeholders.',
  is_favorite: true,
};

/** Demo data for the bulking account: raspberry oats, dry pasta, a shake, weigh-ins. */
export async function seedDemoBulker(tx: Tx, today: string) {
  const ids: Record<string, string> = {};
  for (const n of ['Rolled oats', 'Milk 2%', 'Raspberries', 'Peanut butter', 'Banana', 'Pasta, dry']) {
    ids[n] = (await createFood(tx, { ...byName(n), source: 'demo' })).id;
  }
  const shake = await createFood(tx, DEMO_SHAKE);
  const oats = await createMeal(tx, {
    name: 'Raspberry oats',
    aliases: ['ovesna kasha', 'овесна каша', 'oats bowl'],
    default_slot: 'breakfast',
    is_favorite: true,
    items: [
      { food_id: ids['Rolled oats'], amount: 80, unit: 'g' },
      { food_id: ids['Milk 2%'], amount: 250, unit: 'ml' },
      { food_id: ids['Raspberries'], amount: 100, unit: 'g' },
      { food_id: ids['Peanut butter'], amount: 15, unit: 'g' },
      { food_id: ids['Banana'], amount: 1, unit: 'piece' },
    ],
  });
  await logMeal(tx, oats.id, addDays(today, -1), 'breakfast');
  await logMeal(tx, oats.id, today, 'breakfast');
  await logFood(tx, shake.id, today, 'snacks');
  await logFood(tx, ids['Pasta, dry'], today, 'dinner', 125, 'g');
  const weights = [74.6, 74.8, null, 74.9, 75.1, null, 75.0, 75.2, 75.3, null, 75.4, 75.2, 75.5, 75.6];
  for (const [i, w] of weights.entries()) {
    if (w != null) await upsertWeighIn(tx, { date: addDays(today, i - (weights.length - 1)), weight_kg: w });
  }
  return { oatsMealId: oats.id, shakeId: shake.id };
}

/** Demo data for the second account: a podvarok recipe with an estimated yield and a GPT estimate. */
export async function seedDemoPartner(tx: Tx, today: string) {
  const ids: Record<string, string> = {};
  for (const n of ['Sauerkraut', 'Pork shoulder, raw', 'Onion', 'Sunflower oil']) {
    ids[n] = (await createFood(tx, { ...byName(n), source: 'demo' })).id;
  }
  const podvarok = await createRecipe(tx, {
    name: 'Homemade podvarok',
    aliases: ['подварок', 'podvarok'],
    yield_unit: 'g',
    yield_amount: 1400,
    yield_estimated: true,
    default_amount: 250,
    default_unit: 'g',
    notes: 'Demo recipe. Finished weight is an estimate; weigh the pot next time.',
    ingredients: [
      { food_id: ids['Sauerkraut'], amount: 1000, unit: 'g' },
      { food_id: ids['Pork shoulder, raw'], amount: 500, unit: 'g' },
      { food_id: ids['Onion'], amount: 150, unit: 'g' },
      { food_id: ids['Sunflower oil'], amount: 30, unit: 'g' },
    ],
  });
  await insertEntry(
    tx,
    draftFromEstimate(
      {
        name: 'Podvarok (estimate)',
        amount: 230,
        unit: 'g',
        state: 'cooked',
        kcal: 290,
        protein_g: 14,
        carbs_g: 9,
        fat_g: 22,
        assumptions: 'Demo: GPT estimate assuming sauerkraut baked with pork and about 1 tbsp oil per portion.',
      },
      addDays(today, -1),
      'lunch',
    ),
  );
  await logRecipe(tx, podvarok.id, today, 'lunch', 230, 'g');
  await upsertWeighIn(tx, { date: addDays(today, -2), weight_kg: 58.4 });
  await upsertWeighIn(tx, { date: today, weight_kg: 58.2 });
  return { podvarokRecipeId: podvarok.id };
}

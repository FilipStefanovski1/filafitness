import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestUser, deleteTestUser, type TestUser } from '../support/users';
import { asUser, closeDb } from '@/server/db';
import { createFood, getFood, updateFood, foodToInput } from '@/server/services/foods';
import { createMeal, getMeal } from '@/server/services/meals';
import { createRecipe, getRecipe, updateRecipe } from '@/server/services/recipes';
import {
  copyEntries,
  draftFromEstimate,
  draftQuick,
  getDay,
  getEntry,
  insertEntry,
  logFood,
  logMeal,
  logRecipe,
  saveEntriesAsMeal,
  saveEntryAsFood,
  updateEntry,
} from '@/server/services/diary';
import { searchLibrary, recentItems } from '@/server/services/library';
import { STARTER_FOODS } from '@/lib/starter-foods';
import { parseEstimate } from '@/lib/gpt';
import { estimateItemSchema } from '@/server/services/schemas';
import { importStarterFoods, DEMO_SHAKE } from '@/server/demo';

let filip: TestUser;
let partner: TestUser;
const starter = (n: string) => STARTER_FOODS.find((f) => f.name === n)!;

beforeAll(async () => {
  filip = await createTestUser('Filip', { kcal_target: 2900, protein_target_g: 150, goal_weight_kg: 80 });
  partner = await createTestUser('Partner');
});
afterAll(async () => {
  await deleteTestUser(filip);
  await deleteTestUser(partner);
  await closeDb();
});

describe('profiles', () => {
  it('prefills invite targets only for the invited account', async () => {
    const a = await asUser(filip.id, (tx) => tx`select kcal_target, protein_target_g, goal_weight_kg, timezone from profiles`);
    expect(a).toEqual([{ kcal_target: 2900, protein_target_g: 150, goal_weight_kg: 80, timezone: 'Europe/Skopje' }]);
    const b = await asUser(partner.id, (tx) => tx`select kcal_target from profiles`);
    expect(b).toEqual([{ kcal_target: 2000 }]);
  });
});

describe('acceptance: raspberry oats', () => {
  it('logs the usual bowl, then 60 g oats once; meal default and earlier entry unchanged', async () => {
    await asUser(filip.id, async (tx) => {
      const ids: Record<string, string> = {};
      for (const n of ['Rolled oats', 'Milk 2%', 'Raspberries', 'Peanut butter', 'Banana']) ids[n] = (await createFood(tx, starter(n))).id;
      const meal = await createMeal(tx, {
        name: 'Raspberry oats',
        items: [
          { food_id: ids['Rolled oats'], amount: 80, unit: 'g' },
          { food_id: ids['Milk 2%'], amount: 250, unit: 'ml' },
          { food_id: ids['Raspberries'], amount: 100, unit: 'g' },
          { food_id: ids['Peanut butter'], amount: 15, unit: 'g' },
          { food_id: ids['Banana'], amount: 1, unit: 'piece' },
        ],
      });
      const usual = await logMeal(tx, meal.id, '2026-11-21', 'breakfast');
      // 303.2 + 125 + 52 + 88.2 + 105.02
      expect(usual.kcal).toBeCloseTo(673.42, 6);
      expect(usual.components).toHaveLength(5);

      const oatsItem = meal.items.find((i) => i.food_id === ids['Rolled oats'])!;
      const lighter = await logMeal(tx, meal.id, '2026-11-22', 'breakfast', { [oatsItem.id]: { amount: 60 } });
      expect(lighter.kcal).toBeCloseTo(673.42 - 75.8, 6);
      expect(lighter.components.find((c) => c.food_id === ids['Rolled oats'])!.amount).toBe(60);

      const after = await getMeal(tx, meal.id);
      expect(after.items.find((i) => i.id === oatsItem.id)!.amount).toBe(80);
      const yesterday = await getEntry(tx, usual.id);
      expect(yesterday.kcal).toBeCloseTo(673.42, 6);
      expect(yesterday.components.find((c) => c.food_id === ids['Rolled oats'])!.amount).toBe(80);

      // Editing today's entry later re-portions from its own snapshot only.
      const edited = await updateEntry(tx, lighter.id, { components: [{ id: lighter.components[0].id, amount: 70, unit: 'g' }] });
      expect(edited.kcal).toBeCloseTo(673.42 - 37.9, 6);
      expect((await getEntry(tx, usual.id)).kcal).toBeCloseTo(673.42, 6);
    });
  });
});

describe('acceptance: GPT estimate import', () => {
  it('imports podvarok + kifla, saves both to the diary and podvarok for reuse', async () => {
    const pasted = JSON.stringify({
      items: [
        {
          name: 'Подварок',
          amount: 230,
          unit: 'g',
          state: 'cooked',
          calories: 290,
          protein_g: 14,
          carbs_g: 9,
          fat_g: 22,
          assumptions: 'pork + 1 tbsp oil',
        },
        { name: 'Kifla', amount: 36, unit: 'g', calories: 105, protein_g: 3.2, carbs_g: 19, fat_g: null, assumptions: 'plain roll' },
      ],
    });
    const parsed = parseEstimate(pasted);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    // User corrects the kifla portion in the preview before saving.
    const edited = parsed.items.map((i) => (i.name === 'Kifla' ? { ...i, amount: 40, kcal: 117 } : i));
    await asUser(partner.id, async (tx) => {
      const entries = [];
      for (const it of edited) entries.push(await insertEntry(tx, draftFromEstimate(estimateItemSchema.parse(it), '2026-11-22', 'lunch')));
      const day = await getDay(tx, '2026-11-22');
      expect(day.entries).toHaveLength(2);
      expect(day.totals.kcal).toBe(407);
      expect(day.totals.missing).toEqual(['fat_g']); // kifla fat unknown
      expect(day.totals.fat_g).toBe(22);
      expect(day.entries.every((e) => e.is_estimate && e.source_label === 'GPT estimate')).toBe(true);
      expect(day.entries[0].assumptions).toBe('pork + 1 tbsp oil');

      const food = await saveEntryAsFood(tx, entries[0].id, { aliases: ['podvarok'] });
      expect(food.source).toBe('gpt_estimate');
      expect(food.source_label).toBe('GPT estimate');
      expect(food.assumptions).toBe('pork + 1 tbsp oil');
      expect(food.default_amount).toBe(230);

      const hits = await searchLibrary(tx, 'podvarok');
      expect(hits.map((h) => h.id)).toContain(food.id);
      expect((await searchLibrary(tx, 'подварок')).map((h) => h.id)).toContain(food.id);
      // A favorite must not show up for an unrelated query.
      await tx`update foods set is_favorite = true`;
      expect(await searchLibrary(tx, 'zzzz-nothing')).toEqual([]);

      // Next time: log 200 g of the saved estimate; still marked as an estimate.
      const again = await logFood(tx, food.id, '2026-11-23', 'lunch', 200, 'g');
      expect(again.kcal).toBeCloseTo((290 * 200) / 230, 9);
      expect(again.is_estimate).toBe(true);
      expect(again.assumptions).toBe('pork + 1 tbsp oil');
      expect((await recentItems(tx)).map((r) => r.id)).toContain(food.id);
    });
  });
});

describe('acceptance: recipes and snapshots', () => {
  it('scales a known batch yield to a weighed portion and keeps old totals after edits', async () => {
    await asUser(partner.id, async (tx) => {
      const kraut = await createFood(tx, starter('Sauerkraut'));
      const pork = await createFood(tx, starter('Pork shoulder, raw'));
      const oil = await createFood(tx, starter('Sunflower oil'));
      const r = await createRecipe(tx, {
        name: 'Podvarok',
        aliases: ['подварок'],
        yield_unit: 'g',
        yield_amount: 1400,
        default_amount: 230,
        default_unit: 'g',
        ingredients: [
          { food_id: kraut.id, amount: 1000, unit: 'g' },
          { food_id: pork.id, amount: 500, unit: 'g' },
          { food_id: oil.id, amount: 30, unit: 'g' },
        ],
      });
      // batch = 190 + 930 + 265.2 = 1385.2 kcal; protein 9 + 86 = 95
      expect(r.batch.kcal).toBeCloseTo(1385.2, 9);
      const e = await logRecipe(tx, r.id, '2026-11-20', 'dinner', 230, 'g');
      expect(e.kcal).toBeCloseTo((1385.2 * 230) / 1400, 9);
      expect(e.protein_g).toBeCloseTo((95 * 230) / 1400, 9);
      const before = e.kcal;

      // Change the label of an ingredient and the recipe itself.
      await updateFood(tx, pork.id, { ...foodToInput(await getFood(tx, pork.id)), kcal: 250 });
      const r2 = await updateRecipe(tx, r.id, {
        name: 'Podvarok',
        yield_unit: 'g',
        yield_amount: 1300,
        default_amount: 230,
        default_unit: 'g',
        ingredients: [
          { food_id: kraut.id, amount: 1000, unit: 'g' },
          { food_id: pork.id, amount: 600, unit: 'g' },
        ],
      });
      expect(r2.batch.kcal).toBeCloseTo(190 + 1500, 9);
      expect((await getEntry(tx, e.id)).kcal).toBeCloseTo(before, 9);
      const day = await getDay(tx, '2026-11-20');
      expect(day.totals.kcal).toBeCloseTo(before, 9);
      // Re-portioning the old entry uses the old recipe snapshot.
      const reportioned = await updateEntry(tx, e.id, { components: [{ id: e.components[0].id, amount: 460, unit: 'g' }] });
      expect(reportioned.kcal).toBeCloseTo(before * 2, 9);

      // Estimated yield is marked on the entry.
      const est = await createRecipe(tx, {
        name: 'Guess stew',
        yield_unit: 'g',
        yield_amount: 1000,
        yield_estimated: true,
        default_amount: 200,
        default_unit: 'g',
        ingredients: [{ food_id: pork.id, amount: 500, unit: 'g' }],
      });
      const estEntry = await logRecipe(tx, est.id, '2026-11-20', 'dinner');
      expect(estEntry.source_label).toBe('Estimated batch yield');
      expect(estEntry.components[0].snapshot.estimatedYield).toBe(true);
      expect((await getRecipe(tx, est.id)).yield_estimated).toBe(true);
    });
  });
});

describe('quick add, copy, scoops, save as meal', () => {
  it('handles unknown protein, copies, scoop foods and meal assembly', async () => {
    await asUser(filip.id, async (tx) => {
      const q = await insertEntry(
        tx,
        draftQuick({ name: 'Burek', kcal: 450, protein_g: null, carbs_g: null, fat_g: null }, '2026-11-10', 'breakfast'),
      );
      expect(q.protein_g).toBeNull();
      expect(q.missing).toEqual(['protein_g', 'carbs_g', 'fat_g']);

      const shake = await createFood(tx, DEMO_SHAKE);
      const s1 = await logFood(tx, shake.id, '2026-11-10', 'snacks');
      const s2 = await logFood(tx, shake.id, '2026-11-10', 'snacks', 2, 'scoop');
      expect(s1.protein_g).toBe(25);
      expect(s2.protein_g).toBe(50);
      await expect(logFood(tx, shake.id, '2026-11-10', 'snacks', 30, 'g')).rejects.toThrow(/conversion/);

      const day = await getDay(tx, '2026-11-10');
      expect(day.totals.protein_g).toBe(75);
      expect(day.totals.missing).toContain('protein_g');
      expect(day.incompleteEntries).toBe(1);

      const copies = await copyEntries(tx, [q.id, s1.id], '2026-11-11', 'lunch');
      expect(copies.map((c) => c.slot)).toEqual(['lunch', 'lunch']);
      expect((await getDay(tx, '2026-11-11')).totals.kcal).toBe(570);

      const meal = await saveEntriesAsMeal(tx, [q.id, s1.id], 'Burek & shake');
      expect(meal.items).toHaveLength(2);
      expect(meal.totals.kcal).toBe(570);
      expect(meal.items.find((i) => i.food_id === shake.id)).toBeTruthy();
    });
  });

  it('imports the starter library once', async () => {
    const n = await asUser(partner.id, (tx) => importStarterFoods(tx));
    expect(n).toBeGreaterThan(10);
    expect(await asUser(partner.id, (tx) => importStarterFoods(tx))).toBe(0);
  });
});

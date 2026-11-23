import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestUser, deleteTestUser, type TestUser } from '../support/users';
import { asUser, closeDb } from '@/server/db';
import { addWater, getWater } from '@/server/services/water';
import { loggingStreak } from '@/server/services/streak';
import { draftQuick, insertEntry } from '@/server/services/diary';
import { normalize } from '@/server/off';

let a: TestUser, b: TestUser;
beforeAll(async () => {
  a = await createTestUser('ExtraA');
  b = await createTestUser('ExtraB');
});
afterAll(async () => {
  await deleteTestUser(a);
  await deleteTestUser(b);
  await closeDb();
});

describe('water', () => {
  it('adds, never goes below zero, and is private', async () => {
    await asUser(a.id, async (tx) => {
      expect(await addWater(tx, '2026-11-23', 250)).toBe(250);
      expect(await addWater(tx, '2026-11-23', 500)).toBe(750);
      expect(await addWater(tx, '2026-11-23', -1000)).toBe(0);
      expect(await addWater(tx, '2026-11-23', 250)).toBe(250);
    });
    expect(await asUser(b.id, (tx) => getWater(tx, '2026-11-23'))).toBe(0);
    expect(await asUser(b.id, async (tx) => (await tx`select count(*)::int n from water_days`)[0].n)).toBe(0);
  });
});

describe('streak', () => {
  it('counts consecutive logged days ending today or yesterday', async () => {
    await asUser(a.id, async (tx) => {
      for (const d of ['2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'])
        await insertEntry(tx, draftQuick({ name: 'x', kcal: 1, protein_g: null, carbs_g: null, fat_g: null }, d, 'snacks'));
      expect(await loggingStreak(tx, '2026-11-23')).toBe(4); // today not logged yet
      expect(await loggingStreak(tx, '2026-11-22')).toBe(4);
      expect(await loggingStreak(tx, '2026-11-25')).toBe(0);
    });
  });
});

describe('Open Food Facts normalization', () => {
  it('keeps per-100 g values, converts kJ, and rejects junk', () => {
    expect(
      normalize({
        code: '123',
        product_name: 'Skyr',
        brands: ['Isey'],
        nutriments: { 'energy-kcal_100g': 62, proteins_100g: 11, carbohydrates_100g: 4, fat_100g: 0.2 },
        serving_quantity: 150,
        serving_size: '150 g',
      }),
    ).toEqual({
      code: '123',
      name: 'Skyr',
      brand: 'Isey',
      kcal: 62,
      protein_g: 11,
      carbs_g: 4,
      fat_g: 0.2,
      serving_g: 150,
      serving_label: '150 g',
    });
    expect(normalize({ code: '1', product_name: 'kJ only', nutriments: { energy_100g: 418.4 } })?.kcal).toBe(100);
    expect(normalize({ code: '1', product_name: 'No energy', nutriments: {} })).toBeNull();
    expect(normalize({ code: '1', product_name: 'Bad', nutriments: { 'energy-kcal_100g': 5000 } })).toBeNull();
    expect(normalize({ code: '1', product_name: 'No protein', nutriments: { 'energy-kcal_100g': 100 } })?.protein_g).toBeNull();
  });
});

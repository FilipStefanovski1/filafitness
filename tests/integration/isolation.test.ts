import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestUser, deleteTestUser, type TestUser } from '../support/users';
import { asUser, closeDb } from '@/server/db';
import { createFood } from '@/server/services/foods';
import { createRecipe } from '@/server/services/recipes';
import { getDay, logFood, logRecipe } from '@/server/services/diary';
import { upsertWeighIn, weightTrend } from '@/server/services/weight';
import { acceptShare, createShare, listShares } from '@/server/services/shares';
import { getProfile } from '@/server/services/profile';
import { allLibraryItems } from '@/server/services/library';
import { STARTER_FOODS } from '@/lib/starter-foods';

let a: TestUser;
let b: TestUser;
const ids: Record<string, string> = {};
const starter = (n: string) => STARTER_FOODS.find((f) => f.name === n)!;

beforeAll(async () => {
  a = await createTestUser('Alice', { kcal_target: 2900, protein_target_g: 150 });
  b = await createTestUser('Bob');
  for (const u of [a, b]) await asUser(u.id, (tx) => tx`update profiles set onboarded = true`);
  await asUser(a.id, async (tx) => {
    const kraut = await createFood(tx, starter('Sauerkraut'));
    const pork = await createFood(tx, starter('Pork shoulder, raw'));
    const secret = await createFood(tx, { ...starter('Banana'), name: 'Alice private food' });
    const r = await createRecipe(tx, {
      name: 'Podvarok',
      yield_unit: 'g',
      yield_amount: 1200,
      default_amount: 250,
      default_unit: 'g',
      ingredients: [
        { food_id: kraut.id, amount: 1000, unit: 'g' },
        { food_id: pork.id, amount: 400, unit: 'g' },
      ],
    });
    ids.kraut = kraut.id;
    ids.secret = secret.id;
    ids.recipe = r.id;
    ids.entry = (await logRecipe(tx, r.id, '2026-11-22', 'lunch')).id;
    await logFood(tx, secret.id, '2026-11-22', 'snacks');
    await upsertWeighIn(tx, { date: '2026-11-22', weight_kg: 75.4 });
  });
});
afterAll(async () => {
  await deleteTestUser(a);
  await deleteTestUser(b);
  await closeDb();
});

describe('database isolation (RLS)', () => {
  it('hides every other-user row', async () => {
    await asUser(b.id, async (tx) => {
      for (const t of [
        'foods',
        'recipes',
        'recipe_ingredients',
        'meals',
        'meal_items',
        'diary_entries',
        'diary_components',
        'weigh_ins',
        'api_tokens',
        'mcp_requests',
      ]) {
        const [{ n }] = await tx.unsafe(`select count(*)::int as n from ${t}`);
        expect(n, t).toBe(0);
      }
      const profiles = await tx`select user_id from profiles`;
      expect(profiles.map((p) => p.user_id)).toEqual([b.id]);
      expect(await tx`select * from oauth_clients`).toHaveLength(0);
    });
  });

  it('blocks writes to other users and cross-user references', async () => {
    await asUser(b.id, async (tx) => {
      const upd = await tx`update diary_entries set kcal = 0 where id = ${ids.entry} returning id`;
      expect(upd).toHaveLength(0);
      const del = await tx`delete from weigh_ins returning id`;
      expect(del).toHaveLength(0);
    });
    await expect(
      asUser(b.id, (tx) => tx`insert into foods (user_id, name, basis, kcal) values (${a.id}, 'x', 'per_100g', 1)`),
    ).rejects.toThrow(/row-level security/);
    // B cannot build a meal from A's food.
    await expect(
      asUser(b.id, async (tx) => {
        const [m] = await tx`insert into meals (name) values ('steal') returning id`;
        await tx`insert into meal_items (meal_id, food_id, amount, unit) values (${m.id}, ${ids.kraut}, 1, 'g')`;
      }),
    ).rejects.toThrow(/row-level security/);
    // B cannot see A's targets.
    expect((await asUser(b.id, (tx) => getProfile(tx, b.id))).kcal_target).toBe(2000);
  });

  it('service reads are scoped to the caller', async () => {
    const day = await asUser(b.id, (tx) => getDay(tx, '2026-11-22'));
    expect(day.entries).toHaveLength(0);
    const trend = await asUser(b.id, (tx) => weightTrend(tx, '2026-11-22'));
    expect(trend.weights).toHaveLength(0);
    await expect(asUser(b.id, (tx) => logRecipe(tx, ids.recipe, '2026-11-22', 'lunch'))).rejects.toThrow(/not found/);
  });
});

describe('sharing exposes only the shared item', () => {
  it('copies one recipe with its ingredients and nothing else', async () => {
    await asUser(a.id, (tx) => createShare(tx, 'Alice', { type: 'recipe', id: ids.recipe, recipient_id: b.id }));
    const { incoming } = await asUser(b.id, (tx) => listShares(tx, b.id));
    expect(incoming).toHaveLength(1);
    const payload = JSON.stringify(incoming[0].payload);
    expect(payload).toContain('Podvarok');
    expect(payload).not.toContain('Alice private food');
    expect(payload).not.toContain('75.4');
    expect(payload).not.toContain('2900');
    expect(payload).not.toContain(ids.entry);
    expect(payload).not.toContain(a.id);

    const created = await asUser(b.id, (tx) => acceptShare(tx, b.id, incoming[0].id));
    const lib = await asUser(b.id, (tx) => allLibraryItems(tx));
    expect(lib.map((i) => i.name).sort()).toEqual(['Pork shoulder, raw', 'Podvarok', 'Sauerkraut'].sort());
    expect(lib.find((i) => i.type === 'recipe')!.source_label).toBe('Shared by Alice');

    // B's copy is independent: B can log it; A's diary is untouched and still invisible.
    const e = await asUser(b.id, (tx) => logRecipe(tx, created.id, '2026-11-22', 'dinner', 250, 'g'));
    expect(e.kcal).toBeGreaterThan(0);
    expect((await asUser(a.id, (tx) => getDay(tx, '2026-11-22'))).entries).toHaveLength(2);
    expect((await asUser(b.id, (tx) => getDay(tx, '2026-11-22'))).entries).toHaveLength(1);
  });

  it('a recipient cannot alter a share payload', async () => {
    await expect(asUser(b.id, (tx) => tx`update shares set payload = '{}'::jsonb`)).rejects.toThrow(/immutable/);
  });
});

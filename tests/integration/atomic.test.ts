import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createTestUser, deleteTestUser, type TestUser } from '../support/users';
import { asUser, closeDb } from '@/server/db';
import { idempotent } from '@/server/services/idempotency';
import { draftFromEstimate, insertEntry } from '@/server/services/diary';

let u: TestUser;
beforeAll(async () => {
  u = await createTestUser('Atomic');
});
afterAll(async () => {
  await deleteTestUser(u);
  await closeDb();
});
const count = () =>
  asUser(
    u.id,
    async (tx) => (await tx`select (select count(*) from diary_entries)::int as e, (select count(*) from mcp_requests)::int as r`)[0],
  );
const item = (name: string) => ({ name, amount: 100, unit: 'g' as const, kcal: 100, protein_g: 5, carbs_g: 10, fat_g: 2 });

describe('atomic multi-item writes', () => {
  it('a failure after the first item rolls back everything, and the same request can be retried', async () => {
    const rid = randomUUID();
    const args = { items: ['a', 'b'] };
    await expect(
      asUser(u.id, (tx) =>
        idempotent(tx, rid, 'log_estimate', args, async () => {
          await insertEntry(tx, draftFromEstimate(item('First'), '2026-11-22', 'lunch'));
          throw new Error('simulated database failure');
        }),
      ),
    ).rejects.toThrow('simulated');
    expect(await count()).toEqual({ e: 0, r: 0 });

    const ok = await asUser(u.id, (tx) =>
      idempotent(tx, rid, 'log_estimate', args, async () => {
        const a = await insertEntry(tx, draftFromEstimate(item('First'), '2026-11-22', 'lunch'));
        const b = await insertEntry(tx, draftFromEstimate(item('Second'), '2026-11-22', 'lunch'));
        return { ids: [a.id, b.id] };
      }),
    );
    expect(ok.replayed).toBe(false);
    expect(await count()).toEqual({ e: 2, r: 1 });
    const again = await asUser(u.id, (tx) => idempotent(tx, rid, 'log_estimate', args, async () => ({ ids: ['never'] })));
    expect(again).toEqual({ result: ok.result, replayed: true });
    expect(await count()).toEqual({ e: 2, r: 1 });
  });

  it('a component that violates a DB constraint fails the whole entry', async () => {
    const before = await count();
    await expect(
      asUser(u.id, (tx) =>
        insertEntry(tx, {
          date: '2026-11-22',
          slot: 'lunch',
          kind: 'meal',
          name: 'Broken meal',
          components: [
            {
              name: 'ok',
              amount: 100,
              unit: 'g',
              spec: { name: 'ok', basis: 'per_100g', per: { kcal: 100, protein_g: 1, carbs_g: 1, fat_g: 1 } },
            },
            {
              name: 'negative',
              amount: 100,
              unit: 'g',
              spec: { name: 'neg', basis: 'per_100g', per: { kcal: -100, protein_g: 1, carbs_g: 1, fat_g: 1 } },
            },
          ],
        }),
      ),
    ).rejects.toThrow();
    expect(await count()).toEqual(before);
  });
});

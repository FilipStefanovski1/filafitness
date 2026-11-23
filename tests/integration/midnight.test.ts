import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestUser, deleteTestUser, type TestUser } from '../support/users';
import { asUser, closeDb } from '@/server/db';
import { defaultLogTarget } from '@/server/services/status';
import { getDay, getEntry, insertEntry, draftQuick } from '@/server/services/diary';
import { getProfile } from '@/server/services/profile';
import { addDays } from '@/lib/dates';
import { fmtMacro } from '@/lib/nutrition/format';

let u: TestUser;
beforeAll(async () => {
  u = await createTestUser('Night');
});
afterAll(async () => {
  await deleteTestUser(u);
  await closeDb();
});

describe('local dates', () => {
  it('a meal logged at 00:15 in Skopje lands on the new local date', async () => {
    const instant = new Date('2026-11-22T23:15:00Z'); // 00:15 on 23 Nov in Europe/Skopje
    const id = await asUser(u.id, async (tx) => {
      const p = await getProfile(tx, u.id);
      expect(p.timezone).toBe('Europe/Skopje');
      const target = defaultLogTarget(p.timezone, instant);
      expect(target).toEqual({ date: '2026-11-23', slot: 'snacks' });
      const e = await insertEntry(tx, {
        ...draftQuick({ name: 'Late toast', kcal: 200, protein_g: null, carbs_g: 30, fat_g: 5 }, target.date, target.slot),
        logged_at: instant,
      });
      return e.id;
    });
    await asUser(u.id, async (tx) => {
      const e = await getEntry(tx, id);
      expect(e.local_date).toBe('2026-11-23');
      expect((await getDay(tx, '2026-11-23')).entries.map((x) => x.id)).toContain(id);
      expect((await getDay(tx, addDays('2026-11-23', -1))).entries.map((x) => x.id)).not.toContain(id);
      // Unknown protein is shown as unknown, not as a measured 0 g.
      const day = await getDay(tx, '2026-11-23');
      expect(e.protein_g).toBeNull();
      expect(fmtMacro(e, 'protein_g')).toBe('? g');
      expect(day.totals.missing).toContain('protein_g');
      expect(day.incompleteEntries).toBe(1);
    });
  });

  it('respects another timezone setting', () => {
    expect(defaultLogTarget('America/New_York', new Date('2026-11-23T04:30:00Z')).date).toBe('2026-11-22');
    expect(defaultLogTarget('Europe/Skopje', new Date('2026-11-23T07:00:00Z')).slot).toBe('breakfast');
  });
});

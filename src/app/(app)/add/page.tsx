import { requireUser } from '@/server/auth';
import { asUser } from '@/server/db';
import { allLibraryItems, recentItems, recentOneOffs } from '@/server/services/library';
import { resolveDate } from '@/lib/dates';
import { SLOTS, type Slot } from '@/lib/nutrition/types';
import { defaultLogTarget } from '@/server/services/status';
import { AddFood } from './AddFood';

export default async function AddPage({ searchParams }: { searchParams: Promise<{ date?: string; slot?: string; tab?: string }> }) {
  const { userId, profile } = await requireUser();
  const sp = await searchParams;
  const date = resolveDate(sp.date, profile.timezone);
  const now = defaultLogTarget(profile.timezone);
  const slot: Slot = (SLOTS as readonly string[]).includes(sp.slot ?? '') ? (sp.slot as Slot) : date === now.date ? now.slot : 'breakfast';
  const { items, recent, oneOffs } = await asUser(userId, async (tx) => ({
    items: await allLibraryItems(tx),
    recent: (await recentItems(tx, 25)).map((r) => `${r.type}:${r.id}`),
    oneOffs: await recentOneOffs(tx),
  }));
  return (
    <AddFood
      date={date}
      slot={slot}
      items={items}
      recent={recent}
      oneOffs={oneOffs}
      initialTab={sp.tab === 'favorites' ? 'favorites' : 'recent'}
    />
  );
}

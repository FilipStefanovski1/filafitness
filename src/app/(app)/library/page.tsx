import { requireUser } from '@/server/auth';
import { asUser } from '@/server/db';
import { allLibraryItems } from '@/server/services/library';
import { LibraryList } from './LibraryList';

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { userId } = await requireUser();
  const sp = await searchParams;
  const items = await asUser(userId, (tx) => allLibraryItems(tx));
  const tab = sp.tab === 'meal' || sp.tab === 'recipe' ? sp.tab : 'food';
  return <LibraryList items={items} initialTab={tab} />;
}

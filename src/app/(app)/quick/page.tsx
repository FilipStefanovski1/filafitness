import { requireUser } from '@/server/auth';
import { resolveDate } from '@/lib/dates';
import { SLOTS, type Slot } from '@/lib/nutrition/types';
import { QuickAdd } from './QuickAdd';

export default async function QuickPage({ searchParams }: { searchParams: Promise<{ date?: string; slot?: string; name?: string }> }) {
  const { profile } = await requireUser();
  const sp = await searchParams;
  const slot = ((SLOTS as readonly string[]).includes(sp.slot ?? '') ? sp.slot : 'snacks') as Slot;
  return <QuickAdd date={resolveDate(sp.date, profile.timezone)} slot={slot} name={sp.name ?? ''} />;
}

import { requireUser } from '@/server/auth';
import { resolveDate } from '@/lib/dates';
import { SLOTS, type Slot } from '@/lib/nutrition/types';
import { Scanner } from './Scanner';

export default async function ScanPage({ searchParams }: { searchParams: Promise<{ date?: string; slot?: string }> }) {
  const { profile } = await requireUser();
  const sp = await searchParams;
  const slot = ((SLOTS as readonly string[]).includes(sp.slot ?? '') ? sp.slot : 'snacks') as Slot;
  return <Scanner date={resolveDate(sp.date, profile.timezone)} slot={slot} />;
}

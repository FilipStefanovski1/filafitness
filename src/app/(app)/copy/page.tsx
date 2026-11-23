import { requireUser } from '@/server/auth';
import { asUser } from '@/server/db';
import { getDay } from '@/server/services/diary';
import { addDays, isDateString, resolveDate } from '@/lib/dates';
import { SLOTS, type Slot } from '@/lib/nutrition/types';
import { CopyEntries } from './CopyEntries';

export default async function CopyPage({ searchParams }: { searchParams: Promise<{ date?: string; slot?: string; from?: string }> }) {
  const { userId, profile } = await requireUser();
  const sp = await searchParams;
  const date = resolveDate(sp.date, profile.timezone);
  const slot = ((SLOTS as readonly string[]).includes(sp.slot ?? '') ? sp.slot : 'breakfast') as Slot;
  const from = isDateString(sp.from) ? sp.from : addDays(date, -1);
  const [source, target] = await asUser(userId, async (tx) => [await getDay(tx, from), await getDay(tx, date)]);
  return (
    <CopyEntries
      date={date}
      slot={slot}
      from={from}
      source={JSON.parse(JSON.stringify(source))}
      target={JSON.parse(JSON.stringify(target))}
    />
  );
}

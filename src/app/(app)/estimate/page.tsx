import { requireUser } from '@/server/auth';
import { resolveDate } from '@/lib/dates';
import { SLOTS, type Slot } from '@/lib/nutrition/types';
import { GPT_PROMPT } from '@/lib/gpt';
import { EstimateImport } from './EstimateImport';

export default async function EstimatePage({ searchParams }: { searchParams: Promise<{ date?: string; slot?: string }> }) {
  const { profile } = await requireUser();
  const sp = await searchParams;
  const slot = ((SLOTS as readonly string[]).includes(sp.slot ?? '') ? sp.slot : 'lunch') as Slot;
  return <EstimateImport date={resolveDate(sp.date, profile.timezone)} slot={slot} prompt={GPT_PROMPT} />;
}

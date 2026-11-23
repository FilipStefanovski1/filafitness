import { notFound } from 'next/navigation';
import { requireUser } from '@/server/auth';
import { asUser } from '@/server/db';
import { foodSpec, getFood } from '@/server/services/foods';
import { getRecipe } from '@/server/services/recipes';
import { getMeal } from '@/server/services/meals';
import { AppError } from '@/server/services/errors';
import { resolveDate } from '@/lib/dates';
import { SLOTS, type Slot } from '@/lib/nutrition/types';
import { PortionForm, type PortionTarget } from './PortionForm';

export default async function LogPage({
  params,
  searchParams,
}: {
  params: Promise<{ type: string; id: string }>;
  searchParams: Promise<{ date?: string; slot?: string }>;
}) {
  const { userId, profile } = await requireUser();
  const { type, id } = await params;
  const sp = await searchParams;
  const date = resolveDate(sp.date, profile.timezone);
  const slot: Slot = (SLOTS as readonly string[]).includes(sp.slot ?? '') ? (sp.slot as Slot) : 'breakfast';
  let target: PortionTarget;
  try {
    target = await asUser(userId, async (tx): Promise<PortionTarget> => {
      if (type === 'food') {
        const f = await getFood(tx, id);
        return {
          type,
          id,
          name: f.name,
          spec: foodSpec(f),
          amount: f.default_amount,
          unit: f.default_unit,
          note: [f.brand, f.state, f.source_label].filter(Boolean).join(' · '),
          isEstimate: f.source === 'gpt_estimate',
          assumptions: f.assumptions,
        };
      }
      if (type === 'recipe') {
        const r = await getRecipe(tx, id);
        return {
          type,
          id,
          name: r.name,
          spec: r.spec,
          amount: r.default_amount,
          unit: r.default_unit,
          note: `${r.yield_estimated ? 'Estimated' : 'Finished'} batch: ${r.yield_amount} ${r.yield_unit === 'g' ? 'g' : 'servings'}`,
          isEstimate: r.yield_estimated,
          assumptions: null,
        };
      }
      if (type === 'meal') {
        const m = await getMeal(tx, id);
        return {
          type,
          id,
          name: m.name,
          items: m.items.map((i) => ({ id: i.id, name: i.name, spec: i.spec, amount: i.amount, unit: i.unit })),
          note: m.notes ?? '',
        };
      }
      throw new AppError('Not found', 404);
    });
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  }
  return <PortionForm target={target} date={date} slot={slot} />;
}

import { notFound } from 'next/navigation';
import { requireUser } from '@/server/auth';
import { asUser } from '@/server/db';
import { getMeal } from '@/server/services/meals';
import { listRecipients } from '@/server/services/shares';
import { pickOptions } from '@/server/pickOptions';
import { orNotFound } from '@/server/load';
import { MealForm } from './MealForm';

export default async function MealPage({ params }: { params: Promise<{ id: string }> }) {
  const { userId } = await requireUser();
  const { id } = await params;
  const isNew = id === 'new';
  if (!isNew && !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await orNotFound(
    asUser(userId, async (tx) => ({
      meal: isNew ? null : await getMeal(tx, id),
      options: await pickOptions(tx, { recipes: true }),
      recipients: await listRecipients(tx),
    })),
  );
  const initial = d.meal
    ? {
        name: d.meal.name,
        aliases: d.meal.aliases,
        default_slot: d.meal.default_slot,
        notes: d.meal.notes,
        is_favorite: d.meal.is_favorite,
        items: d.meal.items.map((i) => ({
          kind: (i.food_id ? 'food' : 'recipe') as 'food' | 'recipe',
          id: (i.food_id ?? i.recipe_id)!,
          amount: i.amount,
          unit: i.unit,
        })),
      }
    : null;
  return <MealForm id={isNew ? null : id} initial={initial} options={d.options} recipients={d.recipients} />;
}

import { notFound } from 'next/navigation';
import { requireUser } from '@/server/auth';
import { asUser } from '@/server/db';
import { foodToInput, getFood } from '@/server/services/foods';
import { listRecipients } from '@/server/services/shares';
import { orNotFound } from '@/server/load';
import { FoodForm } from './FoodForm';

export default async function FoodPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ log?: string; date?: string; slot?: string }>;
}) {
  const { userId } = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const isNew = id === 'new';
  if (!isNew && !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await orNotFound(
    asUser(userId, async (tx) => ({
      food: isNew ? null : await getFood(tx, id),
      recipients: await listRecipients(tx),
    })),
  );
  const logAfter = sp.log ? `date=${sp.date ?? ''}&slot=${sp.slot ?? ''}` : null;
  return (
    <FoodForm
      id={isNew ? null : id}
      initial={data.food ? foodToInput(data.food) : null}
      meta={data.food ? { source: data.food.source, archived: data.food.archived } : null}
      recipients={data.recipients}
      logAfter={logAfter}
    />
  );
}

import { notFound } from 'next/navigation';
import { requireUser } from '@/server/auth';
import { asUser } from '@/server/db';
import { getRecipe } from '@/server/services/recipes';
import { listRecipients } from '@/server/services/shares';
import { pickOptions } from '@/server/pickOptions';
import { orNotFound } from '@/server/load';
import { RecipeForm } from './RecipeForm';

export default async function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { userId } = await requireUser();
  const { id } = await params;
  const isNew = id === 'new';
  if (!isNew && !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await orNotFound(
    asUser(userId, async (tx) => ({
      recipe: isNew ? null : await getRecipe(tx, id),
      options: await pickOptions(tx, { recipes: false }),
      recipients: await listRecipients(tx),
    })),
  );
  const r = d.recipe;
  const initial = r
    ? {
        name: r.name,
        aliases: r.aliases,
        yield_unit: r.yield_unit,
        yield_amount: r.yield_amount,
        yield_estimated: r.yield_estimated,
        serving_grams: r.serving_grams,
        default_amount: r.default_amount,
        default_unit: r.default_unit,
        notes: r.notes,
        is_favorite: r.is_favorite,
        ingredients: r.ingredients.map((i) => ({ id: i.food_id, amount: i.amount, unit: i.unit })),
      }
    : null;
  return (
    <RecipeForm id={isNew ? null : id} initial={initial} options={d.options} recipients={d.recipients} source={r?.source_label ?? null} />
  );
}

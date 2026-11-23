import { notFound } from 'next/navigation';
import { requireUser } from '@/server/auth';
import { asUser } from '@/server/db';
import { getEntry } from '@/server/services/diary';
import { orNotFound } from '@/server/load';
import { EntryEditor } from './EntryEditor';

export default async function EntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { userId } = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const entry = await orNotFound(asUser(userId, (tx) => getEntry(tx, id)));
  return <EntryEditor entry={JSON.parse(JSON.stringify(entry))} />;
}

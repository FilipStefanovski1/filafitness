import { currentUserId } from '@/server/auth';
import { searchOnline } from '@/server/off';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!(await currentUserId())) return Response.json({ error: 'Not signed in' }, { status: 401 });
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim().slice(0, 80);
  if (q.length < 2) return Response.json({ items: [] });
  try {
    return Response.json({ items: await searchOnline(q) });
  } catch {
    return Response.json({ error: 'Online search is unavailable right now. Try again, or add the food manually.' }, { status: 502 });
  }
}

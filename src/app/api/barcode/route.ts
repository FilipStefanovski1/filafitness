import { currentUserId } from '@/server/auth';
import { asUser } from '@/server/db';
import { lookupBarcode } from '@/server/off';

export const dynamic = 'force-dynamic';

/**
 * Barcode lookup: your own library first, then Open Food Facts. Online values only
 * prefill a food; manual label entry always remains available.
 */
export async function GET(req: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: 'Not signed in' }, { status: 401 });
  const code = new URL(req.url).searchParams.get('code') ?? '';
  if (!/^\d{8,14}$/.test(code)) return Response.json({ error: 'Barcode must be 8–14 digits' }, { status: 400 });
  const [own] = await asUser(
    userId,
    (tx) => tx<{ id: string; name: string }[]>`select id, name from foods where barcode = ${code} and not archived limit 1`,
  );
  if (own) return Response.json({ own });
  try {
    const f = await lookupBarcode(code);
    if (!f) return Response.json({ error: 'Not found in Open Food Facts. Enter the label manually.' }, { status: 404 });
    return Response.json({ online: f, ...f });
  } catch {
    return Response.json({ error: 'Lookup failed. Enter the label manually.' }, { status: 502 });
  }
}

import { currentUserId } from '@/server/auth';

export const dynamic = 'force-dynamic';

/**
 * Optional public lookup via Open Food Facts (free, no key). Values are per 100 g and
 * only prefill the form; the user always reviews them, and manual entry remains available.
 */
export async function GET(req: Request) {
  if (!(await currentUserId())) return Response.json({ error: 'Not signed in' }, { status: 401 });
  const code = new URL(req.url).searchParams.get('code') ?? '';
  if (!/^\d{8,14}$/.test(code)) return Response.json({ error: 'Barcode must be 8–14 digits' }, { status: 400 });
  try {
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,brands,nutriments`, {
      headers: { 'User-Agent': 'FilaFitness/1.0 (personal calorie tracker)' },
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return Response.json({ error: 'Not found in Open Food Facts. Enter the label manually.' }, { status: 404 });
    const j = (await r.json()) as {
      status?: number;
      product?: { product_name?: string; brands?: string; nutriments?: Record<string, number> };
    };
    const p = j.product;
    const nm = p?.nutriments ?? {};
    const kcal = nm['energy-kcal_100g'];
    if (!p || j.status === 0 || kcal == null)
      return Response.json({ error: 'No usable nutrition for this barcode. Enter the label manually.' }, { status: 404 });
    return Response.json({
      name: p.product_name ?? '',
      brand: (p.brands ?? '').split(',')[0]?.trim() ?? '',
      kcal,
      protein_g: nm['proteins_100g'] ?? null,
      carbs_g: nm['carbohydrates_100g'] ?? null,
      fat_g: nm['fat_100g'] ?? null,
    });
  } catch {
    return Response.json({ error: 'Lookup failed. Enter the label manually.' }, { status: 502 });
  }
}

import 'server-only';

/** Open Food Facts (free, no key). Values are per 100 g; users review before logging. */
export interface OnlineFood {
  code: string;
  name: string;
  brand: string | null;
  kcal: number;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  serving_g: number | null;
  serving_label: string | null;
}

const UA = { 'User-Agent': 'FilaFitness/1.0 (personal calorie tracker)' };
const num = (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0
    ? v
    : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))
      ? Number(v)
      : null;

type Raw = {
  code?: string;
  product_name?: string;
  brands?: string | string[];
  nutriments?: Record<string, unknown>;
  serving_quantity?: unknown;
  serving_size?: string;
};

export function normalize(p: Raw): OnlineFood | null {
  const n = p.nutriments ?? {};
  let kcal = num(n['energy-kcal_100g']);
  if (kcal == null && num(n['energy_100g']) != null) kcal = num(n['energy_100g'])! / 4.184; // kJ → kcal
  const name = (p.product_name ?? '').trim();
  if (!name || kcal == null || kcal > 950 || !p.code) return null;
  const brand = Array.isArray(p.brands) ? p.brands[0] : (p.brands ?? '').split(',')[0];
  const sq = num(p.serving_quantity);
  return {
    code: p.code,
    name: name.slice(0, 200),
    brand: brand?.trim() || null,
    kcal: Math.round(kcal * 10) / 10,
    protein_g: num(n['proteins_100g']),
    carbs_g: num(n['carbohydrates_100g']),
    fat_g: num(n['fat_100g']),
    serving_g: sq && sq > 0 && sq < 2000 ? sq : null,
    serving_label: p.serving_size?.slice(0, 40) ?? null,
  };
}

const FIELDS = 'code,product_name,brands,nutriments,serving_quantity,serving_size';

export async function searchOnline(q: string): Promise<OnlineFood[]> {
  const url = `https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}&page_size=25&fields=${FIELDS}`;
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(8000), next: { revalidate: 3600 } });
  if (!r.ok) throw new Error(`search ${r.status}`);
  const j = (await r.json()) as { hits?: Raw[] };
  const seen = new Set<string>();
  return (j.hits ?? []).map(normalize).filter((x): x is OnlineFood => !!x && !seen.has(x.code) && !!seen.add(x.code));
}

export async function lookupBarcode(code: string): Promise<OnlineFood | null> {
  const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${FIELDS}`, {
    headers: UA,
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) return null;
  const j = (await r.json()) as { status?: number; product?: Raw };
  if (!j.product || j.status === 0) return null;
  return normalize({ ...j.product, code });
}

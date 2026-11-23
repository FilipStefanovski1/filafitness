import type { Tx } from '../db';
import { portion } from '@/lib/nutrition/calc';
import type { NutritionTotals, Unit } from '@/lib/nutrition/types';
import { matchScore } from '@/lib/search';
import { foodSpec, type FoodRow } from './foods';
import { listRecipes } from './recipes';
import { listMeals } from './meals';

/** A loggable thing as shown in Add Food lists and returned by MCP search. */
export interface LibraryItem {
  type: 'food' | 'meal' | 'recipe';
  id: string;
  name: string;
  subtitle: string;
  default_amount: number | null;
  default_unit: Unit | null;
  /** Nutrition of the default portion (whole meal for meals). */
  totals: NutritionTotals;
  is_favorite: boolean;
  is_estimate: boolean;
  source_label: string | null;
  aliases: string[];
}

function foodItem(f: FoodRow): LibraryItem {
  const p = portion(foodSpec(f), f.default_amount, f.default_unit);
  const totals: NutritionTotals = p.ok
    ? p
    : { kcal: 0, protein_g: null, carbs_g: null, fat_g: null, missing: ['protein_g', 'carbs_g', 'fat_g'] };
  return {
    type: 'food',
    id: f.id,
    name: f.name,
    subtitle: [f.brand, f.state].filter(Boolean).join(' · '),
    default_amount: f.default_amount,
    default_unit: f.default_unit,
    totals,
    is_favorite: f.is_favorite,
    is_estimate: f.source === 'gpt_estimate',
    source_label: f.source_label,
    aliases: f.aliases,
  };
}

export async function allLibraryItems(tx: Tx): Promise<Array<LibraryItem & { key: string }>> {
  const [foods, recipes, meals] = await Promise.all([
    tx<(FoodRow & { search_key: string })[]>`select * from foods where not archived`,
    listRecipes(tx),
    listMeals(tx),
  ]);
  const recipeKeys = new Map(
    (await tx<{ id: string; search_key: string }[]>`select id, search_key from recipes`).map((r) => [r.id, r.search_key]),
  );
  const mealKeys = new Map(
    (await tx<{ id: string; search_key: string }[]>`select id, search_key from meals`).map((r) => [r.id, r.search_key]),
  );
  return [
    ...foods.map((f) => ({ ...foodItem(f), key: f.search_key })),
    ...recipes.map((r) => {
      const p = portion(r.spec, r.default_amount, r.default_unit);
      return {
        type: 'recipe' as const,
        id: r.id,
        name: r.name,
        subtitle: `Recipe · ${r.ingredients.length} ingredients${r.yield_estimated ? ' · est. yield' : ''}`,
        default_amount: r.default_amount,
        default_unit: r.default_unit,
        totals: p.ok ? p : r.batch,
        is_favorite: r.is_favorite,
        is_estimate: false,
        source_label: r.yield_estimated ? 'Estimated batch yield' : r.source_label,
        aliases: r.aliases,
        key: recipeKeys.get(r.id) ?? '',
      };
    }),
    ...meals.map((m) => ({
      type: 'meal' as const,
      id: m.id,
      name: m.name,
      subtitle: `Meal · ${m.items.map((i) => i.name).join(', ')}`,
      default_amount: null,
      default_unit: null,
      totals: m.totals,
      is_favorite: m.is_favorite,
      is_estimate: false,
      source_label: m.source_label,
      aliases: m.aliases,
      key: mealKeys.get(m.id) ?? '',
    })),
  ];
}

function stripKey(i: LibraryItem & { key: string }): LibraryItem {
  const out: Partial<LibraryItem & { key: string }> = { ...i };
  delete out.key;
  return out as LibraryItem;
}

export async function searchLibrary(
  tx: Tx,
  query: string,
  opts: { types?: LibraryItem['type'][]; limit?: number } = {},
): Promise<LibraryItem[]> {
  const items = await allLibraryItems(tx);
  return items
    .filter((i) => !opts.types || opts.types.includes(i.type))
    .map((i) => {
      const m = matchScore(query, i.key);
      return { i, score: m && m + (i.is_favorite ? 5 : 0) };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.i.name.localeCompare(b.i.name))
    .slice(0, opts.limit ?? 50)
    .map(({ i }) => stripKey(i));
}

export async function favorites(tx: Tx): Promise<LibraryItem[]> {
  return (await allLibraryItems(tx)).filter((i) => i.is_favorite).map(stripKey);
}

/** Recently logged library items (most recent first), deduplicated. */
export async function recentItems(tx: Tx, limit = 20): Promise<LibraryItem[]> {
  const rows = await tx<{ source_id: string; kind: string; last: Date }[]>`
    select source_id, kind, max(logged_at) as last from diary_entries
    where source_id is not null and kind in ('food','meal','recipe','estimate')
    group by source_id, kind order by last desc limit ${limit * 2}`;
  if (rows.length === 0) return [];
  const all = await allLibraryItems(tx);
  const byId = new Map(all.map((i) => [i.id, i]));
  const out: LibraryItem[] = [];
  for (const r of rows) {
    const it = byId.get(r.source_id);
    if (it && !out.some((o) => o.id === it.id)) out.push(stripKey(it));
    if (out.length >= limit) break;
  }
  return out;
}

/** Recent one-off entries (quick adds / unsaved estimates) that can be copied to today. */
export async function recentOneOffs(tx: Tx, limit = 8) {
  return tx<{ id: string; name: string; kcal: number; local_date: string; is_estimate: boolean }[]>`
    select distinct on (lower(name)) id, name, kcal, to_char(local_date,'YYYY-MM-DD') as local_date, is_estimate
    from diary_entries where source_id is null and kind in ('quick','estimate')
    order by lower(name), logged_at desc limit ${limit}`;
}

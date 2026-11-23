import type { Tx } from '../db';
import { portion, sum } from '@/lib/nutrition/calc';
import type { Macro, NutritionSpec, NutritionTotals, NutritionValues, Slot, Unit } from '@/lib/nutrition/types';
import { SLOTS } from '@/lib/nutrition/types';
import { AppError } from './errors';
import { createFood, estimateSpec, foodSpec, getFood, type FoodRow } from './foods';
import { getRecipe, type ResolvedRecipe } from './recipes';
import { createMeal, getMeal, type ResolvedMeal } from './meals';
import type { EstimateItemInput } from './schemas';

export type EntryKind = 'food' | 'meal' | 'recipe' | 'quick' | 'estimate';

export interface ComponentDraft {
  name: string;
  food_id?: string | null;
  recipe_id?: string | null;
  amount: number;
  unit: Unit;
  spec: NutritionSpec;
}

export interface EntryDraft {
  date: string;
  slot: Slot;
  kind: EntryKind;
  name: string;
  source_id?: string | null;
  amount?: number | null;
  unit?: Unit | null;
  components: ComponentDraft[];
  is_estimate?: boolean;
  source_label?: string | null;
  assumptions?: string | null;
  notes?: string | null;
  logged_at?: Date;
}

export interface ComponentRow {
  id: string;
  entry_id: string;
  position: number;
  name: string;
  food_id: string | null;
  recipe_id: string | null;
  amount: number | null;
  unit: Unit | null;
  kcal: number;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  missing: Macro[];
  snapshot: NutritionSpec;
}

export interface EntryRow {
  id: string;
  user_id: string;
  local_date: string;
  slot: Slot;
  logged_at: Date;
  kind: EntryKind;
  name: string;
  source_id: string | null;
  amount: number | null;
  unit: Unit | null;
  kcal: number;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  missing: Macro[];
  is_estimate: boolean;
  source_label: string | null;
  assumptions: string | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface Entry extends EntryRow {
  components: ComponentRow[];
}

const ENTRY_COLS = `id, user_id, to_char(local_date, 'YYYY-MM-DD') as local_date, slot, logged_at, kind, name, source_id, amount, unit,
  kcal, protein_g, carbs_g, fat_g, missing, is_estimate, source_label, assumptions, notes, created_at, updated_at`;

function computeComponents(components: ComponentDraft[]) {
  if (components.length === 0) throw new AppError('Nothing to log');
  return components.map((c) => {
    const p = portion(c.spec, c.amount, c.unit);
    if (!p.ok) throw new AppError(`${c.name}: ${p.reason}`);
    return { ...c, totals: p as NutritionTotals };
  });
}

/** Insert one diary entry and all of its components. Runs inside the caller's transaction. */
export async function insertEntry(tx: Tx, draft: EntryDraft): Promise<Entry> {
  const comps = computeComponents(draft.components);
  const totals = sum(comps.map((c) => c.totals));
  const [entry] = await tx<EntryRow[]>`
    insert into diary_entries ${tx({
      local_date: draft.date,
      slot: draft.slot,
      kind: draft.kind,
      name: draft.name,
      source_id: draft.source_id ?? null,
      amount: draft.amount ?? null,
      unit: draft.unit ?? null,
      kcal: totals.kcal,
      protein_g: totals.protein_g,
      carbs_g: totals.carbs_g,
      fat_g: totals.fat_g,
      missing: tx.array(totals.missing),
      is_estimate: !!draft.is_estimate,
      source_label: draft.source_label ?? null,
      assumptions: draft.assumptions ?? null,
      notes: draft.notes ?? null,
      logged_at: draft.logged_at ?? new Date(),
    })}
    returning ${tx.unsafe(ENTRY_COLS)}`;
  const rows = comps.map((c, i) => ({
    entry_id: entry.id,
    position: i,
    name: c.name,
    food_id: c.food_id ?? null,
    recipe_id: c.recipe_id ?? null,
    amount: c.amount,
    unit: c.unit,
    kcal: c.totals.kcal,
    protein_g: c.totals.protein_g,
    carbs_g: c.totals.carbs_g,
    fat_g: c.totals.fat_g,
    missing: tx.array(c.totals.missing),
    snapshot: tx.json(c.spec as never),
  }));
  const components = await tx<ComponentRow[]>`insert into diary_components ${tx(rows)} returning *`;
  return { ...entry, components };
}

// ---------------------------------------------------------------- drafts

export function draftFromFood(food: FoodRow, date: string, slot: Slot, amount?: number | null, unit?: Unit | null): EntryDraft {
  const a = amount ?? food.default_amount;
  const u = unit ?? food.default_unit;
  const estimate = food.source === 'gpt_estimate';
  return {
    date,
    slot,
    kind: 'food',
    name: food.name,
    source_id: food.id,
    amount: a,
    unit: u,
    is_estimate: estimate,
    source_label: food.source_label ?? (estimate ? 'GPT estimate' : null),
    assumptions: estimate ? food.assumptions : null,
    components: [{ name: food.name, food_id: food.id, amount: a, unit: u, spec: foodSpec(food) }],
  };
}

export function draftFromRecipe(r: ResolvedRecipe, date: string, slot: Slot, amount?: number | null, unit?: Unit | null): EntryDraft {
  const a = amount ?? r.default_amount;
  const u = unit ?? r.default_unit;
  return {
    date,
    slot,
    kind: 'recipe',
    name: r.name,
    source_id: r.id,
    amount: a,
    unit: u,
    source_label: r.yield_estimated ? 'Estimated batch yield' : null,
    components: [{ name: r.name, recipe_id: r.id, amount: a, unit: u, spec: r.spec }],
  };
}

/** Log a meal; `overrides` change quantities for this entry only (the saved meal is untouched). */
export function draftFromMeal(
  m: ResolvedMeal,
  date: string,
  slot: Slot,
  overrides: Record<string, { amount: number; unit?: Unit }> = {},
): EntryDraft {
  return {
    date,
    slot,
    kind: 'meal',
    name: m.name,
    source_id: m.id,
    components: m.items.map((i) => ({
      name: i.name,
      food_id: i.food_id,
      recipe_id: i.recipe_id,
      amount: overrides[i.id]?.amount ?? i.amount,
      unit: overrides[i.id]?.unit ?? i.unit,
      spec: i.spec,
    })),
  };
}

export function draftFromEstimate(item: EstimateItemInput, date: string, slot: Slot, sourceLabel = 'GPT estimate'): EntryDraft {
  const values: NutritionValues = { kcal: item.kcal, protein_g: item.protein_g, carbs_g: item.carbs_g, fat_g: item.fat_g };
  const s = estimateSpec(item.name, values, item.amount ?? null, item.unit ?? null, item.state ?? null);
  return {
    date,
    slot,
    kind: 'estimate',
    name: item.name,
    amount: s.amount,
    unit: s.unit,
    is_estimate: true,
    source_label: sourceLabel,
    assumptions: item.assumptions ?? null,
    components: [{ name: item.name, amount: s.amount, unit: s.unit, spec: s.spec }],
  };
}

export function draftQuick(q: { name: string } & NutritionValues, date: string, slot: Slot): EntryDraft {
  const s = estimateSpec(q.name, q, null, null);
  s.spec.isEstimate = false;
  return {
    date,
    slot,
    kind: 'quick',
    name: q.name,
    source_label: 'Quick add',
    components: [{ name: q.name, amount: 1, unit: 'serving', spec: s.spec }],
  };
}

// ---------------------------------------------------------------- reads

export async function getEntries(tx: Tx, where: { date?: string; ids?: string[] }): Promise<Entry[]> {
  const entries = where.ids
    ? await tx<
        EntryRow[]
      >`select ${tx.unsafe(ENTRY_COLS)} from diary_entries where id = any(${tx.array(where.ids)}::uuid[]) order by logged_at`
    : await tx<EntryRow[]>`select ${tx.unsafe(ENTRY_COLS)} from diary_entries where local_date = ${where.date!} order by logged_at`;
  if (entries.length === 0) return [];
  const comps = await tx<ComponentRow[]>`
    select * from diary_components where entry_id = any(${tx.array(entries.map((e) => e.id))}::uuid[]) order by position`;
  return entries.map((e) => ({ ...e, components: comps.filter((c) => c.entry_id === e.id) }));
}

export async function getEntry(tx: Tx, id: string): Promise<Entry> {
  const [e] = await getEntries(tx, { ids: [id] });
  if (!e) throw new AppError('Entry not found', 404);
  return e;
}

export interface DayView {
  date: string;
  entries: Entry[];
  slots: Record<Slot, { entries: Entry[]; totals: NutritionTotals }>;
  totals: NutritionTotals;
  /** Number of entries with at least one unknown macro. */
  incompleteEntries: number;
}

export function summarizeDay(date: string, entries: Entry[]): DayView {
  const slots = Object.fromEntries(
    SLOTS.map((s) => {
      const es = entries.filter((e) => e.slot === s);
      return [s, { entries: es, totals: sum(es) }];
    }),
  ) as DayView['slots'];
  return {
    date,
    entries,
    slots,
    totals: sum(entries),
    incompleteEntries: entries.filter((e) => e.missing.length > 0).length,
  };
}

export async function getDay(tx: Tx, date: string): Promise<DayView> {
  return summarizeDay(date, await getEntries(tx, { date }));
}

// ---------------------------------------------------------------- writes

export interface EntryPatch {
  date?: string;
  slot?: Slot;
  name?: string;
  notes?: string | null;
  assumptions?: string | null;
  components?: Array<{ id: string; amount: number; unit: Unit }>;
  /** Replace the nutrition of a single-component quick/estimate entry (totals for its amount). */
  values?: NutritionValues & { amount?: number | null; unit?: Unit | null };
}

/** Re-portion from the stored snapshot, never from the live library item. */
export async function updateEntry(tx: Tx, id: string, patch: EntryPatch): Promise<Entry> {
  const entry = await getEntry(tx, id);
  let drafts: ComponentDraft[] = entry.components.map((c) => ({
    name: c.name,
    food_id: c.food_id,
    recipe_id: c.recipe_id,
    amount: c.amount ?? 1,
    unit: c.unit ?? 'serving',
    spec: c.snapshot,
  }));
  for (const p of patch.components ?? []) {
    const idx = entry.components.findIndex((c) => c.id === p.id);
    if (idx < 0) throw new AppError('Component not found');
    drafts[idx] = { ...drafts[idx], amount: p.amount, unit: p.unit };
  }
  if (patch.values) {
    if (drafts.length !== 1 || !['quick', 'estimate', 'food'].includes(entry.kind))
      throw new AppError('Nutrition can only be edited directly on single-item entries');
    const name = patch.name ?? entry.name;
    const s = estimateSpec(
      name,
      patch.values,
      patch.values.amount ?? drafts[0].amount,
      patch.values.unit ?? drafts[0].unit,
      drafts[0].spec.state,
    );
    s.spec.isEstimate = entry.is_estimate;
    drafts = [{ ...drafts[0], name, amount: s.amount, unit: s.unit, spec: s.spec }];
  }
  const comps = computeComponents(drafts);
  const totals = sum(comps.map((c) => c.totals));
  const single = comps.length === 1 && entry.kind !== 'meal';
  await tx`
    update diary_entries set
      local_date = ${patch.date ?? entry.local_date},
      slot = ${patch.slot ?? entry.slot},
      name = ${patch.name ?? entry.name},
      notes = ${patch.notes !== undefined ? patch.notes : entry.notes},
      assumptions = ${patch.assumptions !== undefined ? patch.assumptions : entry.assumptions},
      amount = ${single ? comps[0].amount : entry.amount},
      unit = ${single ? comps[0].unit : entry.unit},
      kcal = ${totals.kcal}, protein_g = ${totals.protein_g}, carbs_g = ${totals.carbs_g}, fat_g = ${totals.fat_g},
      missing = ${tx.array(totals.missing)}
    where id = ${id}`;
  for (const [i, c] of comps.entries()) {
    await tx`
      update diary_components set name = ${c.name}, amount = ${c.amount}, unit = ${c.unit},
        kcal = ${c.totals.kcal}, protein_g = ${c.totals.protein_g}, carbs_g = ${c.totals.carbs_g}, fat_g = ${c.totals.fat_g},
        missing = ${tx.array(c.totals.missing)}, snapshot = ${tx.json(c.spec as never)}
      where id = ${entry.components[i].id}`;
  }
  return getEntry(tx, id);
}

export async function deleteEntry(tx: Tx, id: string) {
  const res = await tx`delete from diary_entries where id = ${id} returning id`;
  if (res.length === 0) throw new AppError('Entry not found', 404);
}

/** Copy entries (exactly as logged, with their snapshots) to another date. */
export async function copyEntries(tx: Tx, ids: string[], date: string, slot?: Slot): Promise<Entry[]> {
  const entries = await getEntries(tx, { ids });
  if (entries.length !== new Set(ids).size) throw new AppError('Some entries were not found');
  const out: Entry[] = [];
  for (const e of entries) {
    out.push(
      await insertEntry(tx, {
        date,
        slot: slot ?? e.slot,
        kind: e.kind,
        name: e.name,
        source_id: e.source_id,
        amount: e.amount,
        unit: e.unit,
        is_estimate: e.is_estimate,
        source_label: e.source_label,
        assumptions: e.assumptions,
        notes: e.notes,
        components: e.components.map((c) => ({
          name: c.name,
          food_id: c.food_id,
          recipe_id: c.recipe_id,
          amount: c.amount ?? 1,
          unit: c.unit ?? 'serving',
          spec: c.snapshot,
        })),
      }),
    );
  }
  return out;
}

function foodInputFromSnapshot(c: ComponentRow, e: EntryRow, name?: string) {
  const s = c.snapshot;
  return {
    name: name?.trim() || c.name,
    basis: s.basis,
    serving_label: s.servingLabel ?? null,
    serving_grams: s.servingGrams ?? null,
    serving_ml: s.servingMl ?? null,
    grams_per_ml: s.gramsPerMl ?? null,
    kcal: s.per.kcal,
    protein_g: s.per.protein_g,
    carbs_g: s.per.carbs_g,
    fat_g: s.per.fat_g,
    units: s.units ?? [],
    default_amount: c.amount ?? 1,
    default_unit: c.unit ?? 'serving',
    state: s.state ?? null,
    source: e.is_estimate ? 'gpt_estimate' : 'diary',
    source_label: e.source_label ?? (e.is_estimate ? 'GPT estimate' : null),
    assumptions: e.assumptions,
    aliases: [],
  };
}

/** Save a single-item diary entry as a reusable food, keeping its estimate label and assumptions. */
export async function saveEntryAsFood(
  tx: Tx,
  entryId: string,
  opts: { name?: string; aliases?: string[]; favorite?: boolean } = {},
): Promise<FoodRow> {
  const e = await getEntry(tx, entryId);
  if (e.components.length !== 1) throw new AppError('Only single-item entries can be saved as a food. Use "Save as meal" instead.');
  const c = e.components[0];
  if (c.snapshot.missing?.length && c.snapshot.basis !== 'per_100g' && c.recipe_id)
    throw new AppError('This entry is a recipe portion; log the recipe instead');
  const food = await createFood(tx, {
    ...foodInputFromSnapshot(c, e, opts.name),
    aliases: opts.aliases ?? [],
    is_favorite: !!opts.favorite,
  });
  await tx`update diary_components set food_id = ${food.id} where id = ${c.id}`;
  await tx`update diary_entries set source_id = ${food.id} where id = ${e.id} and kind <> 'meal'`;
  return food;
}

/** Assemble diary entries into a reusable meal. Items without a saved food become foods first. */
export async function saveEntriesAsMeal(tx: Tx, entryIds: string[], name: string, slot?: Slot | null): Promise<ResolvedMeal> {
  const entries = await getEntries(tx, { ids: entryIds });
  if (entries.length === 0) throw new AppError('Choose at least one entry');
  const items: Array<{ food_id?: string; recipe_id?: string; amount: number; unit: Unit }> = [];
  for (const e of entries) {
    for (const c of e.components) {
      const amount = c.amount ?? 1;
      const unit = c.unit ?? 'serving';
      if (c.food_id) {
        const [f] = await tx<{ id: string }[]>`select id from foods where id = ${c.food_id} and not archived`;
        if (f) {
          items.push({ food_id: f.id, amount, unit });
          continue;
        }
      }
      if (c.recipe_id) {
        const [r] = await tx<{ id: string }[]>`select id from recipes where id = ${c.recipe_id} and not archived`;
        if (r) {
          items.push({ recipe_id: r.id, amount, unit });
          continue;
        }
      }
      const food = await createFood(tx, { ...foodInputFromSnapshot(c, e), is_favorite: false });
      items.push({ food_id: food.id, amount, unit });
    }
  }
  return createMeal(tx, { name, items, default_slot: slot ?? null });
}

export async function logFood(tx: Tx, foodId: string, date: string, slot: Slot, amount?: number | null, unit?: Unit | null) {
  return insertEntry(tx, draftFromFood(await getFood(tx, foodId), date, slot, amount, unit));
}
export async function logRecipe(tx: Tx, recipeId: string, date: string, slot: Slot, amount?: number | null, unit?: Unit | null) {
  return insertEntry(tx, draftFromRecipe(await getRecipe(tx, recipeId), date, slot, amount, unit));
}
export async function logMeal(
  tx: Tx,
  mealId: string,
  date: string,
  slot: Slot,
  overrides?: Record<string, { amount: number; unit?: Unit }>,
) {
  return insertEntry(tx, draftFromMeal(await getMeal(tx, mealId), date, slot, overrides));
}

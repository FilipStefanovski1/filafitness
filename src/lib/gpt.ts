import { z } from 'zod';
import { UNITS, type Unit } from './nutrition/types';

/** Prompt the user copies into ChatGPT. Works for text descriptions and photos. */
export const GPT_PROMPT = `You are helping me log food in my calorie tracker.
Estimate the nutrition of what I ate (from my description or photo). I may write in Macedonian, Cyrillic or Latin letters (e.g. "Izedov 230g podvarok i 36g kifla").

Reply with ONLY this JSON, no other text:
{
  "items": [
    {
      "name": "short food name, in the language I used",
      "amount": 230,
      "unit": "g",
      "state": "cooked",
      "calories": 0,
      "protein_g": 0,
      "carbs_g": 0,
      "fat_g": 0,
      "assumptions": "what you assumed: recipe, ingredients, oil, how you judged the portion"
    }
  ]
}

Rules:
- One object per separate food. Values are totals for the amount stated, not per 100 g.
- unit is one of: g, ml, serving, piece, slice, scoop. Prefer g when I gave a weight.
- state is "raw", "dry", "cooked" or null.
- If you estimated the portion from a photo, say how in "assumptions".
- If you cannot estimate a macro, use null instead of guessing 0.`;

const num = z.preprocess((v) => {
  if (typeof v === 'string') {
    const cleaned = v.replace(',', '.').replace(/[^0-9.\-]/g, '');
    return cleaned === '' ? null : Number(cleaned);
  }
  return v;
}, z.number().finite().nonnegative().nullable());

const UNIT_ALIASES: Record<string, Unit> = {
  g: 'g',
  gram: 'g',
  grams: 'g',
  gr: 'g',
  grama: 'g',
  г: 'g',
  гр: 'g',
  ml: 'ml',
  milliliter: 'ml',
  millilitre: 'ml',
  milliliters: 'ml',
  мл: 'ml',
  serving: 'serving',
  servings: 'serving',
  portion: 'serving',
  porcija: 'serving',
  piece: 'piece',
  pieces: 'piece',
  pc: 'piece',
  pcs: 'piece',
  parce: 'piece',
  парче: 'piece',
  slice: 'slice',
  slices: 'slice',
  parcinja: 'slice',
  scoop: 'scoop',
  scoops: 'scoop',
};

export function normalizeUnit(u: unknown): Unit | null {
  if (typeof u !== 'string') return null;
  const k = u.trim().toLowerCase();
  if ((UNITS as readonly string[]).includes(k)) return k as Unit;
  return UNIT_ALIASES[k] ?? null;
}

const rawItem = z
  .object({
    name: z.string().trim().min(1).max(200),
    amount: num.optional(),
    unit: z.unknown().optional(),
    state: z.unknown().optional(),
    calories: num.optional(),
    kcal: num.optional(),
    protein_g: num.optional(),
    protein: num.optional(),
    carbs_g: num.optional(),
    carbs: num.optional(),
    carbohydrates_g: num.optional(),
    fat_g: num.optional(),
    fat: num.optional(),
    assumptions: z.unknown().optional(),
    portion_assumptions: z.unknown().optional(),
    notes: z.unknown().optional(),
  })
  .passthrough();

export interface EstimateItem {
  name: string;
  amount: number | null;
  unit: Unit | null;
  state: 'raw' | 'dry' | 'cooked' | null;
  kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  assumptions: string;
}

export type ParseResult = { ok: true; items: EstimateItem[]; warnings: string[] } | { ok: false; error: string };

/** Find the first JSON object/array in free text (code fences, leading prose). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fenced?.[1], text];
  for (const c of candidates) {
    if (!c) continue;
    const trimmed = c.trim();
    try {
      return JSON.parse(trimmed);
    } catch {
      /* fall through */
    }
    const start = trimmed.search(/[[{]/);
    if (start >= 0) {
      const open = trimmed[start];
      const close = open === '{' ? '}' : ']';
      const end = trimmed.lastIndexOf(close);
      if (end > start) {
        try {
          return JSON.parse(trimmed.slice(start, end + 1).replace(/[“”]/g, '"'));
        } catch {
          /* fall through */
        }
      }
    }
  }
  throw new Error('No valid JSON found');
}

const asText = (v: unknown) => (v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v));

export function parseEstimate(text: string): ParseResult {
  if (!text.trim()) return { ok: false, error: 'Paste the JSON from ChatGPT first.' };
  let data: unknown;
  try {
    data = extractJson(text);
  } catch {
    return { ok: false, error: 'Could not find valid JSON in the pasted text. You can enter the values manually below.' };
  }
  const list = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { items?: unknown }).items)
      ? (data as { items: unknown[] }).items
      : data && typeof data === 'object' && 'name' in (data as object)
        ? [data]
        : null;
  if (!list || list.length === 0) return { ok: false, error: 'The JSON has no "items" list.' };

  const items: EstimateItem[] = [];
  const warnings: string[] = [];
  for (const [i, raw] of list.entries()) {
    const r = rawItem.safeParse(raw);
    if (!r.success) {
      warnings.push(`Item ${i + 1} skipped: ${r.error.issues[0]?.message ?? 'invalid'}`);
      continue;
    }
    const v = r.data;
    const unit = normalizeUnit(v.unit);
    if (v.unit != null && !unit) warnings.push(`${v.name}: unknown unit "${asText(v.unit)}", please choose one.`);
    const state =
      typeof v.state === 'string' && ['raw', 'dry', 'cooked'].includes(v.state.toLowerCase())
        ? (v.state.toLowerCase() as EstimateItem['state'])
        : null;
    const kcal = v.calories ?? v.kcal ?? null;
    if (kcal == null) warnings.push(`${v.name}: calories missing, please enter them.`);
    items.push({
      name: v.name,
      amount: v.amount ?? null,
      unit,
      state,
      kcal,
      protein_g: v.protein_g ?? v.protein ?? null,
      carbs_g: v.carbs_g ?? v.carbohydrates_g ?? v.carbs ?? null,
      fat_g: v.fat_g ?? v.fat ?? null,
      assumptions: [asText(v.assumptions), asText(v.portion_assumptions), asText(v.notes)].filter(Boolean).join(' '),
    });
  }
  if (items.length === 0) return { ok: false, error: warnings.join(' ') || 'No usable items.' };
  return { ok: true, items, warnings };
}

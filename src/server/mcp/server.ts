import 'server-only';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { asUser, type Tx } from '../db';
import { availableUnits, portion, sum } from '@/lib/nutrition/calc';
import { round } from '@/lib/nutrition/format';
import { SLOTS, UNITS, type NutritionTotals, type Slot, type Unit } from '@/lib/nutrition/types';
import { isDateString, todayIn } from '@/lib/dates';
import { AppError, errorMessage } from '../services/errors';
import { getFood, foodSpec } from '../services/foods';
import { getRecipe } from '../services/recipes';
import { getMeal } from '../services/meals';
import { searchLibrary, type LibraryItem } from '../services/library';
import { draftFromEstimate, draftFromFood, draftFromMeal, draftFromRecipe, getDay, insertEntry, type Entry } from '../services/diary';
import { getProfile } from '../services/profile';
import { defaultLogTarget, statusFromDay } from '../services/status';
import { idempotent } from '../services/idempotency';
import { upsertWeighIn, weightTrend } from '../services/weight';
import { estimateItemSchema } from '../services/schemas';

const r1 = (n: number | null) => (n == null ? null : round(n));
const nutrition = (t: Pick<NutritionTotals, 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g' | 'missing'>) => ({
  kcal: round(t.kcal, 0),
  protein_g: r1(t.protein_g),
  carbs_g: r1(t.carbs_g),
  fat_g: r1(t.fat_g),
  unknown_macros: t.missing,
});

function itemOut(i: LibraryItem) {
  return {
    type: i.type,
    id: i.id,
    name: i.name,
    aliases: i.aliases,
    details: i.subtitle || undefined,
    default_portion: i.default_amount ? { amount: i.default_amount, unit: i.default_unit } : 'whole meal',
    nutrition_for_default_portion: nutrition(i.totals),
    is_estimate: i.is_estimate || undefined,
    source_label: i.source_label || undefined,
  };
}

function entryOut(e: Entry) {
  return {
    entry_id: e.id,
    name: e.name,
    date: e.local_date,
    meal: e.slot,
    portion: e.amount ? { amount: e.amount, unit: e.unit } : undefined,
    components: e.components.length > 1 ? e.components.map((c) => ({ name: c.name, amount: c.amount, unit: c.unit })) : undefined,
    ...nutrition(e),
    is_estimate: e.is_estimate,
    source_label: e.source_label,
    assumptions: e.assumptions ?? undefined,
  };
}

function ok(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
}
function fail(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true };
}

const requestId = z
  .string()
  .min(8)
  .max(200)
  .describe(
    'A new unique id (e.g. a UUID) that you generate once per intended write. Reuse the SAME id only when retrying the same call after a timeout or error; the original result is returned and nothing is logged twice. Use a NEW id for every separate log, even of the same food.',
  );
const dateArg = z.string().optional().describe('Diary date as YYYY-MM-DD in the user’s timezone. Omit for today.');
const slotArg = z.enum(SLOTS).optional().describe('breakfast, lunch, dinner or snacks. Omit to use the current time of day.');

async function context(tx: Tx, userId: string, date?: string, slot?: Slot) {
  const profile = await getProfile(tx, userId);
  if (date !== undefined && !isDateString(date)) throw new AppError('date must be YYYY-MM-DD');
  const d = defaultLogTarget(profile.timezone);
  return { profile, date: date ?? d.date, slot: slot ?? d.slot };
}

/**
 * Build an MCP server bound to one verified user. `userId` comes only from the bearer
 * token resolved by the route; no tool accepts a user identifier.
 */
export function buildMcpServer(userId: string) {
  const server = new McpServer(
    { name: 'filafitness', version: '1.0.0' },
    {
      instructions:
        'Calorie and protein diary for the signed-in user only. To log food: search_library first; if exactly one saved item fits, log_saved_item with an explicit amount and unit; if the user described food that is not saved, or you estimated from a photo, use log_estimate with your assumptions. Never invent portions: ask the user if the amount is unclear. Every write needs a fresh request_id.',
    },
  );
  const run = <T>(fn: (tx: Tx) => Promise<T>) => asUser(userId, fn);

  server.registerTool(
    'search_library',
    {
      title: 'Search saved foods, meals and recipes',
      description:
        'Search the user’s own saved foods, meals and recipes by name or alias. Works with Cyrillic or Latin (e.g. "подварок" or "podvarok").',
      inputSchema: {
        query: z.string().max(100).describe('Food name or alias. Empty string lists favorites first.'),
        types: z.array(z.enum(['food', 'meal', 'recipe'])).optional(),
        limit: z.number().int().min(1).max(25).optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ query, types, limit }) => {
      try {
        const items = await run((tx) => searchLibrary(tx, query, { types, limit: limit ?? 10 }));
        return ok({ count: items.length, items: items.map(itemOut) });
      } catch (e) {
        return fail(errorMessage(e));
      }
    },
  );

  server.registerTool(
    'preview_nutrition',
    {
      title: 'Preview nutrition for a portion',
      description:
        'Calculate nutrition for a portion of a saved food or recipe, or a meal with optional per-item amounts, without logging anything.',
      inputSchema: {
        type: z.enum(['food', 'meal', 'recipe']),
        id: z.string().uuid(),
        amount: z.number().positive().optional(),
        unit: z.enum(UNITS).optional(),
        meal_item_amounts: z
          .array(z.object({ item_name: z.string(), amount: z.number().positive() }))
          .optional()
          .describe('For meals only: change the amount of named items for this preview.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        return ok(
          await run(async (tx) => {
            if (args.type === 'meal') {
              const m = await getMeal(tx, args.id);
              const d = draftFromMeal(m, '2000-01-01', 'lunch', mealOverrides(m, args.meal_item_amounts));
              const comps = d.components.map((c) => {
                const p = portion(c.spec, c.amount, c.unit);
                if (!p.ok) throw new AppError(p.reason);
                return { row: { name: c.name, amount: c.amount, unit: c.unit, ...nutrition(p) }, totals: p };
              });
              return { name: m.name, items: comps.map((c) => c.row), total: nutrition(sum(comps.map((c) => c.totals))) };
            }
            const spec = args.type === 'food' ? foodSpec(await getFood(tx, args.id)) : (await getRecipe(tx, args.id)).spec;
            const item = args.type === 'food' ? await getFood(tx, args.id) : await getRecipe(tx, args.id);
            const amount = args.amount ?? item.default_amount;
            const unit = args.unit ?? item.default_unit;
            const p = portion(spec, amount, unit);
            if (!p.ok) throw new AppError(p.reason);
            return { name: item.name, portion: { amount, unit }, ...nutrition(p), estimated_yield: spec.estimatedYield || undefined };
          }),
        );
      } catch (e) {
        return fail(errorMessage(e));
      }
    },
  );

  server.registerTool(
    'log_saved_item',
    {
      title: 'Log a saved food, meal or recipe',
      description:
        'Log a saved item to the diary. Give the item by id (from search_library) or by query. If the query matches several items, candidates are returned and nothing is logged. A food or recipe needs an explicit amount+unit, or use_default_portion=true when the user said "the usual". Meals log their saved quantities; meal_item_amounts changes items for this entry only.',
      inputSchema: {
        request_id: requestId,
        id: z.string().uuid().optional(),
        type: z.enum(['food', 'meal', 'recipe']).optional(),
        query: z.string().max(100).optional(),
        amount: z.number().positive().optional(),
        unit: z.enum(UNITS).optional(),
        use_default_portion: z.boolean().optional(),
        meal_item_amounts: z.array(z.object({ item_name: z.string(), amount: z.number().positive() })).optional(),
        date: dateArg,
        meal: slotArg,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        const out = await run(async (tx) => {
          const ctx = await context(tx, userId, args.date, args.meal);
          const { result, replayed } = await idempotent(
            tx,
            args.request_id,
            'log_saved_item',
            args,
            async () => {
              // Clarifications (several matches / no portion) are returned but not stored, so the
              // same request_id can be used once the user answers.
              let target: { type: 'food' | 'meal' | 'recipe'; id: string } | null = null;
              if (args.id) {
                target = { type: args.type ?? (await detectType(tx, args.id)), id: args.id };
              } else if (args.query) {
                const hits = await searchLibrary(tx, args.query, { types: args.type ? [args.type] : undefined, limit: 6 });
                const exact = hits.filter((h) => h.name.toLowerCase() === args.query!.toLowerCase());
                if (hits.length === 1 || exact.length === 1) target = { type: (exact[0] ?? hits[0]).type, id: (exact[0] ?? hits[0]).id };
                else
                  return {
                    status: hits.length ? 'needs_choice' : 'not_found',
                    message: hits.length
                      ? 'Several saved items match. Ask the user which one, then call again with its id. Nothing was logged.'
                      : 'No saved item matches. Ask the user, or log an estimate with log_estimate. Nothing was logged.',
                    candidates: hits.map(itemOut),
                  };
              } else throw new AppError('Provide id or query');

              if (target.type !== 'meal' && !args.amount && !args.use_default_portion) {
                const isFood = target.type === 'food';
                const food = isFood ? await getFood(tx, target.id) : null;
                const rec = isFood ? null : await getRecipe(tx, target.id);
                const item = (food ?? rec)!;
                return {
                  status: 'needs_portion',
                  message: `How much ${item.name}? Ask the user for the amount, or pass use_default_portion=true for the usual ${item.default_amount} ${item.default_unit}. Nothing was logged.`,
                  item: { type: target.type, id: target.id, name: item.name },
                  default_portion: { amount: item.default_amount, unit: item.default_unit },
                  units: availableUnits(food ? foodSpec(food) : rec!.spec),
                };
              }
              if (args.amount && !args.unit && target.type !== 'meal') throw new AppError('unit is required with amount');

              const t = target;
              let entry: Entry;
              if (t.type === 'food')
                entry = await insertEntry(
                  tx,
                  draftFromFood(await getFood(tx, t.id), ctx.date, ctx.slot, args.amount, args.unit as Unit | undefined),
                );
              else if (t.type === 'recipe')
                entry = await insertEntry(
                  tx,
                  draftFromRecipe(await getRecipe(tx, t.id), ctx.date, ctx.slot, args.amount, args.unit as Unit | undefined),
                );
              else {
                const m = await getMeal(tx, t.id);
                entry = await insertEntry(tx, draftFromMeal(m, ctx.date, ctx.slot, mealOverrides(m, args.meal_item_amounts)));
              }
              const day = await getDay(tx, ctx.date);
              return { status: 'logged', saved: entryOut(entry), day: statusFromDay(day, ctx.profile) };
            },
            (r) => r.status === 'logged',
          );
          return replayed ? { ...result, replayed: true } : result;
        });
        return ok(out);
      } catch (e) {
        return fail(errorMessage(e));
      }
    },
  );

  server.registerTool(
    'log_estimate',
    {
      title: 'Log an estimated food',
      description:
        'Log one or more foods that are not saved, using your nutrition estimate (e.g. from the user’s description or photo). Values are totals for the stated amount. Use null for macros you cannot estimate (never 0). Put your portion and recipe assumptions in assumptions. All items are saved together or not at all.',
      inputSchema: {
        request_id: requestId,
        date: dateArg,
        meal: slotArg,
        items: z
          .array(
            z.object({
              name: z.string().min(1).max(200),
              amount: z.number().positive().nullable().optional(),
              unit: z.enum(UNITS).nullable().optional(),
              state: z.enum(['raw', 'dry', 'cooked']).nullable().optional(),
              kcal: z.number().min(0),
              protein_g: z.number().min(0).nullable(),
              carbs_g: z.number().min(0).nullable(),
              fat_g: z.number().min(0).nullable(),
              assumptions: z.string().max(2000).optional(),
            }),
          )
          .min(1)
          .max(15),
        source_label: z.string().max(60).optional().describe('Defaults to "ChatGPT estimate".'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        const out = await run(async (tx) => {
          const ctx = await context(tx, userId, args.date, args.meal);
          const { result, replayed } = await idempotent(tx, args.request_id, 'log_estimate', args, async () => {
            const saved: Entry[] = [];
            for (const raw of args.items) {
              const item = estimateItemSchema.parse(raw);
              saved.push(await insertEntry(tx, draftFromEstimate(item, ctx.date, ctx.slot, args.source_label ?? 'ChatGPT estimate')));
            }
            const day = await getDay(tx, ctx.date);
            return { status: 'logged', saved: saved.map(entryOut), day: statusFromDay(day, ctx.profile) };
          });
          return replayed ? { ...result, replayed: true } : result;
        });
        return ok(out);
      } catch (e) {
        return fail(errorMessage(e));
      }
    },
  );

  server.registerTool(
    'get_daily_summary',
    {
      title: 'Daily totals and targets',
      description: 'Calories and macros eaten on a date, the user’s targets and what remains, plus the diary entries.',
      inputSchema: { date: dateArg },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ date }) => {
      try {
        return ok(
          await run(async (tx) => {
            const ctx = await context(tx, userId, date);
            const day = await getDay(tx, ctx.date);
            return { ...statusFromDay(day, ctx.profile), entries: day.entries.map(entryOut) };
          }),
        );
      } catch (e) {
        return fail(errorMessage(e));
      }
    },
  );

  server.registerTool(
    'log_weigh_in',
    {
      title: 'Log a weigh-in',
      description: 'Record body weight in kg for a date (one per day; logging again replaces that day’s value).',
      inputSchema: { request_id: requestId, weight_kg: z.number().min(20).max(400), date: dateArg },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        const out = await run(async (tx) => {
          const ctx = await context(tx, userId, args.date);
          const { result, replayed } = await idempotent(tx, args.request_id, 'log_weigh_in', args, async () => {
            const w = await upsertWeighIn(tx, { date: ctx.date, weight_kg: args.weight_kg });
            const t = await weightTrend(tx, todayIn(ctx.profile.timezone), 14);
            return { status: 'logged', saved: { date: w.local_date, weight_kg: w.weight_kg }, trend: trendOut(t.summary) };
          });
          return replayed ? { ...result, replayed: true } : result;
        });
        return ok(out);
      } catch (e) {
        return fail(errorMessage(e));
      }
    },
  );

  server.registerTool(
    'get_weight_trend',
    {
      title: 'Weight trend',
      description: 'Recorded weigh-ins, the 7-day average of recorded days, and the change versus the previous 7 days.',
      inputSchema: { days: z.number().int().min(7).max(180).optional() },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ days }) => {
      try {
        return ok(
          await run(async (tx) => {
            const p = await getProfile(tx, userId);
            const t = await weightTrend(tx, todayIn(p.timezone), days ?? 28);
            return {
              ...trendOut(t.summary),
              goal_weight_kg: p.goal_weight_kg,
              weigh_ins: t.weights.map((w) => ({ date: w.local_date, weight_kg: w.weight_kg })),
            };
          }),
        );
      } catch (e) {
        return fail(errorMessage(e));
      }
    },
  );

  return server;
}

function trendOut(s: Awaited<ReturnType<typeof weightTrend>>['summary']) {
  const w = (x: typeof s.current) => ({
    from: x.start,
    to: x.end,
    average_kg: x.average == null ? null : round(x.average, 2),
    recorded_days: x.days,
    sparse: x.sparse,
  });
  return {
    latest: s.latest ? { date: s.latest.local_date, weight_kg: s.latest.weight_kg } : null,
    seven_day_average: w(s.current),
    previous_seven_days: w(s.previous),
    change_kg: s.change == null ? null : round(s.change, 2),
  };
}

function mealOverrides(m: Awaited<ReturnType<typeof getMeal>>, list?: Array<{ item_name: string; amount: number }>) {
  const out: Record<string, { amount: number }> = {};
  for (const o of list ?? []) {
    const q = o.item_name.toLowerCase();
    const matches = m.items.filter((i) => i.name.toLowerCase().includes(q));
    if (matches.length !== 1)
      throw new AppError(
        `"${o.item_name}" ${matches.length ? 'matches several' : 'matches no'} items in ${m.name}: ${m.items.map((i) => i.name).join(', ')}`,
      );
    out[matches[0].id] = { amount: o.amount };
  }
  return out;
}

async function detectType(tx: Tx, id: string): Promise<'food' | 'meal' | 'recipe'> {
  const [r] = await tx<{ t: 'food' | 'meal' | 'recipe' }[]>`
    select 'food' as t from foods where id = ${id}
    union all select 'recipe' from recipes where id = ${id}
    union all select 'meal' from meals where id = ${id}`;
  if (!r) throw new AppError('No saved item with that id');
  return r.t;
}

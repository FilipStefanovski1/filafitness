import { z } from 'zod';
import { SLOTS, UNITS } from '@/lib/nutrition/types';
import { isDateString } from '@/lib/dates';

export const unitSchema = z.enum(UNITS);
export const slotSchema = z.enum(SLOTS);
export const dateSchema = z.string().refine(isDateString, 'Expected a date as YYYY-MM-DD');
export const uuidSchema = z.string().uuid();

const optNum = (min = 0) => z.preprocess((v) => (v === '' || v === undefined ? null : v), z.coerce.number().finite().min(min).nullable());
const posNum = z.coerce.number().finite().positive();
const optText = (max = 500) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), z.string().trim().max(max).nullable().optional());

export const macroValueSchema = optNum(0);

export const unitDefSchema = z.object({
  unit: z.enum(['serving', 'piece', 'slice', 'scoop']),
  label: optText(40),
  grams: optNum(0).optional(),
  ml: optNum(0).optional(),
  servings: optNum(0).optional(),
});

export const foodInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  brand: optText(120),
  barcode: optText(40),
  aliases: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  basis: z.enum(['per_100g', 'per_100ml', 'per_serving']),
  serving_label: optText(40),
  serving_grams: optNum(0).optional(),
  serving_ml: optNum(0).optional(),
  grams_per_ml: optNum(0).optional(),
  kcal: z.coerce.number().finite().min(0),
  protein_g: macroValueSchema,
  carbs_g: macroValueSchema,
  fat_g: macroValueSchema,
  units: z.array(unitDefSchema).max(10).default([]),
  default_amount: posNum,
  default_unit: unitSchema,
  state: z.enum(['raw', 'dry', 'cooked']).nullable().optional(),
  source: z
    .enum(['manual', 'label', 'gpt_estimate', 'quick_add', 'starter', 'shared', 'demo', 'open_food_facts', 'diary'])
    .default('manual'),
  source_label: optText(120),
  assumptions: optText(2000),
  notes: optText(2000),
  is_favorite: z.boolean().default(false),
});
export type FoodInput = z.infer<typeof foodInputSchema>;

export const recipeInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  aliases: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  yield_unit: z.enum(['g', 'servings']),
  yield_amount: posNum,
  yield_estimated: z.boolean().default(false),
  serving_grams: optNum(0).optional(),
  default_amount: posNum,
  default_unit: unitSchema,
  notes: optText(2000),
  is_favorite: z.boolean().default(false),
  ingredients: z
    .array(z.object({ food_id: uuidSchema, amount: posNum, unit: unitSchema }))
    .min(1, 'Add at least one ingredient')
    .max(60),
});
export type RecipeInput = z.infer<typeof recipeInputSchema>;

export const mealItemSchema = z
  .object({
    food_id: uuidSchema.nullable().optional(),
    recipe_id: uuidSchema.nullable().optional(),
    amount: posNum,
    unit: unitSchema,
  })
  .refine((v) => !!v.food_id !== !!v.recipe_id, 'Each meal item needs exactly one food or recipe');

export const mealInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  aliases: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  default_slot: slotSchema.nullable().optional(),
  notes: optText(2000),
  is_favorite: z.boolean().default(false),
  items: z.array(mealItemSchema).min(1, 'Add at least one item').max(40),
});
export type MealInput = z.infer<typeof mealInputSchema>;

/** An ad hoc estimate (GPT paste or MCP). Values are totals for the stated amount. */
export const estimateItemSchema = z.object({
  name: z.string().trim().min(1).max(200),
  amount: optNum(0).optional(),
  unit: unitSchema.nullable().optional(),
  state: z.enum(['raw', 'dry', 'cooked']).nullable().optional(),
  kcal: z.coerce.number().finite().min(0),
  protein_g: macroValueSchema,
  carbs_g: macroValueSchema,
  fat_g: macroValueSchema,
  assumptions: optText(2000),
});
export type EstimateItemInput = z.infer<typeof estimateItemSchema>;

export const quickAddSchema = z.object({
  name: z.string().trim().min(1).max(200),
  kcal: z.coerce.number().finite().min(0),
  protein_g: macroValueSchema,
  carbs_g: macroValueSchema,
  fat_g: macroValueSchema,
});

export const profileInputSchema = z.object({
  display_name: z.string().trim().min(1).max(60),
  timezone: z.string().trim().min(1).max(60),
  kcal_target: z.coerce.number().finite().positive().max(19999),
  protein_target_g: z.coerce.number().finite().min(0).max(999),
  carbs_target_g: optNum(0).optional(),
  fat_target_g: optNum(0).optional(),
  goal_weight_kg: optNum(0).optional(),
});

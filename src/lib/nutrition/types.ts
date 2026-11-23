export const MACROS = ['protein_g', 'carbs_g', 'fat_g'] as const;
export type Macro = (typeof MACROS)[number];

export const UNITS = ['g', 'ml', 'serving', 'piece', 'slice', 'scoop'] as const;
export type Unit = (typeof UNITS)[number];
export type CountUnit = Exclude<Unit, 'g' | 'ml'>;

export type Basis = 'per_100g' | 'per_100ml' | 'per_serving';
export type FoodState = 'raw' | 'dry' | 'cooked';

/** An explicitly defined unit conversion, e.g. 1 slice = 30 g, 1 scoop = 1 serving. */
export interface UnitDef {
  unit: CountUnit;
  label?: string | null;
  grams?: number | null;
  ml?: number | null;
  servings?: number | null;
}

/** Nutrition values. Macros may be null (unknown). */
export interface NutritionValues {
  kcal: number;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
}

/**
 * Totals of several things. A macro's number is the sum of the KNOWN values; `missing`
 * names macros where at least one contributor is unknown. A macro with no known
 * contributors at all is null.
 */
export interface NutritionTotals extends NutritionValues {
  missing: Macro[];
}

/**
 * Everything needed to compute nutrition for a portion of one food or recipe.
 * Stored verbatim on diary components as the snapshot.
 */
export interface NutritionSpec {
  name: string;
  basis: Basis;
  /** Nutrition per basis quantity (100 g, 100 mL, or 1 serving). */
  per: NutritionValues;
  /** Macros known to be incomplete in `per` (e.g. a recipe with an unknown ingredient macro). */
  missing?: Macro[];
  servingLabel?: string | null;
  servingGrams?: number | null;
  servingMl?: number | null;
  gramsPerMl?: number | null;
  units?: UnitDef[];
  state?: FoodState | null;
  /** True when derived from an estimated recipe yield. */
  estimatedYield?: boolean;
  isEstimate?: boolean;
}

export const SLOTS = ['breakfast', 'lunch', 'dinner', 'snacks'] as const;
export type Slot = (typeof SLOTS)[number];
export const SLOT_LABEL: Record<Slot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snacks: 'Snacks',
};

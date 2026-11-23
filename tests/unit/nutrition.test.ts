import { describe, expect, it } from 'vitest';
import { availableUnits, convert, portion, recipe, sum } from '@/lib/nutrition/calc';
import { fmtMacro } from '@/lib/nutrition/format';
import type { NutritionSpec } from '@/lib/nutrition/types';

const oats: NutritionSpec = {
  name: 'Oats',
  basis: 'per_100g',
  per: { kcal: 379, protein_g: 13.2, carbs_g: 67.7, fat_g: 6.5 },
  state: 'dry',
};
const milk: NutritionSpec = {
  name: 'Milk',
  basis: 'per_100ml',
  per: { kcal: 50, protein_g: 3.3, carbs_g: 4.8, fat_g: 2 },
  gramsPerMl: 1.03,
};
const shake: NutritionSpec = {
  name: 'Shake',
  basis: 'per_serving',
  per: { kcal: 120, protein_g: 25, carbs_g: 3, fat_g: 1.5 },
  servingLabel: 'scoop',
  units: [{ unit: 'scoop', servings: 1 }],
};
const banana: NutritionSpec = {
  name: 'Banana',
  basis: 'per_100g',
  per: { kcal: 89, protein_g: 1.1, carbs_g: 22.8, fat_g: 0.3 },
  units: [{ unit: 'piece', grams: 118 }],
};

describe('unit conversion', () => {
  it('scales grams against per-100 g', () => {
    const p = portion(oats, 80, 'g');
    expect(p.ok && p.kcal).toBeCloseTo(303.2, 10);
    expect(p.ok && p.protein_g).toBeCloseTo(10.56, 10);
  });

  it('uses explicit piece weights', () => {
    const p = portion(banana, 1, 'piece');
    expect(p.ok && p.kcal).toBeCloseTo(105.02, 10);
  });

  it('converts g to mL only with a known density', () => {
    expect(portion(milk, 250, 'ml').ok).toBe(true);
    const g = portion(milk, 103, 'g');
    expect(g.ok && g.kcal).toBeCloseTo(50, 10);
    const noDensity = { ...milk, gramsPerMl: null };
    expect(convert(noDensity, 100, 'g').ok).toBe(false);
  });

  it('logs a scoop with nutrition per scoop and no known weight', () => {
    const p = portion(shake, 2, 'scoop');
    expect(p.ok && p.protein_g).toBe(50);
    expect(convert(shake, 30, 'g').ok).toBe(false);
    expect(availableUnits(shake)).toEqual(['serving', 'scoop']);
  });

  it('refuses undefined conversions instead of guessing', () => {
    const r = convert(oats, 1, 'slice');
    expect(r.ok).toBe(false);
    expect(availableUnits(oats)).toEqual(['g']);
  });

  it('rejects non-positive amounts', () => {
    expect(convert(oats, 0, 'g').ok).toBe(false);
    expect(convert(oats, -5, 'g').ok).toBe(false);
  });

  it('keeps decimal precision (no float drift)', () => {
    const p = portion({ ...oats, per: { kcal: 0.1, protein_g: 0.2, carbs_g: null, fat_g: null } }, 300, 'g');
    expect(p.ok && p.kcal).toBe(0.3);
    expect(p.ok && p.protein_g).toBe(0.6);
  });
});

describe('unknown macros', () => {
  it('treats null as unknown, never as 0', () => {
    const quick: NutritionSpec = { name: 'Burek', basis: 'per_serving', per: { kcal: 400, protein_g: null, carbs_g: null, fat_g: null } };
    const p = portion(quick, 1, 'serving');
    expect(p.ok && p.protein_g).toBeNull();
    expect(p.ok && p.missing).toEqual(['protein_g', 'carbs_g', 'fat_g']);
  });

  it('sums known values and discloses incompleteness', () => {
    const t = sum([
      { kcal: 300, protein_g: 20, carbs_g: 10, fat_g: 5 },
      { kcal: 400, protein_g: null, carbs_g: 40, fat_g: null },
    ]);
    expect(t.kcal).toBe(700);
    expect(t.protein_g).toBe(20);
    expect(t.missing).toEqual(['protein_g', 'fat_g']);
    expect(fmtMacro(t, 'protein_g')).toBe('≥20 g');
    expect(fmtMacro(t, 'carbs_g')).toBe('50 g');
    expect(fmtMacro({ ...t, protein_g: null }, 'protein_g')).toBe('? g');
  });
});

describe('recipes', () => {
  const sauerkraut: NutritionSpec = { name: 'Sauerkraut', basis: 'per_100g', per: { kcal: 19, protein_g: 0.9, carbs_g: 4.3, fat_g: 0.1 } };
  const pork: NutritionSpec = { name: 'Pork', basis: 'per_100g', per: { kcal: 186, protein_g: 17.2, carbs_g: 0, fat_g: 12.4 } };
  const oil: NutritionSpec = { name: 'Oil', basis: 'per_100g', per: { kcal: 884, protein_g: 0, carbs_g: 0, fat_g: 100 } };

  it('scales batch nutrition to a weighed portion of the finished weight', () => {
    const r = recipe({
      name: 'Podvarok',
      yieldUnit: 'g',
      yieldAmount: 1400,
      ingredients: [
        { spec: sauerkraut, amount: 1000, unit: 'g' },
        { spec: pork, amount: 500, unit: 'g' },
        { spec: oil, amount: 30, unit: 'g' },
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // batch: 190 + 930 + 265.2 = 1385.2 kcal; protein 9 + 86 = 95 g
    expect(r.batch.kcal).toBeCloseTo(1385.2, 10);
    expect(r.batch.protein_g).toBeCloseTo(95, 10);
    const p = portion(r.spec, 230, 'g');
    expect(p.ok && p.kcal).toBeCloseTo((1385.2 * 230) / 1400, 9);
    expect(p.ok && p.protein_g).toBeCloseTo((95 * 230) / 1400, 9);
    expect(p.ok && p.fat_g).toBeCloseTo(((0.1 * 10 + 12.4 * 5 + 30) * 230) / 1400, 9);
  });

  it('supports servings yields and marks estimated yields', () => {
    const r = recipe({
      name: 'Stew',
      yieldUnit: 'servings',
      yieldAmount: 4,
      yieldEstimated: true,
      ingredients: [{ spec: pork, amount: 800, unit: 'g' }],
    });
    expect(r.ok && r.spec.estimatedYield).toBe(true);
    const p = r.ok ? portion(r.spec, 1, 'serving') : null;
    expect(p?.ok && p.kcal).toBeCloseTo(372, 10);
    expect(r.ok && convert(r.spec, 100, 'g').ok).toBe(false); // unknown serving weight
  });

  it('propagates unknown ingredient macros', () => {
    const mystery: NutritionSpec = { name: 'Spice mix', basis: 'per_100g', per: { kcal: 300, protein_g: null, carbs_g: 50, fat_g: 5 } };
    const r = recipe({
      name: 'X',
      yieldUnit: 'g',
      yieldAmount: 500,
      ingredients: [
        { spec: pork, amount: 500, unit: 'g' },
        { spec: mystery, amount: 10, unit: 'g' },
      ],
    });
    expect(r.ok && r.spec.missing).toEqual(['protein_g']);
    const p = r.ok ? portion(r.spec, 100, 'g') : null;
    expect(p?.ok && p.missing).toEqual(['protein_g']);
  });
});

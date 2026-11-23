import 'server-only';
import type { Tx } from './db';
import { listFoods } from './services/foods';
import { listRecipes } from './services/recipes';
import { buildSearchKey } from '@/lib/search';
import { availableUnits } from '@/lib/nutrition/calc';
import { foodSpec } from './services/foods';
import type { NutritionSpec, Unit } from '@/lib/nutrition/types';

export interface PickData {
  kind: 'food' | 'recipe';
  id: string;
  name: string;
  key: string;
  hint: string;
  spec: NutritionSpec;
  units: Unit[];
  default_amount: number;
  default_unit: Unit;
}

export async function pickOptions(tx: Tx, opts: { recipes: boolean }): Promise<PickData[]> {
  const foods = await listFoods(tx);
  const out: PickData[] = foods.map((f) => {
    const spec = foodSpec(f);
    return {
      kind: 'food',
      id: f.id,
      name: f.name,
      key: buildSearchKey(f.name, f.aliases, [f.brand]),
      hint: [f.brand, f.state].filter(Boolean).join(' · '),
      spec,
      units: availableUnits(spec),
      default_amount: f.default_amount,
      default_unit: f.default_unit,
    };
  });
  if (opts.recipes) {
    for (const r of await listRecipes(tx)) {
      out.push({
        kind: 'recipe',
        id: r.id,
        name: r.name,
        key: buildSearchKey(r.name, r.aliases),
        hint: `${r.yield_amount} ${r.yield_unit} batch`,
        spec: r.spec,
        units: availableUnits(r.spec),
        default_amount: r.default_amount,
        default_unit: r.default_unit,
      });
    }
  }
  return out;
}

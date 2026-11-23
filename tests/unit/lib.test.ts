import { describe, expect, it } from 'vitest';
import { addDays, localDateOf, resolveDate, todayIn, weekStart } from '@/lib/dates';
import { matchScore, buildSearchKey, searchKey } from '@/lib/search';
import { parseEstimate, GPT_PROMPT } from '@/lib/gpt';
import { trendSeries, trendSummary, windowStat } from '@/lib/weight';

describe('local dates (Europe/Skopje)', () => {
  it('puts a meal logged just after midnight on the new local date', () => {
    // 00:15 in Skopje on 23 Nov (CET, UTC+1) is 23:15 UTC on 22 Nov.
    const instant = new Date('2026-11-22T23:15:00Z');
    expect(localDateOf(instant, 'Europe/Skopje')).toBe('2026-11-23');
    expect(localDateOf(instant, 'UTC')).toBe('2026-11-22');
  });

  it('handles summer time (UTC+2)', () => {
    expect(todayIn('Europe/Skopje', new Date('2026-07-01T22:30:00Z'))).toBe('2026-07-02');
    expect(todayIn('Europe/Skopje', new Date('2026-07-01T21:59:00Z'))).toBe('2026-07-01');
  });

  it('does date arithmetic without DST drift', () => {
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
    expect(weekStart('2026-11-22')).toBe('2026-11-16'); // Sunday -> Monday
    expect(resolveDate('2026-02-30', 'Europe/Skopje', new Date('2026-11-22T23:15:00Z'))).toBe('2026-11-23');
  });
});

describe('Unicode search', () => {
  it('matches Cyrillic and romanized Macedonian', () => {
    const key = buildSearchKey('Подварок', ['homemade podvarok']);
    expect(matchScore('podvarok', key)).toBeGreaterThan(0);
    expect(matchScore('подварок', key)).toBeGreaterThan(0);
    expect(matchScore('PODVAR', key)).toBeGreaterThan(0);
    expect(matchScore('kifla', buildSearchKey('Кифла'))).toBeGreaterThan(0);
  });

  it('folds romanization variants', () => {
    expect(searchKey('Ќебапи')).toBe(searchKey('kjebapi'));
    expect(searchKey('Ќебапи')).toBe(searchKey('ćebapi'));
    expect(searchKey('жито')).toBe(searchKey('zhito'));
    expect(searchKey('жито')).toBe(searchKey('žito'));
    expect(searchKey('сирење')).toBe(searchKey('sirenje'));
  });

  it('does not match unrelated foods', () => {
    expect(matchScore('pasta', buildSearchKey('Podvarok'))).toBe(0);
  });
});

describe('GPT estimate parsing', () => {
  const reply = `Here you go:
\`\`\`json
{
  "items": [
    {"name": "Подварок", "amount": 230, "unit": "g", "state": "cooked", "calories": 290, "protein_g": 14, "carbs_g": 9, "fat_g": 22,
     "assumptions": "Sauerkraut baked with pork, ~1 tbsp oil per portion"},
    {"name": "Kifla", "amount": "36", "unit": "grams", "calories": "105", "protein_g": 3.2, "carbs_g": 19, "fat_g": null, "assumptions": "plain white roll"}
  ]
}
\`\`\``;

  it('accepts JSON wrapped in prose and code fences', () => {
    const r = parseEstimate(reply);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.items).toHaveLength(2);
    expect(r.items[0]).toMatchObject({ name: 'Подварок', amount: 230, unit: 'g', state: 'cooked', kcal: 290, protein_g: 14 });
    expect(r.items[1]).toMatchObject({ name: 'Kifla', amount: 36, unit: 'g', kcal: 105, fat_g: null });
    expect(r.items[0].assumptions).toContain('pork');
  });

  it('preserves null macros', () => {
    const r = parseEstimate('[{"name":"Burek","calories":450,"protein_g":null}]');
    expect(r.ok && r.items[0].protein_g).toBeNull();
    expect(r.ok && r.items[0].carbs_g).toBeNull();
  });

  it('fails clearly on non-JSON so the user can enter values manually', () => {
    const r = parseEstimate('Izedov 230g podvarok i 36g kifla, around 400 kcal total');
    expect(r.ok).toBe(false);
  });

  it('warns about missing calories and unknown units', () => {
    const r = parseEstimate('{"items":[{"name":"Soup","amount":1,"unit":"bowl","protein_g":5}]}');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.items[0].unit).toBeNull();
      expect(r.items[0].kcal).toBeNull();
      expect(r.warnings.length).toBe(2);
    }
  });

  it('ships a prompt asking for null instead of guessed zeros', () => {
    expect(GPT_PROMPT).toContain('null');
    expect(GPT_PROMPT).toContain('assumptions');
  });
});

describe('weight trend', () => {
  const w = (local_date: string, weight_kg: number) => ({ local_date, weight_kg });

  it('averages only recorded days and flags sparse windows', () => {
    const s = windowStat([w('2026-11-20', 75), w('2026-11-22', 76)], '2026-11-22');
    expect(s.average).toBe(75.5);
    expect(s.days).toBe(2);
    expect(s.sparse).toBe(true);
  });

  it('never fills missing dates with zeros', () => {
    const series = trendSeries([w('2026-11-20', 75)], '2026-11-19', '2026-11-21');
    expect(series.map((p) => p.weight)).toEqual([null, 75, null]);
    expect(series.map((p) => p.avg7)).toEqual([null, 75, 75]);
  });

  it('compares with the previous 7-day window', () => {
    const weights = [
      w('2026-11-09', 74.0),
      w('2026-11-11', 74.4),
      w('2026-11-13', 74.2),
      w('2026-11-15', 74.6),
      w('2026-11-16', 75.0),
      w('2026-11-18', 75.2),
      w('2026-11-20', 75.4),
      w('2026-11-22', 75.6),
    ];
    const s = trendSummary(weights, '2026-11-22');
    expect(s.current.average).toBeCloseTo(75.3, 10);
    expect(s.previous.average).toBeCloseTo(74.3, 10);
    expect(s.change).toBeCloseTo(1.0, 10);
    expect(s.latest?.weight_kg).toBe(75.6);
  });

  it('reports no change without previous data', () => {
    expect(trendSummary([w('2026-11-22', 75)], '2026-11-22').change).toBeNull();
  });
});

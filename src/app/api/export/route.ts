import { currentUserId } from '@/server/auth';
import { asUser } from '@/server/db';

export const dynamic = 'force-dynamic';

const cell = (v: unknown) => {
  if (v == null) return '';
  const s = v instanceof Date ? v.toISOString() : Array.isArray(v) ? v.join(' ') : String(v);
  // Quote and neutralize spreadsheet formula injection.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const csv = (rows: Record<string, unknown>[], cols: string[]) =>
  [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\r\n') + '\r\n';

/** CSV export of the signed-in person's own diary or weigh-ins (RLS-scoped). */
export async function GET(req: Request) {
  const userId = await currentUserId();
  if (!userId) return new Response('Not signed in', { status: 401 });
  const type = new URL(req.url).searchParams.get('type');
  if (type === 'weight') {
    const rows = await asUser(
      userId,
      (tx) => tx`select to_char(local_date,'YYYY-MM-DD') as date, weight_kg, note from weigh_ins order by local_date`,
    );
    return file(csv(rows, ['date', 'weight_kg', 'note']), 'weigh-ins');
  }
  const rows = await asUser(
    userId,
    (tx) => tx`
      select to_char(e.local_date,'YYYY-MM-DD') as date, e.slot as meal, e.name as entry, e.kind, c.name as item, c.amount, c.unit,
             round(c.kcal, 1) as kcal, round(c.protein_g, 1) as protein_g, round(c.carbs_g, 1) as carbs_g, round(c.fat_g, 1) as fat_g,
             c.missing as unknown_macros, e.is_estimate, e.source_label, e.assumptions, e.notes, e.logged_at
      from diary_entries e join diary_components c on c.entry_id = e.id
      order by e.local_date, e.slot, e.logged_at, c.position`,
  );
  return file(
    csv(rows, [
      'date',
      'meal',
      'entry',
      'kind',
      'item',
      'amount',
      'unit',
      'kcal',
      'protein_g',
      'carbs_g',
      'fat_g',
      'unknown_macros',
      'is_estimate',
      'source_label',
      'assumptions',
      'notes',
      'logged_at',
    ]),
    'diary',
  );
}

function file(body: string, name: string) {
  return new Response('﻿' + body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="filafitness-${name}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}

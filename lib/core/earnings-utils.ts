import { EarningsRow } from '@/lib/core/schema';

// Merge earnings arrays, preferring primary values and filling from secondary
export function mergeEarningsRecords(
  primary: EarningsRow[],
  secondary: EarningsRow[]
): EarningsRow[] {
  const byDate = new Map<string, EarningsRow>();

  for (const rec of secondary) {
    if (!rec?.date) continue;
    byDate.set(rec.date, { ...rec });
  }

  for (const rec of primary) {
    if (!rec?.date) continue;
    const existing = byDate.get(rec.date);
    if (!existing) {
      byDate.set(rec.date, { ...rec });
      continue;
    }
    byDate.set(rec.date, {
      date: rec.date,
      when: (rec as any).when ?? (existing as any).when ?? 'unknown',
      eps: rec.eps !== null && rec.eps !== undefined ? rec.eps : existing.eps ?? null,
      revenue: rec.revenue !== null && rec.revenue !== undefined ? rec.revenue : existing.revenue ?? null,
    } as EarningsRow);
  }

  return Array.from(byDate.values()).sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
}

// Filter rows to a [from, to] inclusive date range (ISO YYYY-MM-DD)
export function filterEarningsByRange(
  rows: EarningsRow[],
  from: string,
  to: string
): EarningsRow[] {
  const fromTs = new Date(from).getTime();
  const toTs = new Date(to).getTime();
  return rows.filter(r => {
    const dt = new Date(r.date).getTime();
    return !isNaN(dt) && dt >= fromTs && dt <= toTs;
  });
}



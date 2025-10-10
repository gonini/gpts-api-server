// lib/core/earnings-normalize.ts
// GAAP Diluted EPS normalization + split adjustment helpers

import { fetchEPSData, fetchEPSFallbackFromRatio } from '@/lib/external/sec-edgar';
import { fetchSplits, SplitEvent } from '@/lib/external/yahoo-finance';

export type NormalizedEpsPoint = {
  date: string;
  eps: number | null;
};

export async function normalizeGAAPDilutedEPS(
  ticker: string,
  from: string,
  to: string,
  base: Array<{ date: string; eps: number | null }>
): Promise<NormalizedEpsPoint[]> {
  // 1) Pull GAAP diluted EPS from companyfacts where available
  let gaap: Array<{ date: string; eps: number }>; 
  try {
    gaap = await fetchEPSData(ticker, from, to);
  } catch {
    gaap = [];
  }
  // Fallback via ratio if primary GAAP missing on dates
  let ratio: Array<{ date: string; eps: number }> = [];
  try {
    ratio = await fetchEPSFallbackFromRatio(ticker, from, to);
  } catch {}
  const gaapByDate = new Map<string, number>(gaap.map(r => [r.date, r.eps]));
  const ratioByDate = new Map<string, number>(ratio.map(r => [r.date, r.eps]));

  // 2) Split-adjust using Yahoo split events if present
  let splits: SplitEvent[] = [];
  try {
    splits = await fetchSplits(ticker, from, to);
  } catch {}

  // Build cumulative split factor up to each date (forward split increases denominator → eps should be divided by ratio)
  function adjustForSplits(dateISO: string, value: number): number {
    return applySplitAdjustForValue(dateISO, value, splits);
  }

  const out: NormalizedEpsPoint[] = base.map((row) => {
    const src = (typeof row.eps === 'number' && row.eps !== null) ? row.eps : null;
    const xbrl = gaapByDate.get(row.date) ?? null;
    const fallback = ratioByDate.get(row.date) ?? null;
    const chosen = (xbrl ?? fallback ?? src);
    if (chosen == null) return { date: row.date, eps: null };
    return { date: row.date, eps: adjustForSplits(row.date, chosen) };
  });

  return out;
}

// Pure helper for testing: apply split adjustments to a single value using provided split events
export function applySplitAdjustForValue(
  dateISO: string,
  value: number,
  splits: SplitEvent[]
): number {
  if (!splits || splits.length === 0) return value;
  let factor = 1;
  for (const s of splits) {
    if (new Date(s.date).getTime() > new Date(dateISO).getTime()) {
      if (s.ratio && isFinite(s.ratio) && s.ratio > 0) factor *= s.ratio;
    }
  }
  return factor !== 1 ? value / factor : value;
}

// Pure helper: compute EPS from net income and diluted shares
export function epsFromNetIncomeAndDilutedShares(
  netIncomeUSD: number | null | undefined,
  dilutedShares: number | null | undefined
): number | null {
  if (typeof netIncomeUSD !== 'number' || typeof dilutedShares !== 'number') return null;
  if (!isFinite(netIncomeUSD) || !isFinite(dilutedShares) || dilutedShares === 0) return null;
  return netIncomeUSD / dilutedShares;
}


// lib/core/earnings-normalize.ts
// GAAP Diluted EPS normalization + split adjustment helpers

import { fetchEPSData, fetchEPSFallbackFromRatio } from '@/lib/external/sec-edgar';
import { fetchSplits, SplitEvent } from '@/lib/external/yahoo-finance';

export type NormalizedEpsPoint = {
  date: string;
  eps: number | null;
  debug?: {
    source?: 'xbrl' | 'ratio' | 'vendor';
    raw?: number;
    split_factor?: number;
  };
};

export async function normalizeGAAPDilutedEPS(
  ticker: string,
  from: string,
  to: string,
  base: Array<{ date: string; eps: number | null; source?: 'sec_pr' }>
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
  // Facts are keyed by fiscal period end; earnings dates are announcement days.
  // We'll select the closest prior fact within ~120 days (fallback to 180 days) for each event date.
  const gaapSorted = [...gaap].sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const ratioSorted = [...ratio].sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  function pickNearestPrior(arr: Array<{date:string; eps:number}>, eventISO: string): number | null {
    if (!arr.length) return null;
    const evt = new Date(eventISO).getTime();
    let best: {eps:number; dt:number} | null = null;
    for (let i=arr.length-1;i>=0;i--) {
      const dt = new Date(arr[i].date).getTime();
      if (isNaN(dt) || dt > evt) continue;
      const gap = evt - dt;
      if (gap <= 120 * 24 * 3600 * 1000) {
        best = { eps: arr[i].eps, dt };
        break;
      }
      // take within 180d as relaxed fallback (still prior only)
      if (!best && gap <= 180 * 24 * 3600 * 1000) best = { eps: arr[i].eps, dt };
      if (gap > 200 * 24 * 3600 * 1000) break; // too far
    }
    return best ? best.eps : null;
  }

  // 2) Split-adjust using Yahoo split events if present
  let splits: SplitEvent[] = [];
  try {
    // STRICT_SPLIT_ADJ_EPS=1이면 전체 히스토리 분할을 수집하여 미래 분할까지 소급 반영
    const strict = process.env.STRICT_SPLIT_ADJ_EPS === '0' ? false : true;
    if (strict) {
      const today = new Date();
      const todayISO = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
      splits = await fetchSplits(ticker, '1900-01-01', todayISO);
    } else {
      splits = await fetchSplits(ticker, from, to);
    }
  } catch {}

  // Build cumulative split factor up to each date (forward split increases denominator → eps should be divided by ratio)
  function adjustForSplits(dateISO: string, value: number): number {
    return applySplitAdjustForValue(dateISO, value, splits);
  }

  const out: NormalizedEpsPoint[] = base.map((row) => {
    const vendorAllowed = process.env.EPS_VENDOR_FALLBACK === '1';
    const vendor = vendorAllowed && (typeof row.eps === 'number' && row.eps !== null) ? row.eps : null;
    const xbrl = pickNearestPrior(gaapSorted, row.date);
    const fallback = pickNearestPrior(ratioSorted, row.date);
    let chosen: number | null = null;
    let source: 'xbrl' | 'ratio' | 'vendor' | undefined = undefined;
    if (xbrl != null) { chosen = xbrl; source = 'xbrl'; }
    else if (fallback != null) { chosen = fallback; source = 'ratio'; }
    else if (row.source === 'sec_pr' && typeof row.eps === 'number') { chosen = row.eps; source = 'vendor'; }
    else if (vendor != null) { chosen = vendor; source = 'vendor'; }
    if (chosen == null) return { date: row.date, eps: null };
    // split factor (forward splits after date)
    let factor = 1;
    if (splits && splits.length) {
      for (const s of splits) {
        if (new Date(s.date).getTime() > new Date(row.date).getTime()) {
          if (s.ratio && isFinite(s.ratio) && s.ratio > 0) factor *= s.ratio;
        }
      }
    }
    // 벤더 EPS는 대개 현재가치 기준(이미 분할 소급 적용)으로 제공되므로 추가 소급 금지
    const effectiveFactor = source === 'vendor' ? 1 : factor;
    const adjusted = effectiveFactor !== 1 ? chosen / effectiveFactor : chosen;
    return { date: row.date, eps: adjusted, debug: { source, raw: chosen, split_factor: effectiveFactor !== 1 ? effectiveFactor : undefined } };
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


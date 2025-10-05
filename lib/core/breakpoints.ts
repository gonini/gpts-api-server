/**
 * Breakpoint detection and EPS normalization utilities
 */

export interface BreakpointMeta {
  date: string;
  announceDate: string;
  when: string;
  type: 'split' | 'dividend' | 'earnings' | 'other';
  ratio: number;
  description: string;
  epsYoY?: number;
  revYoY?: number;
  eps?: number | null;
  revenue?: number | null;
  flags?: {
    eps_yoy_nm?: boolean;
    rev_yoy_nm?: boolean;
    [key: string]: any;
  };
  [key: string]: any;
}

export interface EpsNormalizationMeta {
  originalEps: number;
  normalizedEps: number;
  breakpoints: BreakpointMeta[];
}

/**
 * Detect breakpoints in price data that require EPS normalization
 */
export function detectBreakpoints(
  prices: Array<{ date: string; close?: number; adjClose?: number }>,
  earnings: Array<{ date: string; eps: number | null; revenue?: number | null; when?: string }>
): BreakpointMeta[] {
  const breakpoints: BreakpointMeta[] = [];
  if (!prices || prices.length === 0) return breakpoints;

  // Prepare helpers
  const priceStartTs = new Date(prices[0].date).getTime();
  const priceEndTs = new Date(prices[prices.length - 1].date).getTime();

  const earningsSorted = [...earnings]
    .filter(e => {
      const ts = new Date(e.date).getTime();
      return !isNaN(ts) && ts >= priceStartTs && ts <= priceEndTs;
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Build quick index by time for YoY comparisons
  const earningsByTs = earningsSorted.map(e => ({ ...e, ts: new Date(e.date).getTime() }));

  function computeYoY(currentIdx: number): { epsYoY?: number; revYoY?: number; flags?: { eps_yoy_nm?: boolean; rev_yoy_nm?: boolean } } {
    const curr = earningsByTs[currentIdx];
    console.log(`[YoY Debug] Computing YoY for ${curr.date}, eps: ${curr.eps}, revenue: ${curr.revenue}`);
    
    // Find prior ~1 year entry within ±60 days
    const oneYearMs = 365 * 24 * 3600 * 1000;
    const windowMs = 60 * 24 * 3600 * 1000;
    const targetStart = curr.ts - oneYearMs - windowMs;
    const targetEnd = curr.ts - oneYearMs + windowMs;
    
    console.log(`[YoY Debug] Looking for prior data between ${new Date(targetStart).toISOString()} and ${new Date(targetEnd).toISOString()}`);
    
    let prior: typeof curr | undefined;
    for (let i = currentIdx - 1; i >= 0; i--) {
      const ts = earningsByTs[i].ts;
      if (ts < targetStart) break;
      if (ts >= targetStart && ts <= targetEnd) { 
        prior = earningsByTs[i]; 
        console.log(`[YoY Debug] Found prior data: ${prior.date}, eps: ${prior.eps}, revenue: ${prior.revenue}`);
        break; 
      }
    }
    
    if (!prior) {
      console.log(`[YoY Debug] No prior data found for ${curr.date}`);
    }

    const out: { epsYoY?: number; revYoY?: number; flags?: { eps_yoy_nm?: boolean; rev_yoy_nm?: boolean } } = {};
    const flags: { eps_yoy_nm?: boolean; rev_yoy_nm?: boolean } = {};

    if (prior) {
      console.log(`[YoY Debug] Prior data found: ${prior.date}, eps: ${prior.eps}, revenue: ${prior.revenue}`);
      
      // EPS YoY
      if (typeof curr.eps === 'number' && curr.eps !== null && typeof prior.eps === 'number' && prior.eps !== null) {
        if (prior.eps === 0) {
          flags.eps_yoy_nm = true;
          console.log(`[YoY Debug] EPS YoY set to NM due to prior EPS = 0`);
        } else {
          out.epsYoY = (curr.eps - prior.eps) / Math.abs(prior.eps);
          console.log(`[YoY Debug] EPS YoY calculated: ${out.epsYoY} (curr: ${curr.eps}, prior: ${prior.eps})`);
        }
      } else {
        console.log(`[YoY Debug] EPS YoY cannot be calculated - curr.eps: ${curr.eps} (${typeof curr.eps}), prior.eps: ${prior.eps} (${typeof prior.eps})`);
      }
      
      // Revenue YoY
      if (typeof curr.revenue === 'number' && curr.revenue !== null && typeof prior.revenue === 'number' && prior.revenue !== null) {
        if (prior.revenue === 0) {
          flags.rev_yoy_nm = true;
          console.log(`[YoY Debug] Rev YoY set to NM due to prior revenue = 0`);
        } else {
          out.revYoY = (curr.revenue - prior.revenue) / Math.abs(prior.revenue);
          console.log(`[YoY Debug] Rev YoY calculated: ${out.revYoY} (curr: ${curr.revenue}, prior: ${prior.revenue})`);
        }
      } else {
        console.log(`[YoY Debug] Rev YoY cannot be calculated - curr.revenue: ${curr.revenue} (${typeof curr.revenue}), prior.revenue: ${prior.revenue} (${typeof prior.revenue})`);
      }
    } else {
      console.log(`[YoY Debug] No prior data available for YoY calculation`);
    }

    if (flags.eps_yoy_nm || flags.rev_yoy_nm) {
      out.flags = flags;
    }
    return out;
  }
  
  // 1. Earnings-based breakpoint detection (announcement days)
  for (let i = 0; i < earningsByTs.length; i++) {
    const earning = earningsByTs[i];
    const yoy = computeYoY(i);
    breakpoints.push({
      date: earning.date,
      announceDate: earning.date,
      when: (earning.when as string) || earning.date,
      type: 'earnings',
      ratio: 1.0,
      description: `Earnings announcement`,
      epsYoY: yoy.epsYoY,
      revYoY: yoy.revYoY,
      eps: earning.eps ?? null,
      revenue: earning.revenue ?? null,
      flags: yoy.flags,
    });
  }
  
  // 2. Price-based breakpoint detection (stock splits, significant events)
  for (let i = 1; i < prices.length; i++) {
    const prevPrice = prices[i - 1].close || prices[i - 1].adjClose;
    const currPrice = prices[i].close || prices[i].adjClose;
    
    if (!prevPrice || !currPrice) continue;
    
    const ratio = currPrice / prevPrice;
    
    // Detect significant price changes (potential stock splits)
    // Adjusted thresholds to be more realistic
    if (ratio < 0.7 || ratio > 1.5) {
      // Check if this date already has an earnings breakpoint
      const existingEarningsBreakpoint = breakpoints.find(
        bp => bp.date === prices[i].date && bp.type === 'earnings'
      );
      
      if (!existingEarningsBreakpoint) {
        breakpoints.push({
          date: prices[i].date,
          announceDate: prices[i].date,
          when: prices[i].date,
          type: 'split',
          ratio,
          description: `Price change: ${(ratio * 100).toFixed(1)}%`
        });
      }
    }
  }
  
  // Sort breakpoints by date
  breakpoints.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  
  return breakpoints;
}

/**
 * Get the last EPS normalization metadata
 */
export function getLastEpsNormalizationMeta(): EpsNormalizationMeta | null {
  // Placeholder implementation
  return null;
}
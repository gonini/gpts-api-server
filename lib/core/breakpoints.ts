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
  flags?: {
    eps_yoy_nm?: boolean;
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
  earnings: Array<{ date: string; eps: number | null }>
): BreakpointMeta[] {
  const breakpoints: BreakpointMeta[] = [];
  
  // 1. EPS-based breakpoint detection (earnings announcements)
  for (const earning of earnings) {
    if (earning.eps !== null && earning.eps !== undefined) {
      breakpoints.push({
        date: earning.date,
        announceDate: earning.date,
        when: earning.date,
        type: 'earnings',
        ratio: 1.0, // No price ratio for earnings announcements
        description: `Earnings announcement (EPS: ${earning.eps})`
      });
    }
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
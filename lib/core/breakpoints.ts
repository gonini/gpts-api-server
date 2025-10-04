/**
 * Breakpoint detection and EPS normalization utilities
 */

export interface BreakpointMeta {
  date: string;
  announceDate: string;
  when: string;
  type: 'split' | 'dividend' | 'other';
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
  
  // Simple breakpoint detection based on price gaps
  for (let i = 1; i < prices.length; i++) {
    const prevPrice = prices[i - 1].close || prices[i - 1].adjClose;
    const currPrice = prices[i].close || prices[i].adjClose;
    
    if (!prevPrice || !currPrice) continue;
    
    const ratio = currPrice / prevPrice;
    
    // Detect significant price changes (potential stock splits)
    if (ratio < 0.5 || ratio > 2.0) {
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
  
  return breakpoints;
}

/**
 * Get the last EPS normalization metadata
 */
export function getLastEpsNormalizationMeta(): EpsNormalizationMeta | null {
  // Placeholder implementation
  return null;
}
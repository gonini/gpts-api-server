/**
 * Ticker to CIK mapping table for SEC EDGAR data
 * This table maps stock tickers to their corresponding CIK (Central Index Key) numbers
 * used in SEC EDGAR filings.
 * 
 * Data source: https://www.sec.gov/files/company_tickers.json
 * Last updated: 2024-12-31
 */

import mappingData from './ticker-cik-mapping.json';

export interface TickerCIKMapping {
  ticker: string;
  cik: string;
  companyName: string;
  // Alternative names that might appear in master.idx
  altNames?: string[];
}

/**
 * Comprehensive ticker to CIK mapping table loaded from JSON
 * Includes major companies and their alternative names for robust matching
 */
export const TICKER_CIK_MAPPING: Record<string, TickerCIKMapping> = mappingData;

/**
 * Get CIK for a given ticker
 */
export function getCIKForTicker(ticker: string): string | null {
  const mapping = TICKER_CIK_MAPPING[ticker.toUpperCase()];
  return mapping ? mapping.cik : null;
}

/**
 * Get company name for a given ticker
 */
export function getCompanyNameForTicker(ticker: string): string | null {
  const mapping = TICKER_CIK_MAPPING[ticker.toUpperCase()];
  return mapping ? mapping.companyName : null;
}

/**
 * Get alternative names for a given ticker
 */
export function getAltNamesForTicker(ticker: string): string[] {
  const mapping = TICKER_CIK_MAPPING[ticker.toUpperCase()];
  return mapping ? mapping.altNames || [] : [];
}

/**
 * Check if a company name matches a ticker (including alternative names)
 */
export function isCompanyNameMatch(ticker: string, companyName: string): boolean {
  const mapping = TICKER_CIK_MAPPING[ticker.toUpperCase()];
  if (!mapping) return false;
  
  const normalizedCompanyName = companyName.toLowerCase();
  
  // Check main company name
  if (normalizedCompanyName.includes(mapping.companyName.toLowerCase())) {
    return true;
  }
  
  // Check alternative names
  return mapping.altNames?.some(altName => 
    normalizedCompanyName.includes(altName.toLowerCase())
  ) || false;
}

/**
 * Get all tickers in the mapping
 */
export function getAllTickers(): string[] {
  return Object.keys(TICKER_CIK_MAPPING);
}

/**
 * Get mapping for a specific ticker
 */
export function getTickerMapping(ticker: string): TickerCIKMapping | null {
  return TICKER_CIK_MAPPING[ticker.toUpperCase()] || null;
}

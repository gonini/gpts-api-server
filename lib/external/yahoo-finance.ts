import { PriceData, EarningsRow } from '@/lib/core/schema';
import { mergeEarningsRecords, filterEarningsByRange } from '@/lib/core/earnings-utils';
import { CacheService } from '@/lib/kv';
import { fetchRevenueData, fetchEPSData, getTickerAliasesFromSEC } from '@/lib/external/sec-edgar';
import { getOfflineAliases, providerNormalizeCandidates, orderAliasesByCutover } from '@/lib/core/symbols';
import {
  fetchFinnhubEarnings,
  fetchFinnhubPrices,
  shouldUseFinnhubEarnings,
  shouldUseFinnhubPrices,
} from '@/lib/external/finnhub';

// ---------------- Alpha Vantage response types & guards ----------------
interface AlphaAnnualEarningsItem { fiscalDateEnding?: string; reportedEPS?: string | number | null; }
interface AlphaQuarterlyEarningsItem { fiscalDateEnding?: string; reportedEPS?: string | number | null; }
interface AlphaEarningsResponse { annualEarnings?: AlphaAnnualEarningsItem[]; quarterlyEarnings?: AlphaQuarterlyEarningsItem[] }

interface AlphaIncomeQuarter { fiscalDateEnding?: string; totalRevenue?: string | number | null; reportedCurrency?: string }
interface AlphaIncomeAnnual { fiscalDateEnding?: string; totalRevenue?: string | number | null; reportedCurrency?: string }
interface AlphaIncomeStatementResponse { quarterlyReports?: AlphaIncomeQuarter[]; annualReports?: AlphaIncomeAnnual[] }

function isPlainObject(x: unknown): x is Record<string, unknown> { return !!x && typeof x === 'object'; }
function isAlphaEarningsResponse(d: unknown): d is AlphaEarningsResponse {
  return isPlainObject(d) && ('annualEarnings' in d || 'quarterlyEarnings' in d);
}
function isAlphaIncomeResponse(d: unknown): d is AlphaIncomeStatementResponse {
  return isPlainObject(d) && ('quarterlyReports' in d || 'annualReports' in d);
}

/**
 * Yahoo Finance에서 주가 데이터를 가져옵니다.
 * @param ticker 종목 티커
 * @param from 시작 날짜 (YYYY-MM-DD)
 * @param to 종료 날짜 (YYYY-MM-DD)
 * @returns 조정된 주가 데이터
 */
async function fetchYahooAdjPrices(
  ticker: string,
  from: string,
  to: string,
  opts?: { noCache?: boolean }
): Promise<PriceData[]> {
  const cacheKey = `yahoo_prices:${ticker}:${from}:${to}`;

  if (!opts?.noCache) {
    const cached = await CacheService.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  }

  const fromTimestamp = Math.floor(new Date(from).getTime() / 1000);
  const toTimestamp = Math.floor(new Date(to).getTime() / 1000);

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?period1=${fromTimestamp}&period2=${toTimestamp}&interval=1d&includePrePost=true&events=div%2Csplit`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Accept': 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache'
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();

  if (!data.chart || !data.chart.result || data.chart.result.length === 0) {
    throw new Error('No chart data found');
  }

  const result = data.chart.result[0];
  const timestamps = result.timestamp;
  const adjClose = result.indicators.adjclose[0].adjclose;

  if (!timestamps || !adjClose) {
    throw new Error('No price data found');
  }

  const prices: PriceData[] = timestamps
    .map((timestamp: number, index: number) => ({
      date: new Date(timestamp * 1000).toISOString().split('T')[0],
      adjClose: adjClose[index]
    }))
    .filter((price: PriceData) => price.adjClose !== null && !isNaN(price.adjClose));

  console.log(`Yahoo Finance: Fetched ${prices.length} price records for ${ticker}`);

  if (!opts?.noCache) {
    await CacheService.setex(cacheKey, 3600, JSON.stringify(prices));
  }

  return prices;
}

export async function fetchAdjPrices(
  ticker: string,
  from: string,
  to: string,
  opts?: { noCache?: boolean }
): Promise<PriceData[]> {
  if (shouldUseFinnhubPrices()) {
    try {
      return await fetchFinnhubPrices(ticker, from, to, { noCache: opts?.noCache });
    } catch (error) {
      console.warn('[Prices] Finnhub toggle enabled but failed, falling back to Yahoo', error);
      return fetchYahooAdjPrices(ticker, from, to, { noCache: opts?.noCache });
    }
  }

  return fetchYahooAdjPrices(ticker, from, to, { noCache: opts?.noCache });
}

/**
 * Yahoo Finance splits fetcher via v8 chart events
 */
export type SplitEvent = { date: string; ratio: number };

export async function fetchSplits(
  ticker: string,
  from: string,
  to: string
): Promise<SplitEvent[]> {
  try {
    const fromTimestamp = Math.floor(new Date(from).getTime() / 1000);
    const toTimestamp = Math.floor(new Date(to).getTime() / 1000);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?period1=${fromTimestamp}&period2=${toTimestamp}&interval=1d&includePrePost=true&events=split`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache'
      }
    });
    if (!response.ok) {
      console.warn(`[Splits] HTTP ${response.status}: ${response.statusText}`);
      return [];
    }
    const data = await response.json();
    const result = data?.chart?.result?.[0];
    const events = result?.events?.splits || {};
    const out: SplitEvent[] = [];

    for (const key of Object.keys(events)) {
      const ev = events[key];
      // Possible shapes: { date: 1657833600, numerator: 20, denominator: 1, splitRatio: '20/1' }
      let ts: number | null = null;
      if (typeof ev?.date === 'number') ts = ev.date * 1000;
      const iso = ts ? new Date(ts).toISOString().split('T')[0] : null;

      let ratio = 1;
      if (typeof ev?.numerator === 'number' && typeof ev?.denominator === 'number' && ev.denominator !== 0) {
        ratio = ev.numerator / ev.denominator;
      } else if (typeof ev?.splitRatio === 'string' && /\d+\s*\/\s*\d+/.test(ev.splitRatio)) {
        const [num, den] = ev.splitRatio.split('/').map((x: string) => parseFloat(x.trim()));
        if (den && !isNaN(num) && !isNaN(den) && den !== 0) ratio = num / den;
      }

      if (iso && ratio && ratio > 0) out.push({ date: iso, ratio });
    }

    // sort ascending by date
    out.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return out;
  } catch (e) {
    console.warn(`[Splits] fetch failed for ${ticker}: ${e instanceof Error ? e.message : String(e)}`);
    return [];
  }
}

/**
 * Yahoo Finance에서 SPY 벤치마크 데이터를 가져옵니다.
 */
export async function fetchSpy(from: string, to: string): Promise<PriceData[]> {
  return fetchAdjPrices('SPY', from, to);
}

/**
 * Yahoo Finance에서 실적 데이터를 가져옵니다.
 * 10년치 과거 데이터를 포함합니다.
 */
async function fetchYahooEarnings(
  ticker: string,
  from: string,
  to: string,
  opts?: { noCache?: boolean }
): Promise<EarningsRow[]> {
  const cacheKey = `yahoo-earnings:${ticker}:${from}:${to}`;

  if (!opts?.noCache) {
    const cached = await CacheService.get(cacheKey);
    if (cached) {
      console.log(`Yahoo Finance: Cache hit for earnings ${ticker}`);
      return JSON.parse(cached);
    }
  }

  console.log(`Fetching Yahoo Finance earnings data for ${ticker}`);
  const earningsData = await fetchYahooEarningsData(ticker, from, to);
  console.log(`Yahoo Finance: Fetched ${earningsData.length} earnings records for ${ticker}`);
  if (!opts?.noCache) {
    await CacheService.setex(cacheKey, 259200, JSON.stringify(earningsData));
  }
  return earningsData;
}

export async function fetchEarnings(
  ticker: string,
  from: string,
  to: string,
  opts?: { noCache?: boolean }
): Promise<EarningsRow[]> {
  if (shouldUseFinnhubEarnings()) {
    try {
      console.log(`[Finnhub] USE_FINNHUB_EARNINGS enabled for ${ticker}`);
      const finnhubData = await fetchFinnhubEarnings(ticker, from, to, { noCache: opts?.noCache });
      console.log(`[Finnhub] Raw earnings data for ${ticker}:`, finnhubData.map(e => ({ date: e.date, eps: e.eps, revenue: e.revenue })));
      console.log(`[Finnhub] Data quality analysis:`, {
        totalRecords: finnhubData.length,
        recordsWithEps: finnhubData.filter(e => e.eps !== null).length,
        recordsWithRevenue: finnhubData.filter(e => e.revenue !== null).length,
        dateRange: finnhubData.length > 0 ? `${finnhubData[0].date} to ${finnhubData[finnhubData.length-1].date}` : 'no data'
      });
      
      // If Finnhub returns no data, fall back to Alpha Vantage (Yahoo path)
      if (!finnhubData || finnhubData.length === 0) {
        console.warn(`[Finnhub] Returned empty earnings for ${ticker}. Falling back to Alpha Vantage.`);
        return fetchYahooEarnings(ticker, from, to, { noCache: opts?.noCache });
      }
      // Enhanced data merging: fetch Alpha Vantage and fill missing dates
      try {
        const alphaData = await fetchYahooEarnings(ticker, from, to, { noCache: opts?.noCache });
        console.log(`[Data Merge] Alpha Vantage data for ${ticker}:`, alphaData.map(e => ({ date: e.date, eps: e.eps, revenue: e.revenue })));
        
        if (alphaData && alphaData.length > 0) {
          // First, attempt exact-date merge (same as before)
          let merged = mergeEarningsRecords(finnhubData, alphaData);
          // Proximity merge: fill missing EPS/Revenue on Finnhub dates using nearest Alpha dates within ±60 days
          try {
            const padMs = 60 * 24 * 3600 * 1000;
            const alphaList = alphaData
              .filter(e => e.date)
              .map(e => ({ ...e, ts: new Date(e.date).getTime() }))
              .filter(x => !isNaN(x.ts));
            merged = merged.map(row => {
              if ((row.eps != null && row.revenue != null) || !row.date) return row;
              const t = new Date(row.date).getTime();
              if (isNaN(t)) return row;
              let bestIdx = -1; let bestDelta = Number.POSITIVE_INFINITY;
              for (let i = 0; i < alphaList.length; i++) {
                const d = Math.abs(alphaList[i].ts - t);
                if (d <= padMs && d < bestDelta) { bestDelta = d; bestIdx = i; }
              }
              if (bestIdx >= 0) {
                const a = alphaList[bestIdx];
                return {
                  date: row.date,
                  when: row.when,
                  eps: row.eps ?? a.eps ?? null,
                  revenue: row.revenue ?? a.revenue ?? null,
                } as EarningsRow;
              }
              return row;
            });
          } catch (e) {
            console.log(`[Data Merge] Proximity merge skipped: ${e instanceof Error ? e.message : String(e)}`);
          }
          console.log(`[Data Merge] Merged data for ${ticker}:`, merged.map(e => ({ date: e.date, eps: e.eps, revenue: e.revenue })));
          return filterEarningsByRange(merged, from, to);
        }
      } catch (mergeErr) {
        console.warn(`[Earnings merge] Alpha Vantage fetch failed for ${ticker}:`, mergeErr);
      }
      return filterEarningsByRange(finnhubData, from, to);
    } catch (error) {
      console.warn(`[Finnhub] Failed for ${ticker}, falling back to Yahoo Finance:`, error);
      return filterEarningsByRange(await fetchYahooEarnings(ticker, from, to, { noCache: opts?.noCache }), from, to);
    }
  }

  console.log(`[Yahoo] USE_FINNHUB_EARNINGS disabled; using Yahoo Finance earnings for ${ticker}`);
  const yahooData = await fetchYahooEarnings(ticker, from, to, { noCache: opts?.noCache });
  console.log(`[Yahoo] Yahoo Finance earnings data for ${ticker}:`, yahooData.map(e => ({ date: e.date, eps: e.eps, revenue: e.revenue })));
  return filterEarningsByRange(yahooData, from, to);
}

/**
 * Merge earnings arrays, preferring primary provider (Finnhub) values and
 * filling missing dates/fields from secondary provider (Alpha Vantage).
 */
// mergeEarningsRecords & filterEarningsByRange moved to core/earnings-utils

/**
 * Alpha Vantage API를 사용하여 실적 데이터를 가져옵니다.
 * 10년치 과거 데이터를 제공합니다.
 */
async function fetchYahooEarningsData(
  ticker: string,
  from: string,
  to: string
): Promise<EarningsRow[]> {
  console.log(`Fetching Alpha Vantage earnings data for ${ticker} from ${from} to ${to}`);
  
  try {
    const alphaVantageApiKey = process.env.ALPHA_VANTAGE_API_KEY || 'ACQM8ZYA8BB62RSK';
    
    if (!alphaVantageApiKey) {
      console.warn('ALPHA_VANTAGE_API_KEY environment variable is not set. Earnings data will not be available.');
      console.warn('Please set ALPHA_VANTAGE_API_KEY in your .env.local file to enable earnings data.');
      return [];
    }
    
    // Ticker aliases (company-level) to improve historical coverage (e.g., GOOG/GOOGL)
    const aliasesSEC = await getTickerAliasesFromSEC(ticker);
    const aliasesOffline = getOfflineAliases(ticker);
    const mergedAliases = Array.from(new Set([...aliasesSEC, ...aliasesOffline]));
    const uniqueAliases = orderAliasesByCutover(ticker, mergedAliases, from, to);
    // Alpha Vantage API 엔드포인트들 (provider-specific normalization handled by alias list)
    const alphaVantageEndpoints: string[] = [];
    for (const sym of uniqueAliases) {
      const cands = Array.from(new Set(providerNormalizeCandidates(sym, 'alphavantage')));
      for (const s of cands) {
        alphaVantageEndpoints.push(
          `https://www.alphavantage.co/query?function=EARNINGS&symbol=${s}&apikey=${alphaVantageApiKey}`,
          `https://www.alphavantage.co/query?function=INCOME_STATEMENT&symbol=${s}&apikey=${alphaVantageApiKey}`
        );
      }
    }
    
    let earningsData: EarningsRow[] = [];
    
    for (const alphaVantageUrl of alphaVantageEndpoints) {
      try {
        if (process.env.DEBUG_ANALYZE === '1' || process.env.DEBUG_LOGS === '1') {
          console.log(`Trying Alpha Vantage endpoint: ${alphaVantageUrl.replace(alphaVantageApiKey, '***')}`);
        }
        
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 8000);
        const response = await fetch(alphaVantageUrl, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'GPTs-API-Server/1.0'
          },
          signal: controller.signal
        });
        // no clearTimeout needed for one-shot abort timer
        
        if (!response.ok) {
          console.log(`Endpoint failed with status ${response.status}`);
          continue;
        }
        
        const data: unknown = await response.json();
        if (!isPlainObject(data)) {
          console.log('Alpha Vantage response not an object, skipping');
          continue;
        }
        if (process.env.DEBUG_ANALYZE === '1' || process.env.DEBUG_LOGS === '1') {
          console.log(`Alpha Vantage response structure:`, Object.keys(data as Record<string, unknown>));
        }
        
        // Alpha Vantage 데이터 파싱 시도
        const parsedData = parseAlphaVantageData(data, ticker, from, to);
        if (parsedData.length > 0) {
          if (process.env.DEBUG_ANALYZE === '1' || process.env.DEBUG_LOGS === '1') {
            console.log(`Found ${parsedData.length} earnings records from Alpha Vantage`);
          }
          earningsData = [...earningsData, ...parsedData];
        }
        
      } catch (error) {
        if (process.env.DEBUG_ANALYZE === '1' || process.env.DEBUG_LOGS === '1') {
          console.log(`Endpoint failed: ${error instanceof Error ? error.message : String(error)}`);
        }
        continue;
      }
    }
    
    // SEC EDGAR 데이터도 추가로 수집
    try {
      console.log(`Fetching SEC EDGAR revenue data for ${ticker}`);
      const secRevenueData = await fetchRevenueData(ticker, from, to);
      console.log(`Found ${secRevenueData.length} SEC EDGAR revenue records`);
      
      // SEC EDGAR 데이터를 earnings 형식으로 변환
      secRevenueData.forEach(revenueRecord => {
        // 이미 존재하는 날짜가 있는지 확인
        const existingIndex = earningsData.findIndex(e => e.date === revenueRecord.date);
        if (existingIndex >= 0) {
          // 기존 데이터에 revenue 정보 추가
          earningsData[existingIndex].revenue = revenueRecord.revenue;
        } else {
          // 새로운 earnings 레코드 생성 (EPS는 null, Revenue만 있음)
          earningsData.push({
            date: revenueRecord.date,
                   when: 'unknown' as const,
            eps: null,
            revenue: revenueRecord.revenue,
          });
        }
      });
      // EPS도 companyfacts 기반으로 보강
      try {
        console.log(`Fetching SEC EDGAR EPS data for ${ticker}`);
        const secEPS = await fetchEPSData(ticker, from, to);
        console.log(`Found ${secEPS.length} SEC EDGAR EPS records`);
        secEPS.forEach(rec => {
          const idx = earningsData.findIndex(e => e.date === rec.date);
          if (idx >= 0) {
            if (earningsData[idx].eps == null && typeof rec.eps === 'number') {
              earningsData[idx].eps = rec.eps;
            }
          } else {
            earningsData.push({ date: rec.date, when: 'unknown', eps: rec.eps, revenue: null });
          }
        });
      } catch (e) {
        console.log(`SEC EDGAR EPS fetch failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    } catch (error) {
      console.log(`SEC EDGAR data fetch failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    // 중복 제거 및 정렬
    const uniqueEarnings = earningsData.filter((earning, index, self) => 
      index === self.findIndex(e => e.date === earning.date)
    ).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    console.log(`Total unique earnings records: ${uniqueEarnings.length}`);
    return uniqueEarnings;
    
  } catch (error) {
    console.error(`Error fetching Alpha Vantage earnings for ${ticker}:`, error instanceof Error ? error.message : String(error));
    return [];
  }
}

/**
 * Alpha Vantage API 응답 데이터를 파싱합니다.
 */
function parseAlphaVantageData(
  data: unknown,
  ticker: string,
  from: string,
  to: string
): EarningsRow[] {
  const earningsData: EarningsRow[] = [];
  
  try {
    console.log(`Parsing Alpha Vantage data for ${ticker}`);
    if (!isPlainObject(data)) return earningsData;
    console.log(`Alpha Vantage data structure:`, Object.keys(data as Record<string, unknown>));
    
    // Alpha Vantage EARNINGS API 응답 구조 확인
    if (isAlphaEarningsResponse(data) && data.annualEarnings && Array.isArray(data.annualEarnings)) {
      console.log(`Found ${data.annualEarnings.length} annual earnings entries`);
      
      data.annualEarnings.forEach((earning: any, index: number) => {
        console.log(`Annual earnings ${index}:`, earning);
        
        // 날짜 형식 변환 (YYYY-MM-DD)
        let date = earning.fiscalDateEnding;
        if (earning.fiscalDateEnding && earning.fiscalDateEnding.includes('T')) {
          date = earning.fiscalDateEnding.split('T')[0];
        }
        
        // EPS 데이터 확인
        let eps = null;
        if (earning.reportedEPS !== undefined && earning.reportedEPS !== null && earning.reportedEPS !== 'None') {
          eps = parseFloat(earning.reportedEPS);
        }
        
        // Revenue 데이터는 이 API에서 제공하지 않음
        let revenue = null;
        
        // 날짜 범위 필터링 (더 유연한 범위 적용)
        const earningDate = new Date(date);
        const fromDate = new Date(from);
        const toDate = new Date(to);
        
        // 요청 범위보다 2년 전부터 2년 후까지 포함하여 더 많은 데이터 수집
        const extendedFromDate = new Date(fromDate.getFullYear() - 2, fromDate.getMonth(), fromDate.getDate());
        const extendedToDate = new Date(toDate.getFullYear() + 2, toDate.getMonth(), toDate.getDate());
        
        if (earningDate >= extendedFromDate && earningDate <= extendedToDate) {
          earningsData.push({
            date: date || new Date().toISOString().split('T')[0],
                   when: 'unknown' as const,
            eps: eps,
            revenue: revenue,
          });
        }
      });
    }
    
    // Alpha Vantage QUARTERLY_EARNINGS API 응답 구조 확인
    if (isAlphaEarningsResponse(data) && data.quarterlyEarnings && Array.isArray(data.quarterlyEarnings)) {
      console.log(`Found ${data.quarterlyEarnings.length} quarterly earnings entries`);
      
      data.quarterlyEarnings.forEach((earning: any, index: number) => {
        console.log(`Quarterly earnings ${index}:`, earning);
        
        let date = earning.fiscalDateEnding;
        if (earning.fiscalDateEnding && earning.fiscalDateEnding.includes('T')) {
          date = earning.fiscalDateEnding.split('T')[0];
        }
        
        let eps = null;
        if (earning.reportedEPS !== undefined && earning.reportedEPS !== null && earning.reportedEPS !== 'None') {
          eps = parseFloat(earning.reportedEPS);
        }
        
        let revenue = null;
        
        const earningDate = new Date(date);
        const fromDate = new Date(from);
        const toDate = new Date(to);
        
        // 요청 범위보다 2년 전부터 2년 후까지 포함하여 더 많은 데이터 수집
        const extendedFromDate = new Date(fromDate.getFullYear() - 2, fromDate.getMonth(), fromDate.getDate());
        const extendedToDate = new Date(toDate.getFullYear() + 2, toDate.getMonth(), toDate.getDate());
        
        if (earningDate >= extendedFromDate && earningDate <= extendedToDate) {
          earningsData.push({
            date: date || new Date().toISOString().split('T')[0],
                   when: 'unknown' as const,
            eps: eps,
            revenue: revenue,
          });
        }
      });
    }
    
    // Alpha Vantage INCOME_STATEMENT API 응답 구조 확인
    if (isAlphaIncomeResponse(data) && data.annualReports && Array.isArray(data.annualReports)) {
      console.log(`Found ${data.annualReports.length} annual income statements`);
      
      data.annualReports.forEach((report: any, index: number) => {
        console.log(`Annual report ${index}:`, report);
        
        let date = report.fiscalDateEnding;
        if (report.fiscalDateEnding && report.fiscalDateEnding.includes('T')) {
          date = report.fiscalDateEnding.split('T')[0];
        }
        
        let eps = null;
        if (report.reportedCurrency && report.totalRevenue) {
          // Revenue 데이터가 있는 경우
          let revenue = null;
          if (report.totalRevenue !== undefined && report.totalRevenue !== null && report.totalRevenue !== 'None') {
            revenue = parseFloat(report.totalRevenue);
          }
          
          const earningDate = new Date(date);
          const fromDate = new Date(from);
          const toDate = new Date(to);
          
          if (earningDate >= fromDate && earningDate <= toDate) {
            earningsData.push({
              date: date || new Date().toISOString().split('T')[0],
                   when: 'unknown' as const,
              eps: eps,
              revenue: revenue,
            });
          }
        }
      });
    }
    
    console.log(`Parsed ${earningsData.length} earnings records from Alpha Vantage for ${ticker}`);
    // defer return to allow revenue merge step below
    
  } catch (error) {
    console.error(`Error parsing Alpha Vantage data for ${ticker}:`, error instanceof Error ? error.message : String(error));
    return [];
  }

  // Alpha Vantage INCOME_STATEMENT quarterlyReports (분기 매출) 파싱 및 근접 병합
  try {
    if (isAlphaIncomeResponse(data) && (data as AlphaIncomeStatementResponse).quarterlyReports && Array.isArray((data as AlphaIncomeStatementResponse).quarterlyReports)) {
      const quarterly: Array<{ date: string; revenue: number | null }> = [];

      (data as AlphaIncomeStatementResponse).quarterlyReports!.forEach((report: AlphaIncomeQuarter) => {
        let date = report.fiscalDateEnding;
        if (date && typeof date === 'string' && date.includes('T')) {
          date = date.split('T')[0];
        }
        let revenue: number | null = null;
        if (report.totalRevenue !== undefined && report.totalRevenue !== null && report.totalRevenue !== 'None') {
          const parsed = parseFloat(String(report.totalRevenue).replace(/,/g, ''));
          if (!isNaN(parsed)) revenue = parsed;
        }
        if (date && revenue !== null) {
          const d = new Date(date);
          if (!isNaN(d.getTime())) {
            quarterly.push({ date, revenue });
          }
        }
      });

      if (quarterly.length) {
        // 기존 EPS 레코드와 근접 병합(±75일)
        const padMs = 75 * 24 * 3600 * 1000;
        const byDate = new Map<string, EarningsRow>();
        for (const e of earningsData) {
          if (e?.date) byDate.set(e.date, e);
        }

        const epsList = earningsData
          .filter(e => e.eps !== null && e.date)
          .map(e => ({ ...e, ts: new Date(e.date).getTime() }))
          .filter(x => !isNaN(x.ts));

        for (const q of quarterly) {
          const qts = new Date(q.date).getTime();
          if (isNaN(qts)) continue;
          // 정확한 날짜 우선
          if (byDate.has(q.date)) {
            const ex = byDate.get(q.date)!;
            const updated: EarningsRow = { date: ex.date, when: ex.when, eps: ex.eps, revenue: (ex.revenue ?? q.revenue) };
            byDate.set(q.date, updated);
            continue;
          }
          // EPS 근접 병합
          let bestIdx = -1; let bestDelta = Number.POSITIVE_INFINITY;
          for (let i = 0; i < epsList.length; i++) {
            const d = Math.abs(epsList[i].ts - qts);
            if (d <= padMs && d < bestDelta) { bestDelta = d; bestIdx = i; }
          }
          if (bestIdx >= 0) {
            const target = epsList[bestIdx];
            const updated: EarningsRow = { date: target.date, when: target.when, eps: target.eps, revenue: target.revenue ?? q.revenue };
            byDate.set(target.date, updated);
          } else {
            // 근접 EPS가 없으면 revenue-only 레코드 추가
            if (!byDate.has(q.date)) {
              byDate.set(q.date, { date: q.date, when: 'unknown', eps: null, revenue: q.revenue });
            }
          }
        }

        // earningsData를 병합 결과로 교체(날짜 정렬)
        const merged = Array.from(byDate.values()).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        earningsData.length = 0;
        earningsData.push(...merged);
      }
    }
  } catch (err: any) {
    console.log(`Alpha Vantage quarterlyReports merge failed: ${err?.message ?? String(err)}`);
  }
  return earningsData;
}

/**
 * Finnhub API 응답 데이터를 파싱합니다.
 */
function parseFinnhubEarningsData(
  data: any,
  ticker: string,
  from: string,
  to: string
): Array<{ date: string; when: string; eps: number | null; revenue: number | null }> {
  const earningsData: Array<{ date: string; when: string; eps: number | null; revenue: number | null }> = [];
  
  try {
    console.log(`Parsing Finnhub earnings data for ${ticker}`);
    console.log(`Finnhub data structure:`, Object.keys(data));
    
    // Finnhub API 응답 구조 확인 (여러 엔드포인트 지원)
    
    // 1. stock/earnings API 응답 (배열)
    if (Array.isArray(data)) {
      console.log(`Found ${data.length} earnings entries (stock/earnings API)`);
      
      data.forEach((earning: any, index: number) => {
        console.log(`Earnings ${index}:`, earning);
        
        // 날짜 형식 변환 (YYYY-MM-DD)
        let date = earning.period;
        if (earning.period && earning.period.includes('T')) {
          date = earning.period.split('T')[0];
        }
        
        // EPS 데이터 확인 (actual 값 사용)
        let eps = null;
        if (earning.actual !== undefined && earning.actual !== null) {
          eps = parseFloat(earning.actual);
        }
        
        // Revenue 데이터는 이 API에서 제공하지 않음
        let revenue = null;
        
        // 날짜 범위 필터링
        const earningDate = new Date(date);
        const fromDate = new Date(from);
        const toDate = new Date(to);
        
        if (earningDate >= fromDate && earningDate <= toDate) {
          earningsData.push({
            date: date || new Date().toISOString().split('T')[0],
                   when: 'unknown' as const,
            eps: eps,
            revenue: revenue,
          });
        }
      });
    }
    // 2. calendar/earnings API 응답 (객체)
    else if (data.earningsCalendar && Array.isArray(data.earningsCalendar)) {
      console.log(`Found ${data.earningsCalendar.length} earnings calendar entries`);
      
      data.earningsCalendar.forEach((earning: any, index: number) => {
        console.log(`Earnings calendar ${index}:`, earning);
        
        let date = earning.date;
        if (earning.date && earning.date.includes('T')) {
          date = earning.date.split('T')[0];
        }
        
        let eps = null;
        if (earning.epsActual !== undefined && earning.epsActual !== null) {
          eps = parseFloat(earning.epsActual);
        }
        
        let revenue = null;
        if (earning.revenueActual !== undefined && earning.revenueActual !== null) {
          revenue = parseFloat(earning.revenueActual);
        }
        
        const earningDate = new Date(date);
        const fromDate = new Date(from);
        const toDate = new Date(to);
        
        if (earningDate >= fromDate && earningDate <= toDate) {
          earningsData.push({
            date: date || new Date().toISOString().split('T')[0],
            when: earning.time || 'unknown',
            eps: eps,
            revenue: revenue,
          });
        }
      });
    }
    // 3. company-news API 응답 (배열)
    else if (Array.isArray(data) && data.length > 0 && data[0].headline) {
      console.log(`Found ${data.length} news entries (company-news API)`);
      
      // 뉴스에서 실적 관련 정보 추출 (간단한 키워드 매칭)
      data.forEach((news: any, index: number) => {
        const headline = news.headline.toLowerCase();
        const summary = news.summary.toLowerCase();
        
        // 실적 관련 키워드 확인
        if (headline.includes('earnings') || headline.includes('revenue') || 
            summary.includes('earnings') || summary.includes('revenue')) {
          
          const newsDate = new Date(news.datetime * 1000).toISOString().split('T')[0];
          const earningDate = new Date(newsDate);
          const fromDate = new Date(from);
          const toDate = new Date(to);
          
          if (earningDate >= fromDate && earningDate <= toDate) {
            earningsData.push({
              date: newsDate,
                   when: 'unknown' as const,
              eps: null, // 뉴스에서는 EPS 정보를 직접 추출하기 어려움
              revenue: null,
            });
          }
        }
      });
    }
    else {
      console.log('No recognizable earnings data structure found in Finnhub response');
    }
    
    console.log(`Parsed ${earningsData.length} earnings records from Finnhub for ${ticker}`);
    return earningsData;
    
  } catch (error) {
    console.error(`Error parsing Finnhub data for ${ticker}:`, error);
    return [];
  }
}

// 더미 데이터 함수 제거됨 - 실제 Yahoo Finance API만 사용

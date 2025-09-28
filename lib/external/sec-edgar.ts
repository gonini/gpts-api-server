// lib/external/sec-edgar.ts
// SEC EDGAR 데이터 파싱을 위한 유틸리티 함수들

import { CacheService } from '@/lib/kv';

// 티커별 CIK 매핑 (Central Index Key)
const TICKER_TO_CIK: Record<string, string> = {
  'AAPL': '0000320193',
  'MSFT': '0000789019',
  'GOOGL': '0001652044',
  'AMZN': '0001018724',
  'TSLA': '0001318605',
  'META': '0001326801',
  'NBR': '0001163739',
  'NVDA': '0001045810',
  'NFLX': '0001067983',
  'AMD': '0000002488',
};

/**
 * SEC EDGAR에서 특정 티커의 Revenue 데이터를 가져옵니다.
 * @param ticker 주식 티커 심볼
 * @param from 시작 날짜
 * @param to 종료 날짜
 * @returns Revenue 데이터 배열
 */
export async function fetchRevenueData(ticker: string, from: string, to: string): Promise<Array<{ date: string; revenue: number }>> {
  const cacheKey = `revenue:${ticker}:${from}:${to}`;
  const cachedData = await CacheService.get(cacheKey);
  if (cachedData) {
    return JSON.parse(cachedData);
  }

  try {
    // 실제 SEC EDGAR 데이터 파싱 시도
    console.log(`Attempting to fetch real SEC EDGAR data for ${ticker}`);
    
    const realData = await parseRealSECData(ticker, from, to);
    if (realData.length > 0) {
      console.log(`Successfully fetched ${realData.length} real revenue records from SEC EDGAR`);
      await CacheService.setex(cacheKey, 86400, JSON.stringify(realData)); // 24시간 캐시
      return realData;
    }
    
    console.log(`No real SEC data found for ${ticker} - returning empty array`);
    return [];
  } catch (error) {
    console.error(`Error fetching revenue data for ${ticker}:`, error);
    return [];
  }
}

/**
 * 실제 SEC EDGAR 데이터를 파싱합니다.
 * 10-K, 10-Q 보고서에서 Revenue 데이터를 추출합니다.
 */
async function parseRealSECData(ticker: string, from: string, to: string): Promise<Array<{ date: string; revenue: number }>> {
  const revenueData: Array<{ date: string; revenue: number }> = [];
  
  try {
    const cik = TICKER_TO_CIK[ticker.toUpperCase()];
    if (!cik) {
      console.log(`CIK not found for ${ticker}, skipping real SEC data`);
      return [];
    }

    const fromYear = new Date(from).getFullYear();
    const toYear = new Date(to).getFullYear();
    
    // 각 연도별로 10-K 보고서에서 Revenue 데이터 추출
    for (let year = fromYear; year <= toYear; year++) {
      try {
        console.log(`Fetching SEC 10-K data for ${ticker} in ${year}`);
        
        // 10-K 보고서 가져오기
        const reportData = await fetchSECData(ticker, '10-K', year);
        
        // Revenue 데이터 파싱
        const yearRevenue = parseRevenueFromSEC(reportData, year);
        if (yearRevenue) {
          revenueData.push(yearRevenue);
        }
        
        // 10-Q 보고서도 확인 (분기별 데이터)
        for (let quarter = 1; quarter <= 4; quarter++) {
          try {
            const quarterData = await fetchSECData(ticker, '10-Q', year);
            const quarterRevenue = parseRevenueFromSEC(quarterData, year, quarter);
            if (quarterRevenue) {
              revenueData.push(quarterRevenue);
            }
          } catch (error) {
            console.log(`No 10-Q data for ${ticker} Q${quarter} ${year}`);
          }
        }
        
      } catch (error) {
        console.log(`No SEC data found for ${ticker} in ${year}:`, error);
      }
    }
    
    console.log(`Parsed ${revenueData.length} real revenue records from SEC EDGAR for ${ticker}`);
    return revenueData;
    
  } catch (error) {
    console.error(`Error parsing real SEC data for ${ticker}:`, error);
    return [];
  }
}

/**
 * SEC EDGAR에서 특정 보고서 데이터를 가져옵니다.
 */
async function fetchSECData(ticker: string, reportType: string, year: number): Promise<string> {
  const cik = TICKER_TO_CIK[ticker.toUpperCase()];
  if (!cik) {
    throw new Error(`CIK not found for ${ticker}`);
  }

  // SEC EDGAR API URL 구성
  const url = `https://www.sec.gov/Archives/edgar/data/${cik}/${year}/${reportType.toLowerCase()}.txt`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return await response.text();
  } catch (error) {
    console.error(`Error fetching SEC data for ${ticker}:`, error);
    throw error;
  }
}

/**
 * SEC EDGAR 보고서에서 Revenue 데이터를 파싱합니다.
 */
function parseRevenueFromSEC(reportData: string, year: number, quarter?: number): { date: string; revenue: number } | null {
  try {
    // 실제 SEC EDGAR 파싱 로직 구현
    // 여기서는 간단한 예시만 제공
    
    // Revenue 패턴 매칭 (실제로는 더 복잡한 파싱 필요)
    const revenuePattern = /revenue[:\s]*\$?([0-9,]+)/gi;
    const matches = reportData.match(revenuePattern);
    
    if (matches && matches.length > 0) {
      const revenue = parseFloat(matches[0].replace(/[$,]/g, ''));
      const date = quarter ? `${year}-${quarter * 3}-30` : `${year}-12-31`;
      
      return {
        date,
        revenue
      };
    }
    
    return null;
  } catch (error) {
    console.error(`Error parsing SEC data:`, error);
    return null;
  }
}
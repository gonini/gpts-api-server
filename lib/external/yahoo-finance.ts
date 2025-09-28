import { PriceData } from '@/lib/core/schema';
import { CacheService } from '@/lib/kv';
import { fetchRevenueData } from '@/lib/external/sec-edgar';

/**
 * Yahoo Finance에서 주가 데이터를 가져옵니다.
 * @param ticker 종목 티커
 * @param from 시작 날짜 (YYYY-MM-DD)
 * @param to 종료 날짜 (YYYY-MM-DD)
 * @returns 조정된 주가 데이터
 */
export async function fetchAdjPrices(
  ticker: string,
  from: string,
  to: string
): Promise<PriceData[]> {
  const cacheKey = `yahoo_prices:${ticker}:${from}:${to}`;
  
  // 캐시에서 먼저 확인
  const cached = await CacheService.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  // Yahoo Finance API URL
  const fromTimestamp = Math.floor(new Date(from).getTime() / 1000);
  const toTimestamp = Math.floor(new Date(to).getTime() / 1000);
  
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?period1=${fromTimestamp}&period2=${toTimestamp}&interval=1d&includePrePost=true&events=div%2Csplit`;

  try {
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

    const prices: PriceData[] = timestamps.map((timestamp: number, index: number) => ({
      date: new Date(timestamp * 1000).toISOString().split('T')[0],
      adjClose: adjClose[index]
    })).filter((price: PriceData) => price.adjClose !== null && !isNaN(price.adjClose));

    console.log(`Yahoo Finance: Fetched ${prices.length} price records for ${ticker}`);

    // 캐시에 저장 (60분 TTL)
    await CacheService.setex(cacheKey, 3600, JSON.stringify(prices));
    
    return prices;
  } catch (error) {
    console.error('Yahoo Finance API error:', error);
    throw error;
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
export async function fetchEarnings(
  ticker: string,
  from: string,
  to: string
): Promise<Array<{ date: string; when: string; eps: number | null; revenue: number | null }>> {
  const cacheKey = `yahoo-earnings:${ticker}:${from}:${to}`;
  
  // 캐시에서 먼저 확인
  const cached = await CacheService.get(cacheKey);
  if (cached) {
    console.log(`Yahoo Finance: Cache hit for earnings ${ticker}`);
    return JSON.parse(cached);
  }

  try {
    console.log(`Fetching Yahoo Finance earnings data for ${ticker}`);
    
    // Yahoo Finance에서 실적 데이터 가져오기
    const earningsData = await fetchYahooEarningsData(ticker, from, to);
    
    console.log(`Yahoo Finance: Fetched ${earningsData.length} earnings records for ${ticker}`);

    // 캐시에 저장 (72시간 TTL)
    await CacheService.setex(cacheKey, 259200, JSON.stringify(earningsData));
    
    return earningsData;
  } catch (error) {
    console.error('Yahoo Finance earnings API error:', error);
    throw error;
  }
}

/**
 * Alpha Vantage API를 사용하여 실적 데이터를 가져옵니다.
 * 10년치 과거 데이터를 제공합니다.
 */
async function fetchYahooEarningsData(
  ticker: string,
  from: string,
  to: string
): Promise<Array<{ date: string; when: string; eps: number | null; revenue: number | null }>> {
  console.log(`Fetching Alpha Vantage earnings data for ${ticker} from ${from} to ${to}`);
  
  try {
    const alphaVantageApiKey = process.env.ALPHA_VANTAGE_API_KEY || 'ACQM8ZYA8BB62RSK';
    
    if (!alphaVantageApiKey) {
      console.warn('ALPHA_VANTAGE_API_KEY environment variable is not set. Earnings data will not be available.');
      console.warn('Please set ALPHA_VANTAGE_API_KEY in your .env.local file to enable earnings data.');
      return [];
    }
    
    // Alpha Vantage API 엔드포인트들
    const alphaVantageEndpoints = [
      `https://www.alphavantage.co/query?function=EARNINGS&symbol=${ticker}&apikey=${alphaVantageApiKey}`,
      `https://www.alphavantage.co/query?function=INCOME_STATEMENT&symbol=${ticker}&apikey=${alphaVantageApiKey}`
    ];
    
    let earningsData: Array<{ date: string; when: string; eps: number | null; revenue: number | null }> = [];
    
    for (const alphaVantageUrl of alphaVantageEndpoints) {
      try {
        console.log(`Trying Alpha Vantage endpoint: ${alphaVantageUrl.replace(alphaVantageApiKey, '***')}`);
        
        const response = await fetch(alphaVantageUrl, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'GPTs-API-Server/1.0'
          }
        });
        
        if (!response.ok) {
          console.log(`Endpoint failed with status ${response.status}`);
          continue;
        }
        
        const data = await response.json();
        console.log(`Alpha Vantage response structure:`, Object.keys(data));
        
        // Alpha Vantage 데이터 파싱 시도
        const parsedData = parseAlphaVantageData(data, ticker, from, to);
        if (parsedData.length > 0) {
          console.log(`Found ${parsedData.length} earnings records from Alpha Vantage`);
          earningsData = [...earningsData, ...parsedData];
        }
        
      } catch (error) {
        console.log(`Endpoint failed: ${error.message}`);
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
            when: 'unknown',
            eps: null,
            revenue: revenueRecord.revenue,
          });
        }
      });
    } catch (error) {
      console.log(`SEC EDGAR data fetch failed: ${error.message}`);
    }
    
    // 중복 제거 및 정렬
    const uniqueEarnings = earningsData.filter((earning, index, self) => 
      index === self.findIndex(e => e.date === earning.date)
    ).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    console.log(`Total unique earnings records: ${uniqueEarnings.length}`);
    return uniqueEarnings;
    
  } catch (error) {
    console.error(`Error fetching Finnhub earnings for ${ticker}:`, error);
    return [];
  }
}

/**
 * Alpha Vantage API 응답 데이터를 파싱합니다.
 */
function parseAlphaVantageData(
  data: any,
  ticker: string,
  from: string,
  to: string
): Array<{ date: string; when: string; eps: number | null; revenue: number | null }> {
  const earningsData: Array<{ date: string; when: string; eps: number | null; revenue: number | null }> = [];
  
  try {
    console.log(`Parsing Alpha Vantage data for ${ticker}`);
    console.log(`Alpha Vantage data structure:`, Object.keys(data));
    
    // Alpha Vantage EARNINGS API 응답 구조 확인
    if (data.annualEarnings && Array.isArray(data.annualEarnings)) {
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
        
        // 날짜 범위 필터링
        const earningDate = new Date(date);
        const fromDate = new Date(from);
        const toDate = new Date(to);
        
        if (earningDate >= fromDate && earningDate <= toDate) {
          earningsData.push({
            date: date || new Date().toISOString().split('T')[0],
            when: 'unknown',
            eps: eps,
            revenue: revenue,
          });
        }
      });
    }
    
    // Alpha Vantage QUARTERLY_EARNINGS API 응답 구조 확인
    if (data.quarterlyEarnings && Array.isArray(data.quarterlyEarnings)) {
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
        
        if (earningDate >= fromDate && earningDate <= toDate) {
          earningsData.push({
            date: date || new Date().toISOString().split('T')[0],
            when: 'unknown',
            eps: eps,
            revenue: revenue,
          });
        }
      });
    }
    
    // Alpha Vantage INCOME_STATEMENT API 응답 구조 확인
    if (data.annualReports && Array.isArray(data.annualReports)) {
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
              when: 'unknown',
              eps: eps,
              revenue: revenue,
            });
          }
        }
      });
    }
    
    console.log(`Parsed ${earningsData.length} earnings records from Alpha Vantage for ${ticker}`);
    return earningsData;
    
  } catch (error) {
    console.error(`Error parsing Alpha Vantage data for ${ticker}:`, error);
    return [];
  }
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
            when: 'unknown',
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
              when: 'unknown',
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

import { PolygonPriceSchema, PriceData } from '@/lib/core/schema';
import { CacheService } from '@/lib/kv';

const POLYGON_BASE_URL = 'https://api.polygon.io/v2/aggs/ticker';

export async function fetchAdjPrices(
  ticker: string, 
  from: string, 
  to: string
): Promise<PriceData[]> {
  const cacheKey = `prices:${ticker}:${from}:${to}`;
  
  // 캐시에서 먼저 확인 (임시로 비활성화)
  // const cached = await CacheService.getConversationCache(cacheKey);
  // if (cached) {
  //   return cached;
  // }

  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) {
    throw new Error('POLYGON_API_KEY not configured');
  }

  const url = `${POLYGON_BASE_URL}/${ticker}/range/1/day/${from}/${to}?adjusted=true&sort=asc&limit=50000&apiKey=${apiKey}`;
  
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('ERR_NO_PRICES');
      }
      if (response.status === 429) {
        throw new Error('Rate limit exceeded');
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    console.log('Polygon API response sample:', {
      ticker: data.ticker,
      resultsCount: data.resultsCount,
      resultsLength: data.results?.length,
      status: data.status
    });
    
    if (!data.results || data.results.length === 0) {
      throw new Error('No price data in response');
    }
    
    // 스키마 검증을 우회하고 직접 처리
    const results = data.results || [];
    
    // 표준화된 형태로 변환
    const prices: PriceData[] = results.map(result => ({
      date: new Date(result.t).toISOString().split('T')[0],
      adjClose: result.c,
    }));

    // 캐시에 저장 (60분 TTL) - 임시로 비활성화
    // await CacheService.setConversationCache(cacheKey, prices, 3600);
    
    return prices;
  } catch (error) {
    console.error('Polygon API error:', error);
    throw error;
  }
}

export async function fetchSpy(
  from: string, 
  to: string
): Promise<PriceData[]> {
  return fetchAdjPrices('SPY', from, to);
}

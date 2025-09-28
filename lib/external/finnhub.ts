import { FinnhubEarningsSchema, EarningsRow } from '@/lib/core/schema';
import { CacheService } from '@/lib/kv';

const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1/calendar/earnings';

export async function fetchEarnings(
  ticker: string,
  from: string,
  to: string
): Promise<EarningsRow[]> {
  const cacheKey = `earnings:${ticker}:${from}:${to}`;
  
  // 캐시에서 먼저 확인
  const cached = await CacheService.getConversationCache(cacheKey);
  if (cached) {
    return cached;
  }

  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    throw new Error('FINNHUB_API_KEY not configured');
  }

  const url = `${FINNHUB_BASE_URL}?from=${from}&to=${to}&symbol=${ticker}&token=${apiKey}`;
  
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('ERR_NO_EARNINGS');
      }
      if (response.status === 429) {
        throw new Error('Rate limit exceeded');
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const validated = FinnhubEarningsSchema.parse(data);
    
    // 표준화된 형태로 변환
    const earnings: EarningsRow[] = validated.earningsCalendar.map(earning => ({
      date: earning.date,
      when: mapTimeToWhen(earning.time),
      eps: earning.epsActual,
      revenue: earning.revenueActual,
    }));

    // 캐시에 저장 (72시간 TTL)
    await CacheService.setConversationCache(cacheKey, earnings, 259200);
    
    return earnings;
  } catch (error) {
    console.error('Finnhub API error:', error);
    throw error;
  }
}

function mapTimeToWhen(time: string | null): 'bmo' | 'amc' | 'dmh' | 'unknown' {
  if (!time) return 'unknown';
  
  const normalized = time.toLowerCase();
  switch (normalized) {
    case 'bmo':
      return 'bmo';
    case 'amc':
      return 'amc';
    case 'dmh':
      return 'dmh';
    default:
      return 'unknown';
  }
}

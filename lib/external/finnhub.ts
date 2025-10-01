import { DateTime } from 'luxon';
import { EarningsRow, FinnhubEarningsSchema, PriceData } from '@/lib/core/schema';
import { CacheService } from '@/lib/kv';

const FINNHUB_API_BASE = 'https://finnhub.io/api/v1';

const FINNHUB_BACKOFF_BASE_MS = parseInt(process.env.FINNHUB_BACKOFF_BASE_MS || '250', 10);
const FINNHUB_BACKOFF_MAX_RETRIES = parseInt(process.env.FINNHUB_BACKOFF_MAX_RETRIES || '3', 10);

function getEnvBoolean(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

export function shouldUseFinnhubEarnings(): boolean {
  return getEnvBoolean('USE_FINNHUB_EARNINGS', true);
}

export function shouldUseFinnhubPrices(): boolean {
  return getEnvBoolean('USE_FINNHUB_PRICES', false);
}

function buildFinnhubUrl(path: string, params: Record<string, string | number | undefined>): string {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      searchParams.append(key, String(value));
    }
  });
  return `${FINNHUB_API_BASE}${path}?${searchParams.toString()}`;
}

function createDelay(attempt: number): number {
  const jitter = Math.random() * (FINNHUB_BACKOFF_BASE_MS / 2);
  return FINNHUB_BACKOFF_BASE_MS * Math.pow(2, attempt - 1) + jitter;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

type FinnhubFetchOptions = {
  cacheKey: string;
  ttlSeconds: number;
  logLabel: string;
};

async function fetchWithRetry<T>(url: string, parser: (json: any) => T, options: FinnhubFetchOptions): Promise<T> {
  const cached = await CacheService.get(options.cacheKey);
  if (cached) {
    console.info(`[Finnhub] cache_hit=1 key=${options.cacheKey}`);
    return JSON.parse(cached) as T;
  }

  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    console.error('[Finnhub] FINNHUB_API_KEY is not configured');
    throw new Error('ERR_SOURCE_UNAVAILABLE');
  }

  let lastError: Error | null = null;
  let rateLimitHits = 0;

  for (let attempt = 1; attempt <= FINNHUB_BACKOFF_MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'GPTs-API-Server/1.0',
          'Accept': 'application/json',
        },
      });

      if (response.status === 429) {
        rateLimitHits += 1;
        console.warn(`[Finnhub] rate_limit_hits=${rateLimitHits} attempt=${attempt} url=${url}`);
        if (attempt === FINNHUB_BACKOFF_MAX_RETRIES) {
          throw new Error('ERR_RATE_LIMITED');
        }
        await sleep(createDelay(attempt));
        continue;
      }

      if (!response.ok) {
        const body = await response.text();
        console.error(`[Finnhub] ${options.logLabel} failed status=${response.status} body=${body}`);
        throw new Error('ERR_SOURCE_UNAVAILABLE');
      }

      const json = await response.json();
      const parsed = parser(json);

      await CacheService.setex(options.cacheKey, options.ttlSeconds, JSON.stringify(parsed));
      console.info(`[Finnhub] cache_store=1 key=${options.cacheKey} retries=${attempt - 1}`);

      return parsed;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (lastError.message === 'ERR_RATE_LIMITED') {
        break;
      }
      if (attempt === FINNHUB_BACKOFF_MAX_RETRIES) {
        console.error(`[Finnhub] ${options.logLabel} exhausted retries`, lastError);
        break;
      }
      await sleep(createDelay(attempt));
    }
  }

  throw lastError ?? new Error('ERR_SOURCE_UNAVAILABLE');
}

function normalizeFinnhubDate(date: string): string {
  const dt = DateTime.fromISO(date, { zone: 'America/New_York' });
  if (!dt.isValid) {
    return date;
  }
  return dt.toISODate();
}

export async function fetchFinnhubEarnings(ticker: string, from: string, to: string): Promise<EarningsRow[]> {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    throw new Error('ERR_SOURCE_UNAVAILABLE');
  }

  const url = buildFinnhubUrl('/calendar/earnings', {
    symbol: ticker,
    from,
    to,
    token: apiKey,
  });

  const parser = (json: any): EarningsRow[] => {
    const parsed = FinnhubEarningsSchema.safeParse(json);
    if (!parsed.success) {
      console.error('[Finnhub] earnings schema validation failed', parsed.error.format());
      throw new Error('ERR_SOURCE_UNAVAILABLE');
    }

    return parsed.data.earningsCalendar.map(entry => ({
      date: normalizeFinnhubDate(entry.date),
      when: (entry.time || entry.hour) === 'bmo' || (entry.time || entry.hour) === 'amc' || (entry.time || entry.hour) === 'dmh' ? (entry.time || entry.hour) as 'bmo' | 'amc' | 'dmh' : 'unknown',
      eps: typeof entry.epsActual === 'number' ? entry.epsActual : null,
      revenue: typeof entry.revenueActual === 'number' ? entry.revenueActual : null,
    }));
  };

  return fetchWithRetry(url, parser, {
    cacheKey: `finnhub:earnings:${ticker}:${from}:${to}`,
    ttlSeconds: 72 * 60 * 60,
    logLabel: 'earnings',
  });
}

export async function fetchFinnhubPrices(ticker: string, from: string, to: string): Promise<PriceData[]> {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    throw new Error('ERR_SOURCE_UNAVAILABLE');
  }

  const fromDate = DateTime.fromISO(from, { zone: 'America/New_York' }).startOf('day');
  const toDate = DateTime.fromISO(to, { zone: 'America/New_York' }).endOf('day');

  const url = buildFinnhubUrl('/stock/candle', {
    symbol: ticker,
    resolution: 'D',
    from: Math.floor(fromDate.toUTC().toSeconds()),
    to: Math.floor(toDate.toUTC().toSeconds()),
    token: apiKey,
  });

  const parser = (json: any): PriceData[] => {
    if (!json || json.s !== 'ok' || !Array.isArray(json.t) || !Array.isArray(json.c)) {
      console.error('[Finnhub] price schema unexpected', json);
      throw new Error('ERR_SOURCE_UNAVAILABLE');
    }

    const timestamps: number[] = json.t;
    const closes: number[] = json.c;

    return timestamps
      .map((timestamp, index) => {
        const close = closes[index];
        if (typeof close !== 'number' || !isFinite(close)) {
          return null;
        }

        const date = DateTime.fromSeconds(timestamp, { zone: 'America/New_York' }).toISODate();
        if (!date) {
          return null;
        }

        return {
          date,
          adjClose: close,
        } satisfies PriceData;
      })
      .filter((value): value is PriceData => Boolean(value));
  };

  return fetchWithRetry(url, parser, {
    cacheKey: `finnhub:prices:${ticker}:${from}:${to}`,
    ttlSeconds: 60 * 60,
    logLabel: 'prices',
  });
}


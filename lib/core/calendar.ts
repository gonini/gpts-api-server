import { PriceData } from '@/lib/core/schema';

type ResolveDay0Meta = {
  fallbackUsed?: boolean;
  fallbackReason?: 'closest_future' | 'no_future' | 'same_day';
};

let lastResolveDay0Meta: ResolveDay0Meta = {};

export function getLastResolveDay0Meta(): ResolveDay0Meta {
  return lastResolveDay0Meta;
}

export function resolveDay0(
  announceDate: string,
  when: string,
  tradingDates: string[]
): number | null {
  console.log(`Resolving Day0 for ${announceDate} (when: ${when})`);
  console.log(`Available trading dates: ${tradingDates.slice(0, 5).join(', ')}... (${tradingDates.length} total)`);

  const announce = new Date(announceDate);
  const today = new Date();

  lastResolveDay0Meta = {};

  // 미래 날짜는 처리하지 않음
  if (announce > today) {
    console.log(`Skipping future date: ${announceDate} (current: ${today.toISOString().split('T')[0]})`);
    return null;
  }

  if (when === 'bmo') {
    // BMO: 발표일이 Day0
    const day0Index = tradingDates.findIndex(date => date === announceDate);
    console.log(`BMO: Looking for exact date ${announceDate}, found at index ${day0Index}`);
    if (day0Index >= 0) {
      return day0Index;
    }

    const fallback = findNextTradingDay(announceDate, tradingDates, { includeSameDay: true });
    if (!fallback.date) {
      return null;
    }

    const fallbackIndex = tradingDates.findIndex(date => date === fallback.date);
    if (fallbackIndex >= 0) {
      if (fallback.fallbackUsed) {
        lastResolveDay0Meta = {
          fallbackUsed: true,
          fallbackReason: fallback.reason,
        };
      }
      return fallbackIndex;
    }

    return null;
  } else {
    // AMC, DMH, unknown: 발표일 다음 거래일이 Day0
    const nextTradingDay = findNextTradingDay(announceDate, tradingDates);
    console.log(`AMC/DMH/unknown: Next trading day after ${announceDate} is ${nextTradingDay.date}`);
    if (!nextTradingDay.date) return null;

    if (nextTradingDay.fallbackUsed) {
      lastResolveDay0Meta = {
        fallbackUsed: true,
        fallbackReason: nextTradingDay.reason,
      };
    }

    const day0Index = tradingDates.findIndex(date => date === nextTradingDay.date);
    console.log(`Day0 index: ${day0Index}`);
    return day0Index >= 0 ? day0Index : null;
  }
}

function findNextTradingDay(
  announceDate: string,
  tradingDates: string[],
  options?: { includeSameDay?: boolean }
): { date: string | null; fallbackUsed: boolean; reason?: 'closest_future' | 'no_future' | 'same_day' } {
  const announce = new Date(announceDate);
  const today = new Date();

  // 미래 날짜는 처리하지 않음
  if (announce > today) {
    console.log(`Skipping future date: ${announceDate} (current: ${today.toISOString().split('T')[0]})`);
    return { date: null, fallbackUsed: false };
  }

  // 1. 정확한 날짜 매칭 시도 (발표일 이후 첫 번째 거래일)
  for (const date of tradingDates) {
    const tradingDate = new Date(date);
    if (options?.includeSameDay && tradingDate.getTime() === announce.getTime()) {
      console.log(`Using same-day trading session for ${date}`);
      return { date, fallbackUsed: false, reason: 'same_day' };
    }

    if (tradingDate > announce) {
      console.log(`Found next trading day: ${date} (after ${announceDate})`);
      return { date, fallbackUsed: false, reason: 'closest_future' };
    }
  }

  console.log(`No future trading day found for ${announceDate}`);

  if (tradingDates.length === 0) {
    return { date: null, fallbackUsed: false };
  }

  const lastDate = tradingDates[tradingDates.length - 1];
  console.log(`Falling back to last available trading date: ${lastDate}`);
  return { date: lastDate, fallbackUsed: true, reason: 'no_future' };
}

export function getTradingDates(prices: PriceData[]): string[] {
  return prices
    .map(p => p.date)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
}

export function formatDateRange(startIdx: number, endIdx: number, tradingDates: string[]): {
  start: string;
  end: string;
} {
  return {
    start: tradingDates[startIdx] || '',
    end: tradingDates[endIdx] || '',
  };
}

import { PriceData } from '@/lib/core/schema';

export function resolveDay0(
  announceDate: string,
  when: string,
  tradingDates: string[]
): number | null {
  const announce = new Date(announceDate);
  
  if (when === 'bmo') {
    // BMO: 발표일이 Day0
    const day0Index = tradingDates.findIndex(date => date === announceDate);
    return day0Index >= 0 ? day0Index : null;
  } else {
    // AMC, DMH, unknown: 발표일 다음 거래일이 Day0
    const nextTradingDay = findNextTradingDay(announceDate, tradingDates);
    if (!nextTradingDay) return null;
    
    const day0Index = tradingDates.findIndex(date => date === nextTradingDay);
    return day0Index >= 0 ? day0Index : null;
  }
}

function findNextTradingDay(announceDate: string, tradingDates: string[]): string | null {
  const announce = new Date(announceDate);
  
  for (const date of tradingDates) {
    const tradingDate = new Date(date);
    if (tradingDate > announce) {
      return date;
    }
  }
  
  return null;
}

export function getTradingDates(prices: PriceData[]): string[] {
  return prices.map(p => p.date).sort();
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

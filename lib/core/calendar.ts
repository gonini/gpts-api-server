import { PriceData } from '@/lib/core/schema';

export function resolveDay0(
  announceDate: string,
  when: string,
  tradingDates: string[]
): number | null {
  console.log(`Resolving Day0 for ${announceDate} (when: ${when})`);
  console.log(`Available trading dates: ${tradingDates.slice(0, 5).join(', ')}... (${tradingDates.length} total)`);
  
  const announce = new Date(announceDate);
  const today = new Date();
  
  // 미래 날짜는 처리하지 않음
  if (announce > today) {
    console.log(`Skipping future date: ${announceDate} (current: ${today.toISOString().split('T')[0]})`);
    return null;
  }
  
  if (when === 'bmo') {
    // BMO: 발표일이 Day0
    const day0Index = tradingDates.findIndex(date => date === announceDate);
    console.log(`BMO: Looking for exact date ${announceDate}, found at index ${day0Index}`);
    return day0Index >= 0 ? day0Index : null;
  } else {
    // AMC, DMH, unknown: 발표일 다음 거래일이 Day0
    const nextTradingDay = findNextTradingDay(announceDate, tradingDates);
    console.log(`AMC/DMH/unknown: Next trading day after ${announceDate} is ${nextTradingDay}`);
    if (!nextTradingDay) return null;
    
    const day0Index = tradingDates.findIndex(date => date === nextTradingDay);
    console.log(`Day0 index: ${day0Index}`);
    return day0Index >= 0 ? day0Index : null;
  }
}

function findNextTradingDay(announceDate: string, tradingDates: string[]): string | null {
  const announce = new Date(announceDate);
  const today = new Date();
  
  // 미래 날짜는 처리하지 않음
  if (announce > today) {
    console.log(`Skipping future date: ${announceDate} (current: ${today.toISOString().split('T')[0]})`);
    return null;
  }
  
  // 1. 정확한 날짜 매칭 시도 (발표일 이후 첫 번째 거래일)
  for (const date of tradingDates) {
    const tradingDate = new Date(date);
    if (tradingDate > announce) {
      console.log(`Found next trading day: ${date} (after ${announceDate})`);
      return date;
    }
  }
  
  // 2. 정확한 매칭이 실패하면 발표일과 가장 가까운 거래일 찾기
  console.log(`No exact match found for ${announceDate}, looking for closest trading day`);
  
  let closestDate = null;
  let minDiff = Infinity;
  
  for (const date of tradingDates) {
    const tradingDate = new Date(date);
    const diff = Math.abs(tradingDate.getTime() - announce.getTime());
    
    if (diff < minDiff) {
      minDiff = diff;
      closestDate = date;
    }
  }
  
  console.log(`Closest trading day to ${announceDate}: ${closestDate}`);
  return closestDate;
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

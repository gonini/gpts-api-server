import { PriceData, CARResult } from '@/lib/core/schema';

export function computeCAR(
  prices: PriceData[],
  bench: PriceData[],
  day0Idx: number,
  window: [number, number]
): CARResult {
  const [startOffset, endOffset] = window;
  const startIdx = day0Idx + startOffset;
  const endIdx = day0Idx + endOffset;
  
  // 윈도우 범위 검증
  if (startIdx < 0 || endIdx >= prices.length || startIdx >= endIdx) {
    throw new Error('ERR_WINDOW_PARTIAL');
  }
  
  let retSum = 0;
  let benchSum = 0;
  
  // 윈도우 내 각 거래일에 대해 계산
  for (let i = startIdx; i < endIdx; i++) {
    if (i + 1 >= prices.length) break;
    
    // 개별 주식 수익률
    const ret = (prices[i + 1].adjClose / prices[i].adjClose) - 1;
    retSum += ret;
    
    // 벤치마크 수익률
    const benchRet = (bench[i + 1].adjClose / bench[i].adjClose) - 1;
    benchSum += benchRet;
  }
  
  // CAR = sum(ri - riBench)
  const car = retSum - benchSum;
  
  return {
    car,
    ret_sum: retSum,
    bench_sum: benchSum,
  };
}

export function alignPriceData(prices: PriceData[], bench: PriceData[]): {
  prices: PriceData[];
  bench: PriceData[];
} {
  const priceMap = new Map(prices.map(p => [p.date, p]));
  const benchMap = new Map(bench.map(p => [p.date, p]));
  
  const commonDates = prices
    .map(p => p.date)
    .filter(date => benchMap.has(date))
    .sort();
  
  const alignedPrices: PriceData[] = [];
  const alignedBench: PriceData[] = [];
  
  for (const date of commonDates) {
    const price = priceMap.get(date);
    const benchPrice = benchMap.get(date);
    
    if (price && benchPrice) {
      alignedPrices.push(price);
      alignedBench.push(benchPrice);
    }
  }
  
  return {
    prices: alignedPrices,
    bench: alignedBench,
  };
}

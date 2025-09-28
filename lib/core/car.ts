import { PriceData, CARResult } from '@/lib/core/schema';

export type InternalCAR = CARResult & { __partial?: boolean; __windowDays?: number };

export function computeCAR(
  prices: PriceData[],
  bench: PriceData[],
  day0Idx: number,
  window: [number, number]
): InternalCAR {
  const [startOffset, endOffset] = window;
  let startIdx = day0Idx + startOffset;
  let endIdx = day0Idx + endOffset;
  let adjusted = false;

  const maxIndex = Math.min(prices.length - 1, bench.length - 1);

  console.log(`CAR calculation: Day0=${day0Idx}, window=[${startOffset},${endOffset}], startIdx=${startIdx}, endIdx=${endIdx}, dataLength=${prices.length}`);

  // 윈도우 범위 검증 - 더 유연한 검증
  if (startIdx < 0) {
    console.warn(`Start index ${startIdx} is negative, adjusting to 0`);
    startIdx = 0;
    adjusted = true;
  }

  if (endIdx > maxIndex) {
    console.warn(`End index ${endIdx} exceeds data length ${maxIndex + 1}, adjusting to ${maxIndex}`);
    endIdx = maxIndex;
    adjusted = true;
  }

  if (startIdx > maxIndex) {
    console.warn(`Start index ${startIdx} exceeds available data ${maxIndex}, cannot compute window.`);
    throw new Error('ERR_WINDOW_PARTIAL');
  }

  if (startIdx >= endIdx) {
    throw new Error('ERR_WINDOW_PARTIAL');
  }

  return computeCARWithAdjustedWindow(prices, bench, startIdx, endIdx, adjusted);
}

function computeCARWithAdjustedWindow(
  prices: PriceData[],
  bench: PriceData[],
  startIdx: number,
  endIdx: number,
  adjusted: boolean
): InternalCAR {
  let retSum = 0;
  let benchSum = 0;
  let validDays = 0;

  console.log(`Computing CAR with adjusted window: startIdx=${startIdx}, endIdx=${endIdx}`);

  // 윈도우 내 각 거래일에 대해 계산
  for (let i = startIdx; i < endIdx; i++) {
    if (i + 1 >= prices.length || i + 1 >= bench.length) break;

    // 개별 주식 수익률
    const ret = (prices[i + 1].adjClose / prices[i].adjClose) - 1;
    retSum += ret;

    // 벤치마크 수익률
    const benchRet = (bench[i + 1].adjClose / bench[i].adjClose) - 1;
    benchSum += benchRet;
    
    validDays++;
  }
  
  console.log(`CAR calculation completed: validDays=${validDays}, retSum=${retSum.toFixed(4)}, benchSum=${benchSum.toFixed(4)}`);

  // CAR = sum(ri - riBench)
  const car = retSum - benchSum;

  const effectiveWindowLength = endIdx - startIdx;

  return {
    car,
    ret_sum: retSum,
    bench_sum: benchSum,
    __partial: adjusted || validDays < effectiveWindowLength ? true : undefined,
    __windowDays: validDays,
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

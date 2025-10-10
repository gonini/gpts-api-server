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

// Market model (CAPM-light) utilities
type OLS = { alpha: number; beta: number; n: number; residSD: number };

function olsAlphaBeta(stock: PriceData[], market: PriceData[], endIdx: number, lookback: number): OLS | null {
  // compute simple log returns over [endIdx-lookback, endIdx)
  const startIdx = Math.max(0, endIdx - lookback);
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = startIdx; i < endIdx; i++) {
    if (i + 1 >= stock.length || i + 1 >= market.length) break;
    const ri = Math.log(stock[i + 1].adjClose / stock[i].adjClose);
    const rm = Math.log(market[i + 1].adjClose / market[i].adjClose);
    if (isFinite(ri) && isFinite(rm)) {
      ys.push(ri);
      xs.push(rm);
    }
  }
  const n = xs.length;
  if (n < 20) return null; // require minimum observations
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const xbar = mean(xs);
  const ybar = mean(ys);
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - xbar) * (ys[i] - ybar); den += (xs[i] - xbar) ** 2; }
  if (den === 0) return null;
  const beta = num / den;
  const alpha = ybar - beta * xbar;
  // residual SD
  let ss = 0;
  for (let i = 0; i < n; i++) {
    const pred = alpha + beta * xs[i];
    const resid = ys[i] - pred;
    ss += resid * resid;
  }
  const residSD = Math.sqrt(ss / Math.max(1, n - 2));
  return { alpha, beta, n, residSD };
}

export function computeMarketModelCAR(
  prices: PriceData[],
  bench: PriceData[],
  day0Idx: number,
  window: [number, number],
  estimationWindow = 252
): InternalCAR & { car_tstat?: number; market_model_used: true; alpha_beta: { alpha: number; beta: number; n: number } } {
  // estimate alpha/beta up to day0Idx (exclude event window)
  const ols = olsAlphaBeta(prices, bench, Math.max(0, day0Idx), estimationWindow);
  // fallback to simple diff if OLS not available
  const base = computeCAR(prices, bench, day0Idx, window);
  if (!ols) {
    return { ...base, market_model_used: true, alpha_beta: { alpha: 0, beta: 1, n: 0 }, car_tstat: undefined };
  }

  const [startOffset, endOffset] = window;
  let startIdx = day0Idx + startOffset;
  let endIdx = day0Idx + endOffset;
  let adjusted = false;
  const maxIndex = Math.min(prices.length - 1, bench.length - 1);
  if (startIdx < 0) { startIdx = 0; adjusted = true; }
  if (endIdx > maxIndex) { endIdx = maxIndex; adjusted = true; }
  if (startIdx >= endIdx) return { ...base, market_model_used: true, alpha_beta: { alpha: ols.alpha, beta: ols.beta, n: ols.n }, car_tstat: undefined };

  let car = 0;
  const ars: number[] = [];
  for (let i = startIdx; i < endIdx; i++) {
    if (i + 1 >= prices.length || i + 1 >= bench.length) break;
    const ri = Math.log(prices[i + 1].adjClose / prices[i].adjClose);
    const rm = Math.log(bench[i + 1].adjClose / bench[i].adjClose);
    const exp = ols.alpha + ols.beta * rm;
    const ar = ri - exp;
    ars.push(ar);
    car += ar;
  }
  const n = ars.length;
  let car_tstat: number | undefined = undefined;
  if (ols.residSD > 0 && n > 1) {
    car_tstat = car / (ols.residSD / Math.sqrt(n));
  }
  return {
    car,
    ret_sum: base.ret_sum,
    bench_sum: base.bench_sum,
    __partial: adjusted || base.__partial,
    __windowDays: n,
    market_model_used: true,
    car_tstat,
    alpha_beta: { alpha: ols.alpha, beta: ols.beta, n: ols.n }
  };
}

import { NextRequest, NextResponse } from 'next/server';
import { AnalysisRequestSchema, AnalysisResponse } from '@/lib/core/schema';
import { fetchAdjPrices, fetchEarnings } from '@/lib/external/yahoo-finance'; // All from Yahoo Finance
import { detectBreakpoints, getLastEpsNormalizationMeta } from '@/lib/core/breakpoints';
import { resolveDay0, getTradingDates, formatDateRange, getLastResolveDay0Meta } from '@/lib/core/calendar';
import { computeCAR, alignPriceData } from '@/lib/core/car';
import { RateLimiter } from '@/lib/core/rate-limit';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  return handleRequest(request);
}

export async function POST(request: NextRequest) {
  return handleRequest(request);
}

async function handleRequest(request: NextRequest) {
  try {
    // 레이트 리미팅 체크
    const ip = request.ip || request.headers.get('x-forwarded-for') || 'unknown';
    const rateLimit = await RateLimiter.checkRateLimit(ip);
    
    if (!rateLimit.allowed) {
      return NextResponse.json({
        success: false,
        error: 'Rate limit exceeded',
        message: 'Too many requests. Please try again later.',
      }, { 
        status: 429,
        headers: {
          'Retry-After': '60',
          'X-RateLimit-Remaining': '0',
        },
      });
    }

    // GET 요청 (쿼리 파라미터) 또는 POST 요청 (JSON body) 지원
    let ticker: string, from: string, to: string;
    
    let benchTicker = 'SPY';
    const benchCandidates = new Set(['SPY', 'XLE', 'QQQ', 'IWM']);

    if (request.method === 'GET') {
      const url = new URL(request.url);
      ticker = url.searchParams.get('ticker') || '';
      from = url.searchParams.get('from') || '';
      to = url.searchParams.get('to') || '';
      const benchParam = (url.searchParams.get('bench') || benchTicker).toUpperCase();
      if (benchCandidates.has(benchParam)) {
        benchTicker = benchParam;
      }
    } else {
      const body = await request.json();
      const parsed = AnalysisRequestSchema.parse(body);
      ticker = parsed.ticker;
      from = parsed.from;
      to = parsed.to;
    }
    
    // 입력 검증
    if (!ticker || !from || !to) {
      return NextResponse.json({
        success: false,
        error: 'ERR_INVALID_INPUT',
        message: 'Missing required parameters: ticker, from, to',
      }, { status: 400 });
    }

    // 1. 데이터 수집
    console.log(`Fetching data for ${ticker} from ${from} to ${to}`);
    
    const [prices, bench, earnings] = await Promise.all([
      fetchAdjPrices(ticker, from, to).catch(err => {
        console.error('Yahoo Finance prices API error:', err);
        throw new Error('ERR_NO_PRICES');
      }),
      fetchAdjPrices(benchTicker, from, to).catch(err => {
        console.error(`Yahoo Finance bench API error (${benchTicker}):`, err);
        throw new Error('ERR_NO_BENCH');
      }),
      fetchEarnings(ticker, from, to).catch(err => {
        console.error('Yahoo Finance earnings API error:', err);
        throw new Error('ERR_NO_EARNINGS');
      }),
    ]);

    if (prices.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'ERR_NO_PRICES',
        message: 'No price data available for the specified period',
      }, { status: 404 });
    }

    const notesBase = new Set<string>([
      'price_TTL=60m',
      'fund_TTL=72h',
      'assume_AMC_if_unknown',
      'timestamps=ET; adjustedClose=true',
      `bench=${benchTicker}`,
    ]);

    if (earnings.length === 0) {
      console.log('No earnings data found, returning empty segments');
      return NextResponse.json({
        success: true,
        data: {
          ticker,
          as_of: new Date().toISOString().split('T')[0],
          segments: [],
          notes: [
            'No earnings data available for the specified period',
            ...Array.from(notesBase),
          ],
        },
      });
    }

    // 2. 데이터 정렬 및 정렬
    const { prices: alignedPrices, bench: alignedBench } = alignPriceData(prices, bench);
    const tradingDates = getTradingDates(alignedPrices);

    // 3. 변곡점 탐지
    console.log('Earnings data for breakpoint detection:', JSON.stringify(earnings, null, 2));
    const breakpoints = detectBreakpoints(earnings);
    console.log('Detected breakpoints:', JSON.stringify(breakpoints, null, 2));
    console.log(`Total breakpoints detected: ${breakpoints.length}`);

    if (breakpoints.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          ticker,
          as_of: new Date().toISOString().split('T')[0],
          segments: [],
          notes: [
            'No significant earnings breakpoints detected',
            ...Array.from(notesBase),
          ],
        },
      });
    }

    // 4. 각 변곡점에 대해 CAR 계산
    const segments: AnalysisResponse['segments'] = [];
    const notesFlags = new Set<string>();

    for (const breakpoint of breakpoints) {
      try {
        // Day0 계산
        console.log(`Processing breakpoint: ${breakpoint.announceDate}`);
        const day0Idx = resolveDay0(breakpoint.announceDate, breakpoint.when, tradingDates);
        console.log(`Day0 index for ${breakpoint.announceDate}: ${day0Idx}`);

        const day0Meta = getLastResolveDay0Meta();
        if (day0Meta?.fallbackUsed) {
          notesFlags.add('day0_fallback');
        }

        if (day0Idx === null) {
          console.warn(`Day0 not found for ${breakpoint.announceDate}`);
          continue;
        }

        // 윈도우별 CAR 계산
        const windows = [
          { window: [-1, 5] as [number, number], label: '[-1,+5]' },
          { window: [-5, 20] as [number, number], label: '[-5,+20]' },
        ];

        for (const { window, label } of windows) {
          try {
            console.log(`Computing CAR for ${breakpoint.announceDate} window ${label} (Day0: ${day0Idx})`);
            const carResult = computeCAR(alignedPrices, alignedBench, day0Idx, window);
            console.log(`CAR result for ${label}:`, carResult);

            if (carResult.__partial) {
              notesFlags.add('window_clamped');
            }

            const labelParts: string[] = [];
            if (typeof breakpoint.epsYoY === 'number') {
              labelParts.push(`EPS YoY ${(breakpoint.epsYoY * 100).toFixed(0)}%`);
            } else if (breakpoint.flags?.eps_yoy_nm) {
              labelParts.push('EPS YoY NM');
            }

            if (typeof breakpoint.revYoY === 'number') {
              labelParts.push(`Rev YoY ${(breakpoint.revYoY * 100).toFixed(0)}%`);
            } else if (breakpoint.flags?.rev_yoy_nm) {
              labelParts.push('Rev YoY NM');
            }

            const segmentLabel = `${breakpoint.announceDate} ${labelParts.join(' ')}`.trim();

            let period = formatDateRange(day0Idx + window[0], day0Idx + window[1], tradingDates);
            if (!period.start) {
              period.start = tradingDates[0];
            }
            if (!period.end) {
              period.end = tradingDates[tradingDates.length - 1];
            }

            const segment = {
              label: segmentLabel,
              earnings: {
                date: breakpoint.announceDate,
                when: breakpoint.when,
                eps: breakpoint.eps ?? null,
                eps_yoy: breakpoint.epsYoY ?? null,
                rev_yoy: breakpoint.revYoY ?? null,
                flags: breakpoint.flags,
              },
              period,
              price_reaction: {
                window: label,
                car: carResult.car,
                ret_sum: carResult.ret_sum,
                bench_sum: carResult.bench_sum,
              },
              source_urls: [
                `yahoo-finance://chart/${ticker}?period1=${from}&period2=${to}`,
                `yahoo-finance://earnings/${ticker}?from=${from}&to=${to}`,
              ],
            };

            segments.push(segment);
            console.log(`Added segment for ${breakpoint.announceDate} window ${label}`);
          } catch (error) {
            console.warn(`CAR calculation failed for window ${label}:`, error);
          }
        }
      } catch (error) {
        console.warn(`Day0 resolution failed for ${breakpoint.announceDate}:`, error);
      }
    }

    console.log(`Final segments count: ${segments.length}`);
    console.log('Final segments:', JSON.stringify(segments, null, 2));

    const normalizationMeta = getLastEpsNormalizationMeta();
    if (normalizationMeta.epsScale !== 1) {
      notesFlags.add(`eps_scaled=${normalizationMeta.epsScale}`);
    }

    const responseNotes = new Set<string>();
    notesBase.forEach(note => responseNotes.add(note));
    notesFlags.forEach(note => responseNotes.add(note));

    const response: AnalysisResponse = {
      ticker,
      as_of: new Date().toISOString().split('T')[0],
      segments,
      notes: Array.from(responseNotes),
    };

    return NextResponse.json({
      success: true,
      data: response,
    }, {
      headers: {
        'X-RateLimit-Remaining': rateLimit.remaining.toString(),
        'X-RateLimit-Reset': new Date(Date.now() + 60 * 1000).toISOString(),
      },
    });

  } catch (error) {
    console.error('Analysis API error:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('ERR_')) {
        return NextResponse.json({
          success: false,
          error: error.message,
        }, { status: 422 });
      }
    }
    
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
    }, { status: 500 });
  }
}

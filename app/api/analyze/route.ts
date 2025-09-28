import { NextRequest, NextResponse } from 'next/server';
import { AnalysisRequestSchema, AnalysisResponse } from '@/lib/core/schema';
import { fetchAdjPrices, fetchSpy, fetchEarnings } from '@/lib/external/yahoo-finance'; // All from Yahoo Finance
import { detectBreakpoints } from '@/lib/core/breakpoints';
import { resolveDay0, getTradingDates, formatDateRange } from '@/lib/core/calendar';
import { computeCAR, alignPriceData } from '@/lib/core/car';
import { RateLimiter } from '@/lib/core/rate-limit';

export const runtime = 'edge';

export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { ticker, from, to } = AnalysisRequestSchema.parse(body);

    // 1. 데이터 수집
    console.log(`Fetching data for ${ticker} from ${from} to ${to}`);
    
    const [prices, bench, earnings] = await Promise.all([
      fetchAdjPrices(ticker, from, to).catch(err => {
        console.error('Yahoo Finance prices API error:', err);
        throw new Error('ERR_NO_PRICES');
      }),
      fetchSpy(from, to).catch(err => {
        console.error('Yahoo Finance SPY API error:', err);
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
            'price_TTL=60m',
            'fund_TTL=72h',
            'assume_AMC_if_unknown',
            'timestamps=ET; adjustedClose=true',
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
            'price_TTL=60m',
            'fund_TTL=72h',
            'assume_AMC_if_unknown',
            'timestamps=ET; adjustedClose=true',
          ],
        },
      });
    }

    // 4. 각 변곡점에 대해 CAR 계산
    const segments: AnalysisResponse['segments'] = [];

    for (const breakpoint of breakpoints) {
      try {
        // Day0 계산
        console.log(`Processing breakpoint: ${breakpoint.announceDate}`);
        const day0Idx = resolveDay0(breakpoint.announceDate, breakpoint.when, tradingDates);
        console.log(`Day0 index for ${breakpoint.announceDate}: ${day0Idx}`);
        
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
            
            const segment = {
              label: `${breakpoint.announceDate} ${breakpoint.eps !== null ? `EPS YoY ${(breakpoint.epsYoY! * 100).toFixed(0)}%` : ''} ${breakpoint.revenue !== null ? `Rev YoY ${(breakpoint.revYoY! * 100).toFixed(0)}%` : ''}`.trim(),
              earnings: {
                date: breakpoint.announceDate,
                when: breakpoint.when,
                eps: breakpoint.eps ?? null,
                eps_yoy: breakpoint.epsYoY ?? null,
                rev_yoy: breakpoint.revYoY ?? null,
              },
              period: formatDateRange(day0Idx + window[0], day0Idx + window[1], tradingDates),
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

    const response: AnalysisResponse = {
      ticker,
      as_of: new Date().toISOString().split('T')[0],
      segments,
      notes: [
        'price_TTL=60m',
        'fund_TTL=72h',
        'assume_AMC_if_unknown',
        'timestamps=ET; adjustedClose=true',
      ],
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

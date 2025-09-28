import { NextRequest, NextResponse } from 'next/server';
import { AnalysisRequestSchema, AnalysisResponse } from '@/lib/core/schema';
import { fetchAdjPrices, fetchSpy } from '@/lib/external/polygon';
import { fetchEarnings } from '@/lib/external/finnhub';
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
    const [prices, bench, earnings] = await Promise.all([
      fetchAdjPrices(ticker, from, to),
      fetchSpy(from, to),
      fetchEarnings(ticker, from, to),
    ]);

    if (prices.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'ERR_NO_PRICES',
        message: 'No price data available for the specified period',
      }, { status: 404 });
    }

    if (earnings.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'ERR_NO_EARNINGS',
        message: 'No earnings data available for the specified period',
      }, { status: 404 });
    }

    // 2. 데이터 정렬 및 정렬
    const { prices: alignedPrices, bench: alignedBench } = alignPriceData(prices, bench);
    const tradingDates = getTradingDates(alignedPrices);

    // 3. 변곡점 탐지
    const breakpoints = detectBreakpoints(earnings);

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
    const segments = [];

    for (const breakpoint of breakpoints) {
      try {
        // Day0 계산
        const day0Idx = resolveDay0(breakpoint.announceDate, breakpoint.when, tradingDates);
        
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
            const carResult = computeCAR(alignedPrices, alignedBench, day0Idx, window);
            
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
                `polygon://v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}`,
                `finnhub://calendar/earnings?symbol=${ticker}&from=${from}&to=${to}`,
              ],
            };

            segments.push(segment);
          } catch (error) {
            console.warn(`CAR calculation failed for window ${label}:`, error);
          }
        }
      } catch (error) {
        console.warn(`Day0 resolution failed for ${breakpoint.announceDate}:`, error);
      }
    }

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

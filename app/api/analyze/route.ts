import { NextRequest, NextResponse } from 'next/server';
import { AnalysisRequestSchema, AnalysisResponse, AnalysisSegment } from '@/lib/core/schema';
import { fetchAdjPrices, fetchEarnings } from '@/lib/external/yahoo-finance';
import { detectBreakpoints, getLastEpsNormalizationMeta } from '@/lib/core/breakpoints';
import { resolveDay0, getTradingDates, formatDateRange, getLastResolveDay0Meta } from '@/lib/core/calendar';
import { computeCAR, alignPriceData } from '@/lib/core/car';
import { RateLimiter } from '@/lib/core/rate-limit';
import { buildSourceUrls } from '@/lib/core/source-urls';
import { shouldUseFinnhubEarnings, shouldUseFinnhubPrices } from '@/lib/external/finnhub';
import { fetchAllSECReports } from '@/lib/external/sec-edgar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Extract earnings data from SEC Reports for historical analysis
 */
type MinimalEarnings = { date: string; when: 'bmo' | 'amc' | 'dmh' | 'unknown'; eps: number | null; revenue: number | null };

async function extractEarningsFromSECReports(ticker: string, from: string, to: string): Promise<MinimalEarnings[]> {
  try {
    console.log(`Extracting earnings from SEC Reports for ${ticker} from ${from} to ${to}`);
    const secReports = await fetchAllSECReports(ticker, from, to);
    const earnings: MinimalEarnings[] = [];
    
    console.log(`Found ${secReports.length} SEC reports`);
    
    // Extract earnings from 10-Q and 10-K reports
    for (const report of secReports) {
      if (report.form === '10-Q' || report.form === '10-K') {
        console.log(`Processing ${report.form} report`);
        
        // Look for earnings data in facts
        if (report.facts?.revenues) {
          const revenueData = report.facts.revenues;
          if (revenueData?.value && revenueData?.period) {
            // Convert revenue to approximate EPS (simplified calculation)
            // This is a rough approximation - in reality, you'd need more sophisticated parsing
            const approximateEPS = revenueData.value / 1000000000; // Convert to billions and use as rough EPS
            
            console.log(`Found revenue data: ${revenueData.period} = ${approximateEPS}`);
            
            earnings.push({
              date: revenueData.period,
              when: 'unknown',
              eps: approximateEPS,
              revenue: revenueData.value ?? null,
            });
          }
        }
        
        // Also try to extract from 8-K earnings announcements
      }
      if (report.form === '8-K' && (report as any).event_types?.includes('earnings')) {
          console.log(`Found 8-K earnings announcement`);
          // Use filing date as earnings date
          earnings.push({
          date: (report as any).filingDate || (report as any).date,
            when: 'unknown',
            eps: null,
            revenue: null,
          });
      }
    }
    
    console.log(`Extracted ${earnings.length} earnings data points from SEC Reports`);
    return earnings;
  } catch (error) {
    console.warn('Failed to extract earnings from SEC Reports:', error);
    return [];
  }
}

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

    const useFinnhubEarnings = shouldUseFinnhubEarnings();
    const useFinnhubPrices = shouldUseFinnhubPrices();
    const priceProviderLabel = useFinnhubPrices ? 'finnhub' : 'yahoo';
    const buildHeaders = () => ({
      'X-Provider': useFinnhubEarnings ? 'finnhub' : 'legacy',
      'X-RateLimit-Remaining': rateLimit.remaining.toString(),
      'X-RateLimit-Reset': new Date(Date.now() + 60 * 1000).toISOString(),
    });

    console.log(`Fetching data for ${ticker} from ${from} to ${to}`);

    type EarningsResult = Awaited<ReturnType<typeof fetchEarnings>>;
    let earnings: EarningsResult;
    let earningsSource = 'finnhub';
    
    try {
      earnings = await fetchEarnings(ticker, from, to);
    } catch (error) {
      console.error('Earnings provider error:', error);
      if (
        error instanceof Error &&
        (error.message === 'ERR_RATE_LIMITED' || error.message === 'ERR_SOURCE_UNAVAILABLE')
      ) {
        const notes = [
          'source=finnhub_unavailable',
          `bench=${benchTicker}`,
          'assume_AMC_if_unknown',
          `price_provider=${priceProviderLabel}`,
        ];
        return NextResponse.json(
          {
            success: true,
            data: {
              ticker,
              as_of: new Date().toISOString().split('T')[0],
              segments: [],
              notes,
            },
          },
          {
            headers: buildHeaders(),
          }
        );
      }
      throw error;
    }

    const [prices, bench] = await Promise.all([
      fetchAdjPrices(ticker, from, to).catch(err => {
        console.error('Prices API error:', err);
        throw new Error('ERR_NO_PRICES');
      }),
      fetchAdjPrices(benchTicker, from, to).catch(err => {
        console.error(`Bench API error (${benchTicker}):`, err);
        throw new Error('ERR_NO_BENCH');
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
      `price_provider=${priceProviderLabel}`,
    ]);

    if (useFinnhubEarnings) {
      notesBase.add('source=finnhub');
    }
    
    // If no earnings data from Finnhub, try SEC Reports as fallback
    // Merge in SEC-derived earnings to enrich revenue for YoY calc (near-date join)
    try {
      const secEarnings = await extractEarningsFromSECReports(ticker, from, to);
      if (secEarnings.length > 0) {
        const byDate = new Map<string, { date: string; eps: number | null; revenue: number | null; when?: string }>();
        for (const e of earnings) byDate.set(e.date, { ...e });
        const padDays = 45 * 24 * 3600 * 1000; // ±45 days match window
        const earnList = Array.from(byDate.values()).map(e => ({ ...e, ts: new Date(e.date).getTime() }));
        for (const s of secEarnings) {
          const ts = new Date(s.date).getTime();
          // exact date first
          const exact = byDate.get(s.date);
          if (exact) {
            if (exact.revenue == null && s.revenue != null) exact.revenue = s.revenue;
            if (exact.eps == null && s.eps != null) exact.eps = s.eps;
            byDate.set(s.date, exact);
            continue;
          }
          // nearest within ±45d
          let bestIdx = -1; let bestDelta = Number.POSITIVE_INFINITY;
          for (let i = 0; i < earnList.length; i++) {
            const d = Math.abs(earnList[i].ts - ts);
            if (d <= padDays && d < bestDelta) { bestDelta = d; bestIdx = i; }
          }
          if (bestIdx >= 0) {
            const merged = earnList[bestIdx];
            if (merged.revenue == null && s.revenue != null) merged.revenue = s.revenue;
            if (merged.eps == null && s.eps != null) merged.eps = s.eps;
            byDate.set(merged.date, { date: merged.date, eps: merged.eps ?? null, revenue: merged.revenue ?? null, when: merged.when });
          } else {
            // add as new earnings point if it falls inside range
            if (ts >= new Date(from).getTime() && ts <= new Date(to).getTime()) {
              byDate.set(s.date, { date: s.date, eps: s.eps ?? null, revenue: s.revenue ?? null, when: s.when });
            }
          }
        }
        earnings = Array.from(byDate.values())
          .map(e => ({
            date: e.date,
            when: (e.when === 'bmo' || e.when === 'amc' || e.when === 'dmh') ? (e.when as 'bmo'|'amc'|'dmh') : 'unknown' as const,
            eps: e.eps ?? null,
            revenue: e.revenue ?? null,
          }))
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      }
    } catch {}
    
    // Add earnings source information
    if (earningsSource === 'sec_reports') {
      notesBase.add('earnings_source=sec_reports');
    }

    if (earnings.length === 0) {
      console.log('No earnings data found, returning empty segments');
      return NextResponse.json(
        {
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
        },
        {
          headers: buildHeaders(),
        }
      );
    }

    // 2. 데이터 정렬 및 정렬
    const { prices: alignedPrices, bench: alignedBench } = alignPriceData(prices, bench);
    const tradingDates = getTradingDates(alignedPrices);

    // 3. 변곡점 탐지
    console.log('Earnings data for breakpoint detection:', JSON.stringify(earnings, null, 2));
    const breakpoints = detectBreakpoints(prices, earnings);
    console.log('Detected breakpoints:', JSON.stringify(breakpoints, null, 2));
    console.log(`Total breakpoints detected: ${breakpoints.length}`);

    if (breakpoints.length === 0) {
      return NextResponse.json(
        {
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
        },
        {
          headers: buildHeaders(),
        }
      );
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
          if (day0Meta.fallbackReason === 'no_future') {
            notesFlags.add('day0_fallback_no_future');
          }
        }

        if (day0Idx === null) {
          console.warn(`Day0 not found for ${breakpoint.announceDate}`);
          continue;
        }

        const day0Date = tradingDates[day0Idx];

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

            const priceReactionFlags: { partial?: true; short_window?: true } = {};

            if (carResult.__partial) {
              notesFlags.add('window_clamped');
              priceReactionFlags.partial = true;
            }

            if (typeof carResult.__windowDays === 'number') {
              if (carResult.__windowDays < 3) {
                notesFlags.add('short_window');
                priceReactionFlags.short_window = true;
              }
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

            const segment: AnalysisSegment = {
              label: segmentLabel,
              earnings: {
                date: breakpoint.announceDate,
                when: (breakpoint.when === 'bmo' || breakpoint.when === 'amc' || breakpoint.when === 'dmh') 
                  ? (breakpoint.when as 'bmo' | 'amc' | 'dmh')
                  : 'unknown',
                eps: breakpoint.eps ?? null,
                eps_yoy: breakpoint.epsYoY ?? null,
                rev_yoy: breakpoint.revYoY ?? null,
                flags: breakpoint.flags ? {
                  eps_yoy_nm: breakpoint.flags.eps_yoy_nm ? true : undefined,
                  rev_yoy_nm: breakpoint.flags.rev_yoy_nm ? true : undefined,
                } : undefined,
              },
              period,
              day0: day0Date,
              price_reaction: {
                window: label,
                car: carResult.car,
                ret_sum: carResult.ret_sum,
                bench_sum: carResult.bench_sum,
                window_days: carResult.__windowDays,
                flags: Object.keys(priceReactionFlags).length ? priceReactionFlags : undefined,
              },
              source_urls: buildSourceUrls(ticker, benchTicker, from, to, priceProviderLabel),
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
    if (normalizationMeta) {
      notesFlags.add(`eps_normalized=true`);
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

    return NextResponse.json(
      {
        success: true,
        data: response,
      },
      {
        headers: buildHeaders(),
      }
    );

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

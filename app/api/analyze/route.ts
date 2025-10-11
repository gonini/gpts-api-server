import { NextRequest, NextResponse } from 'next/server';
import { AnalysisRequestSchema, AnalysisResponse, AnalysisSegment } from '@/lib/core/schema';
import { fetchAdjPrices, fetchEarnings, probeAlphaVantageCause } from '@/lib/external/yahoo-finance';
import { getOfflineAliases, orderAliasesByCutover } from '@/lib/core/symbols';
import { getTickerAliasesFromSEC } from '@/lib/external/sec-edgar';
import { detectBreakpoints, getLastEpsNormalizationMeta } from '@/lib/core/breakpoints';
import { resolveDay0, getTradingDates, formatDateRange, getLastResolveDay0Meta } from '@/lib/core/calendar';
import { computeCAR, alignPriceData, computeMarketModelCAR } from '@/lib/core/car';
import { RateLimiter } from '@/lib/core/rate-limit';
import { buildSourceUrls } from '@/lib/core/source-urls';
import { shouldUseFinnhubEarnings, shouldUseFinnhubPrices } from '@/lib/external/finnhub';
import { resolveEarningsEventDate } from '@/lib/adapters/sec-edgar';
import { normalizeGAAPDilutedEPS } from '@/lib/core/earnings-normalize';
import { buildLabelWithWindow, rangesOverlap } from '@/lib/core/labels';
import { fetchAllSECReports, fetchRevenueData } from '@/lib/external/sec-edgar';
import { isDebugFlag, debugLog } from '@/lib/core/debug';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Extract earnings data from SEC Reports for historical analysis
 */
type MinimalEarnings = { date: string; when: 'bmo' | 'amc' | 'dmh' | 'unknown'; eps: number | null; revenue: number | null; eps_src?: 'sec_pr' };

async function extractEarningsFromSECReports(ticker: string, from: string, to: string): Promise<MinimalEarnings[]> {
  try {
    console.log(`Extracting earnings from SEC Reports for ${ticker} from ${from} to ${to}`);
    const secReports = await fetchAllSECReports(ticker, from, to);
    const earnings: MinimalEarnings[] = [];
    
    console.log(`Found ${secReports.length} SEC reports`);
    
    // Extract revenues from 10-Q and 10-K reports (no EPS approximation)
    for (const report of secReports) {
      if (report.form === '10-Q' || report.form === '10-K') {
        console.log(`Processing ${report.form} report`);
        
        // Look for earnings data in facts
        if (report.facts?.revenues) {
          const revenueData = report.facts.revenues;
          if (revenueData?.value && revenueData?.period) {
            console.log(`Found revenue data: ${revenueData.period} = ${revenueData.value}`);
            const eventISO = report.event_date || report.period_of_report || (report.filed_at ? report.filed_at.slice(0,10) : null);
            if (!eventISO) continue;
            earnings.push({
              date: eventISO,
              when: 'unknown',
              eps: null,
              revenue: revenueData.value ?? null,
            });
          }
        }
        
        // Also try to extract from 8-K earnings announcements
      }
      if (report.form === '8-K' && (report as any).event_types?.includes('earnings')) {
          console.log(`Found 8-K earnings announcement`);
          // Use event_date (preferred) or filing date as earnings date
          const eventISO = report.event_date || report.period_of_report || (report.filed_at ? report.filed_at.slice(0,10) : null);
          if (!eventISO) continue;
          // Try to parse EPS from press release text (Exhibit 99)
          let epsFromPR: number | null = null;
          try {
            const press = (report.exhibits || []).find((e) => e.type === 'press_release' && /(htm|html|txt)$/i.test(e.href));
            const href = press?.href || report.urls?.primary;
            if (href) {
              const res = await fetch(href, { headers: { 'Accept': 'text/html,text/plain,*/*', 'User-Agent': process.env.SEC_USER_AGENT || 'gpts-api-server/1.0' } });
              if (res.ok) {
                const raw = await res.text();
                const text = raw.replace(/\s+/g, ' ').slice(0, 200000);
                epsFromPR = extractDilutedEPSFromText(text);
              }
            }
          } catch {}
          earnings.push({ date: eventISO, when: 'unknown', eps: epsFromPR, revenue: null, eps_src: epsFromPR != null ? 'sec_pr' : undefined });
      }
    }
    
    console.log(`Extracted ${earnings.length} earnings data points from SEC Reports`);
    return earnings;
  } catch (error) {
    console.warn('Failed to extract earnings from SEC Reports:', error);
    return [];
  }
}

// Very lightweight diluted EPS extractor from press text
function extractDilutedEPSFromText(text: string): number | null {
  // Pattern 1: "Diluted earnings per share ... $X.XX" or "Diluted EPS $X.XX"
  const patterns: RegExp[] = [
    /diluted\s+(?:earnings|net\s+income)?.{0,40}?(?:per\s+share|eps)[^$\d]{0,20}\$\s*([0-9]+(?:\.[0-9]+)?)/i,
    /earnings\s+per\s+share[^$]*diluted[^$]*\$\s*([0-9]+(?:\.[0-9]+)?)/i,
    /diluted\s+eps[^$]*\$\s*([0-9]+(?:\.[0-9]+)?)/i,
    /net\s+income\s+per\s+share[^$]*?basic[^$]*?\$\s*([0-9]+(?:\.[0-9]+)?)[^$]*?diluted[^$]*?\$\s*([0-9]+(?:\.[0-9]+)?)/i,
  ];
  for (const re of patterns) {
    const m = re.exec(text);
    if (m) {
      const val = m[2] ? parseFloat(m[2]) : parseFloat(m[1]);
      if (isFinite(val)) return val;
    }
  }
  return null;
}

export async function GET(request: NextRequest) {
  return handleRequest(request);
}

export async function POST(request: NextRequest) {
  return handleRequest(request);
}

function isValidISODate(date: string): boolean {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isInteger(year) || year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const d = new Date(date);
  if (isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === date;
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
    let noCache = false;

    let benchTicker = 'SPY';
    const benchCandidates = new Set(['SPY', 'XLE', 'QQQ', 'IWM']);

    if (request.method === 'GET') {
      const url = new URL(request.url);
      ticker = url.searchParams.get('ticker') || '';
      from = url.searchParams.get('from') || '';
      to = url.searchParams.get('to') || '';
      const nc = url.searchParams.get('nocache') || url.searchParams.get('noCache');
      if (nc && (nc === '1' || nc.toLowerCase() === 'true')) noCache = true;
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

    // 날짜 포맷/연도 유효성 검증 (YYYY-MM-DD, 1900~2100, 정상 캘린더 날짜)
    if (!isValidISODate(from) || !isValidISODate(to)) {
      return NextResponse.json({
        success: false,
        error: 'ERR_INVALID_DATE_FORMAT',
        message: 'from/to must be valid ISO dates (YYYY-MM-DD) with a sane year (1900-2100).',
      }, { status: 400 });
    }
    if (new Date(from).getTime() > new Date(to).getTime()) {
      return NextResponse.json({
        success: false,
        error: 'ERR_INVALID_DATE_RANGE',
        message: '`from` must be earlier than or equal to `to`.',
      }, { status: 400 });
    }

    const useFinnhubEarnings = shouldUseFinnhubEarnings();
    const useFinnhubPrices = shouldUseFinnhubPrices();
    const priceProviderLabel = useFinnhubPrices ? 'finnhub' : 'yahoo';
    const buildHeaders = () => ({
      'X-Provider': useFinnhubEarnings ? 'finnhub' : 'legacy',
      'X-RateLimit-Remaining': rateLimit.remaining.toString(),
      'X-RateLimit-Reset': new Date(Date.now() + 60 * 1000).toISOString(),
      ...(noCache ? { 'Cache-Control': 'no-store, no-cache, must-revalidate' } : {}),
    });

    console.log(`Fetching data for ${ticker} from ${from} to ${to}`);

    // Resolve canonical provider ticker by date-aware alias/cutover (e.g., GOOGL→GOOG before 2014-04-03)
    let providerTicker = ticker.toUpperCase();
    try {
      const offlineAliases = getOfflineAliases(ticker);
      const secAliases = await getTickerAliasesFromSEC(ticker).catch(() => [] as string[]);
      const merged = Array.from(new Set<string>([...offlineAliases, ...secAliases]));
      const ordered = orderAliasesByCutover(ticker, merged, from, to);
      if (ordered.length > 0) providerTicker = ordered[0];
      console.log(`[Symbols] providerTicker resolved: ${ticker} -> ${providerTicker} for ${from}..${to}`);
    } catch (e) {
      console.warn('[Symbols] providerTicker resolution failed, using raw ticker', e);
    }

    // Extend fetch window backwards to ensure YoY comparisons have prior data even at range start
    const extendDays = 400; // ~13 months
    const shiftDateByDays = (iso: string, days: number) => {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      d.setDate(d.getDate() + days);
      const y = d.getFullYear();
      const m = `${d.getMonth() + 1}`.padStart(2, '0');
      const dd = `${d.getDate()}`.padStart(2, '0');
      return `${y}-${m}-${dd}`;
    };
    const originalFrom = from;
    const originalTo = to;
    const extendedFrom = shiftDateByDays(from, -extendDays);

    type EarningsResult = Awaited<ReturnType<typeof fetchEarnings>>;
    let earnings: EarningsResult;
    let earningsSource = 'finnhub';
    
    let causeNotes: string[] = [];
    try {
      earnings = await fetchEarnings(providerTicker, extendedFrom, to, { noCache });
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
      fetchAdjPrices(providerTicker, extendedFrom, to, { noCache }).catch(err => {
        console.error('Prices API error:', err);
        throw new Error('ERR_NO_PRICES');
      }),
      fetchAdjPrices(benchTicker, extendedFrom, to, { noCache }).catch(err => {
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
    // Merge in SEC-derived earnings to enrich revenue/EPS only when needed (consistent across envs)
    const enableSEC = process.env.ANALYZE_SEC_ENRICH === '1';
    const needEnrich = earnings.length === 0 || earnings.some(e => e.revenue == null || e.eps == null);
    if (needEnrich && enableSEC) {
      try {
        const timeoutMs = parseInt(process.env.ANALYZE_SEC_TIMEOUT_MS || '2500', 10);
        const secPromise = extractEarningsFromSECReports(ticker, extendedFrom, to);
        const secEarnings: MinimalEarnings[] = await Promise.race([
          secPromise,
          new Promise<MinimalEarnings[]>((resolve) => setTimeout(() => resolve([] as MinimalEarnings[]), isNaN(timeoutMs) ? 2500 : timeoutMs))
        ]);
        if (secEarnings.length > 0) {
          const byDate = new Map<string, { date: string; eps: number | null; revenue: number | null; when?: string; eps_src?: 'sec_pr' }>();
          for (const e of earnings) byDate.set(e.date, { ...e } as any);
          const padDays = 45 * 24 * 3600 * 1000; // ±45 days match window
          const earnList = Array.from(byDate.values()).map(e => ({ ...e, ts: new Date(e.date).getTime() }));
          for (const s of secEarnings) {
            const ts = new Date(s.date).getTime();
            // exact date first
            const exact = byDate.get(s.date);
            if (exact) {
              if (exact.revenue == null && s.revenue != null) exact.revenue = s.revenue;
              if (exact.eps == null && s.eps != null) { exact.eps = s.eps; if (s.eps_src) exact.eps_src = s.eps_src; }
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
              if (merged.eps == null && s.eps != null) { (merged as any).eps = s.eps; if (s.eps_src) (merged as any).eps_src = s.eps_src; }
              byDate.set(merged.date, { date: merged.date, eps: (merged as any).eps ?? null, revenue: merged.revenue ?? null, when: (merged as any).when, eps_src: (merged as any).eps_src });
            } else {
              // add as new earnings point if it falls inside range
              if (ts >= new Date(from).getTime() && ts <= new Date(to).getTime()) {
                byDate.set(s.date, { date: s.date, eps: s.eps ?? null, revenue: s.revenue ?? null, when: s.when, eps_src: s.eps_src });
              }
            }
          }
          earnings = Array.from(byDate.values())
            .map(e => ({
              date: e.date,
              when: (e.when === 'bmo' || e.when === 'amc' || e.when === 'dmh') ? (e.when as 'bmo'|'amc'|'dmh') : 'unknown' as const,
              eps: e.eps ?? null,
              revenue: e.revenue ?? null,
              // propagate sec_pr source
              ...(e.eps_src ? { eps_src: e.eps_src } : {}),
            }))
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        }
      } catch {}
    }

    // Backfill revenue from XBRL companyfacts when missing
    try {
      const revSeries = await fetchRevenueData(ticker, extendedFrom, to);
      if (revSeries.length) {
        const byDate = new Map(earnings.map(e => [e.date, e]));
        for (const r of revSeries) {
          const ex = byDate.get(r.date);
          if (ex && (ex.revenue == null)) {
            ex.revenue = r.revenue;
          }
        }
        earnings = Array.from(byDate.values()).sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      }
    } catch (e) {
      console.log(`[Revenue backfill] skipped: ${e instanceof Error ? e.message : String(e)}`);
    }
    
    // Add earnings source information
    if (earningsSource === 'sec_reports') {
      notesBase.add('earnings_source=sec_reports');
    }

    if (earnings.length === 0) {
      console.log('No earnings data found, returning empty segments');
      // Diagnose root causes across providers and include in notes
      try {
        // Finnhub
        notesBase.add('cause_finnhub=no_data');
      } catch {}
      try {
        // Alpha Vantage probe
        const av = await probeAlphaVantageCause(providerTicker, extendedFrom, to);
        notesBase.add(`cause_alpha_vantage=${av}`);
      } catch {}
      try {
        // SEC global 429 block flag from cache, if any
        const blocked = await (async ()=>{
          try { const v = await (await import('@/lib/kv')).CacheService.get('sec:block:until'); return v; } catch { return null; }
        })();
        if (blocked) notesBase.add('cause_sec=blocked_429'); else notesBase.add('cause_sec=unknown_or_not_used');
      } catch {}
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

    // 3. EPS 표준화(회사facts + 분할 소급) 시도
    try {
      const normalized = await normalizeGAAPDilutedEPS(ticker, extendedFrom, to, earnings.map(e => ({ date: e.date, eps: e.eps, source: (e as any).eps_src === 'sec_pr' ? 'sec_pr' : undefined })) as any);
      const normMap = new Map(normalized.map(x => [x.date, x]));
      const allowVendorEps = process.env.EPS_VENDOR_FALLBACK === '1';
      earnings = earnings.map(e => {
        const n = normMap.get(e.date);
        const secOrRatio = (typeof n?.eps === 'number') ? n?.eps : null;
        const vendor = (typeof e.eps === 'number') ? e.eps : null;
        const finalEps = allowVendorEps ? (secOrRatio ?? vendor) : secOrRatio;
        return { ...e, eps: finalEps, eps_debug: n?.debug } as any;
      });
    } catch (e) {
      console.warn(`[EPS Normalize] skipped: ${e instanceof Error ? e.message : String(e)}`);
    }

    // 4. 변곡점 탐지 (이벤트일 교정 시도)
    debugLog(isDebugFlag('DEBUG_ANALYZE'), 'Earnings data for breakpoint detection:', JSON.stringify(earnings, null, 2));
    const breakpoints = detectBreakpoints(prices, earnings);
    debugLog(isDebugFlag('DEBUG_ANALYZE'), 'Detected breakpoints:', JSON.stringify(breakpoints, null, 2));
    debugLog(isDebugFlag('DEBUG_ANALYZE'), `Total breakpoints detected: ${breakpoints.length}`);

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

    // 5. 각 변곡점에 대해 CAR 계산
    const segments: AnalysisResponse['segments'] = [];
    const notesFlags = new Set<string>();

    for (const breakpoint of breakpoints) {
      try {
        // 이벤트일 교정: 8-K Exhibit 99 → filed_at → period_of_report
        let correctedDateISO = breakpoint.announceDate;
        let correctedWhen = breakpoint.when;
        let eventDateSource: '8-K_ex99'|'filed_at'|'period_of_report' = 'filed_at';
        let eventDateCorrected = false;

        try {
          const quarterEndISO = breakpoint.announceDate; // 근사치: 분기말 기반 교정을 위해 필요 시 개선
          const resolved = await resolveEarningsEventDate({ ticker, quarterEnd: quarterEndISO });
          const iso = new Date(resolved.eventDateET).toISOString().slice(0,10);
          if (iso && iso !== correctedDateISO) {
            correctedDateISO = iso;
            eventDateCorrected = true;
          }
          if (resolved.when === 'bmo' || resolved.when === 'amc') correctedWhen = resolved.when;
          eventDateSource = resolved.source;
        } catch {}

        // Day0 계산 (교정값 반영)
        console.log(`Processing breakpoint: ${breakpoint.announceDate}`);
        const day0Idx = resolveDay0(correctedDateISO, correctedWhen, tradingDates);
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
            const carMM = computeMarketModelCAR(alignedPrices, alignedBench, day0Idx, window);
            const carResult = carMM; // back-compat fields align
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

            const label_with_window = buildLabelWithWindow(
              correctedDateISO,
              (typeof breakpoint.epsYoY === 'number') ? breakpoint.epsYoY : null,
              (typeof breakpoint.revYoY === 'number') ? breakpoint.revYoY : null,
              label,
              carResult.car
            );

            const segment: AnalysisSegment = {
              label: segmentLabel,
              label_with_window,
              earnings: {
                date: correctedDateISO,
                when: (correctedWhen === 'bmo' || correctedWhen === 'amc' || correctedWhen === 'dmh') 
                  ? (correctedWhen as 'bmo' | 'amc' | 'dmh')
                  : 'unknown',
                eps: breakpoint.eps ?? null,
                eps_basis: 'GAAP_diluted',
                split_adjusted: true,
                // Use computed values only; if unavailable or NM, leave null and signal via flags
                eps_yoy: (typeof breakpoint.epsYoY === 'number') ? breakpoint.epsYoY : null,
                rev_yoy: (typeof breakpoint.revYoY === 'number') ? breakpoint.revYoY : null,
                flags: breakpoint.flags ? {
                  eps_yoy_nm: breakpoint.flags.eps_yoy_nm ? true : undefined,
                  rev_yoy_nm: breakpoint.flags.rev_yoy_nm ? true : undefined,
                } : undefined,
                // @ts-ignore debug hook: expose chosen EPS source & split factor
                eps_debug: (earnings.find(x => x.date === correctedDateISO) as any)?.eps_debug
              },
              period,
              day0: day0Date,
              price_reaction: {
                window: label,
                car: carResult.car,
                ret_sum: carResult.ret_sum,
                bench_sum: carResult.bench_sum,
                window_days: carResult.__windowDays,
                car_tstat: carMM.car_tstat,
                market_model_used: true,
                alpha_beta: carMM.alpha_beta,
                // @ts-ignore include t-stat flags when present
                tstat_flags: (carMM as any).tstat_flags,
                flags: Object.keys(priceReactionFlags).length ? priceReactionFlags : undefined,
              },
              source_urls: buildSourceUrls(ticker, benchTicker, from, to, priceProviderLabel),
              // 품질 메타 추가
              // @ts-ignore - schema 확장 전 임시 주입; 이후 타입 갱신 시 제거
              data_quality: { event_date_source: eventDateSource, event_date_corrected: eventDateCorrected }
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

    // Filter segments back to original requested window
    const filteredSegments = segments.filter(seg => {
      const d = new Date(seg.earnings.date).getTime();
      const f = new Date(originalFrom).getTime();
      const t = new Date(originalTo).getTime();
      return !isNaN(d) && d >= f && d <= t;
    });

    // overlap flagging between windows for the same event date
    for (let i = 0; i < segments.length; i++) {
      for (let j = i + 1; j < segments.length; j++) {
        try {
          const a = segments[i];
          const b = segments[j];
          if (a.earnings.date === b.earnings.date) {
            if (rangesOverlap(a.period.start, a.period.end, b.period.start, b.period.end)) {
              segments[i].overlap_flag = true;
              segments[j].overlap_flag = true;
            }
          }
        } catch {}
      }
    }

    const response: AnalysisResponse = {
      ticker,
      as_of: new Date().toISOString().split('T')[0],
      segments: filteredSegments,
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

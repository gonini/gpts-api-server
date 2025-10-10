import { NextRequest, NextResponse } from 'next/server';
import { extractHourFlag } from '@/lib/external/sec-edgar';
import { snapToTradingDayET } from '@/lib/core/tradingCalendar';
import { computeMarketModelCAR } from '@/lib/core/car';
import { applySplitAdjustForValue, epsFromNetIncomeAndDilutedShares } from '@/lib/core/earnings-normalize';

type P = { date: string; adjClose: number };

function genSeries(n: number): { prices: P[]; bench: P[] } {
  const dates: string[] = [];
  const start = new Date(Date.UTC(2023, 0, 1)).getTime();
  for (let i = 0; i < n; i++) {
    const d = new Date(start + i * 86400000);
    dates.push(d.toISOString().slice(0,10));
  }
  const bench: P[] = [];
  const prices: P[] = [];
  let pb = 100, ps = 100;
  for (let i = 0; i < n; i++) {
    const rm = (Math.random() - 0.5) * 0.02; // ~±1%
    const noise = (Math.random() - 0.5) * 0.01; // ~±0.5%
    const ri = 0.0002 + 1.2 * rm + noise;
    pb = pb * (1 + rm);
    ps = ps * (1 + ri);
    bench.push({ date: dates[i], adjClose: pb });
    prices.push({ date: dates[i], adjClose: ps });
  }
  return { prices, bench };
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  try {
    if (process.env.ENABLE_SELFTEST !== '1') {
      return NextResponse.json({ success: false, error: 'Selftest disabled' }, { status: 404 });
    }
    // 1) Hour parse tests
    const texts = [
      'The company will release results before the market opens.',
      'Earnings to be announced after market close.',
      'Conference call at 10:30 a.m. ET.',
      'Timing not specified'
    ];
    const hourFlags = texts.map(t => extractHourFlag(t));

    // 2) Trading day snap tests (ET weekend → Monday)
    const sat = new Date(Date.UTC(2024, 5, 1)); // 2024-06-01 Saturday
    const sun = new Date(Date.UTC(2024, 5, 2)); // 2024-06-02 Sunday
    const mon = new Date(Date.UTC(2024, 5, 3)); // 2024-06-03 Monday
    const satSnap = snapToTradingDayET(sat, 'same').toISOString().slice(0,10);
    const sunSnap = snapToTradingDayET(sun, 'same').toISOString().slice(0,10);
    const monSnap = snapToTradingDayET(mon, 'same').toISOString().slice(0,10);

    // 3) Market model CAR synthetic test
    // Build 300 days of synthetic prices where ri = 0.0002 + 1.2 * rm + noise
    const { prices, bench } = genSeries(300);
    const day0Idx = 260;
    const mm = computeMarketModelCAR(prices, bench, day0Idx, [-1, 5]);

    // 4) Split adjust tests
    const splits = [
      { date: '2022-07-15', ratio: 20 },
      { date: '2014-04-03', ratio: 2 }
    ];
    const pre2010 = applySplitAdjustForValue('2009-12-31', 10, splits); // expected 10/(20*2) = 0.25
    const after2016 = applySplitAdjustForValue('2018-01-01', 5, splits); // affected by 2022 split only → 5/20 = 0.25

    // 5) EPS fallback by ratio
    const eps1 = epsFromNetIncomeAndDilutedShares(1000000000, 500000000); // $1,000m / 500m = $2.00
    const eps2 = epsFromNetIncomeAndDilutedShares(250000000, 100000000); // $250m / 100m = $2.50

    return NextResponse.json({
      success: true,
      hour_parse: hourFlags, // ['bmo','amc','bmo','dmt'] expected
      trading_snap: { sat: satSnap, sun: sunSnap, mon: monSnap },
      market_model: {
        car: mm.car,
        car_tstat: mm.car_tstat,
        alpha_beta: mm.alpha_beta,
        window_days: mm.__windowDays
      },
      split_adjust: { pre2010, after2016 },
      eps_ratio: { eps1, eps2 }
    });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}



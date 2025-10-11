// scripts/diagnose-googl-2008.ts
// Usage: ts-node scripts/diagnose-googl-2008.ts
// Generates /tmp/diagnostics/googl-2008.json with D0/EPS/t-stat diagnostics

import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

import { fetchEPSData } from '../lib/external/sec-edgar';
import { normalizeGAAPDilutedEPS } from '../lib/core/earnings-normalize';
import { computeMarketModelCAR, alignPriceData } from '../lib/core/car';
import { fetchAdjPrices, fetchEarnings } from '../lib/external/yahoo-finance';
import { resolveEarningsEventDate } from '../lib/adapters/sec-edgar';

async function main() {
  const ticker = 'GOOGL';
  const from = '2008-01-01';
  const to = '2009-12-31';
  console.log(`Diagnosing ${ticker} ${from}..${to}`);

  const extendedFrom = '2006-11-27';
  const [earn, prices, bench] = await Promise.all([
    fetchEarnings(ticker, extendedFrom, to, { noCache: true }),
    fetchAdjPrices(ticker, extendedFrom, to, { noCache: true }),
    fetchAdjPrices('SPY', extendedFrom, to, { noCache: true }),
  ]);

  const epsGaap = await fetchEPSData(ticker, extendedFrom, to);
  const norm = await normalizeGAAPDilutedEPS(ticker, extendedFrom, to, earn.map(e => ({ date: e.date, eps: e.eps })));
  const normMap = new Map(norm.map(x => [x.date, x.eps]));

  const { prices: ap, bench: ab } = alignPriceData(prices, bench);

  const rows: any[] = [];
  for (const e of earn) {
    if (new Date(e.date) < new Date(from) || new Date(e.date) > new Date(to)) continue;
    const resolved = await resolveEarningsEventDate({ ticker, quarterEnd: e.date });
    const d0ISO = new Date(resolved.eventDateET).toISOString().slice(0,10);
    const idx = ap.findIndex(p => p.date >= d0ISO);
    let tstat: number | undefined = undefined;
    if (idx >= 1) {
      const mm = computeMarketModelCAR(ap, ab, idx, [-1, 5]);
      tstat = mm.car_tstat;
    }
    const epsNow = normMap.get(e.date) ?? null;
    rows.push({
      date: e.date,
      d0: d0ISO,
      source: resolved.source,
      when: resolved.when,
      eps_input: e.eps,
      eps_norm: epsNow,
      car_tstat_m1_5: tstat,
    });
  }

  const outDir = '/tmp/diagnostics';
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, 'googl-2008.json');
  writeFileSync(outPath, JSON.stringify({
    ticker,
    from,
    to,
    counts: {
      segments: rows.length,
    },
    rows,
  }, null, 2));
  console.log(`Wrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});



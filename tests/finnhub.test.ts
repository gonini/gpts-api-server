require('tsconfig-paths/register');
const assert = require('node:assert/strict');
const path = require('node:path');

async function testDay0Shift() {
  const { resolveDay0 } = require('../lib/core/calendar');
  const tradingDates = ['2023-05-02', '2023-05-03', '2023-05-04', '2023-05-05'];
  const idx = resolveDay0('2023-05-03', 'amc', tradingDates);
  assert.equal(idx, 2, 'AMC events should shift to the next trading day');
}

async function testFinnhubRetry() {
  const modulePath = path.resolve(__dirname, '../lib/external/finnhub');
  const originalKey = process.env.FINNHUB_API_KEY;
  const originalBase = process.env.FINNHUB_BACKOFF_BASE_MS;
  const originalRetries = process.env.FINNHUB_BACKOFF_MAX_RETRIES;
  const originalRandom = Math.random;
  const originalFetch = global.fetch;

  process.env.FINNHUB_API_KEY = 'test-key';
  process.env.FINNHUB_BACKOFF_BASE_MS = '1';
  process.env.FINNHUB_BACKOFF_MAX_RETRIES = '3';
  Math.random = () => 0;

  if (require.cache[modulePath]) {
    delete require.cache[modulePath];
  }

  let attempts = 0;
  global.fetch = async () => {
    attempts += 1;
    if (attempts < 3) {
      return new Response('rate limit', { status: 429 });
    }

    return new Response(
      JSON.stringify({
        earningsCalendar: [
          {
            symbol: 'TEST',
            date: '2023-05-03',
            epsActual: 1.23,
            revenueActual: 456,
            time: 'amc',
          },
        ],
      }),
      { status: 200 }
    );
  };

  try {
    const { fetchFinnhubEarnings } = require('../lib/external/finnhub');
    const rows = await fetchFinnhubEarnings(`TEST${Date.now()}`, '2023-01-01', '2023-12-31');
    assert.equal(attempts, 3, 'Should retry twice before succeeding on third attempt');
    assert.equal(rows.length, 1, 'Should parse a single earnings row');
    assert.equal(rows[0].when, 'amc', 'Should preserve Finnhub time mapping');
  } finally {
    Math.random = originalRandom;
    global.fetch = originalFetch;

    if (originalKey === undefined) delete process.env.FINNHUB_API_KEY;
    else process.env.FINNHUB_API_KEY = originalKey;
    if (originalBase === undefined) delete process.env.FINNHUB_BACKOFF_BASE_MS;
    else process.env.FINNHUB_BACKOFF_BASE_MS = originalBase;
    if (originalRetries === undefined) delete process.env.FINNHUB_BACKOFF_MAX_RETRIES;
    else process.env.FINNHUB_BACKOFF_MAX_RETRIES = originalRetries;

    if (require.cache[modulePath]) {
      delete require.cache[modulePath];
    }
  }
}

async function testSourceUrls() {
  const { buildSourceUrls } = require('../lib/core/source-urls');
  const urls = buildSourceUrls('AAPL', 'SPY', '2023-01-01', '2023-12-31', 'finnhub');
  assert(urls.some((url: string) => url.startsWith('finnhub://')), 'Source URLs must include Finnhub prefix');
  assert(urls.includes('prices://AAPL?provider=finnhub'), 'Ticker price source should reflect provider');
}

(async () => {
  await testDay0Shift();
  await testFinnhubRetry();
  await testSourceUrls();
  console.log('✅ Finnhub integration tests passed');
})().catch(error => {
  console.error('❌ Finnhub integration test failed', error);
  process.exitCode = 1;
});

// lib/adapters/sec-edgar.ts
// 8-K 기반 이벤트일(D0) 해석 어댑터: index.json + Exhibit 99(Press Release)

import { fetchAllSECReports, NormalizedSECFiling } from '@/lib/external/sec-edgar';

type WhenFlag = 'bmo' | 'amc' | 'unknown';
type EventDateSource = '8-K_ex99' | 'filed_at' | 'period_of_report';

export async function resolveEarningsEventDate(opts: {
  ticker: string;
  quarterEnd: string; // YYYY-MM-DD
}): Promise<{ eventDateET: Date; when: WhenFlag; source: EventDateSource }> {
  const ticker = String(opts.ticker || '').toUpperCase();
  const qeISO = opts.quarterEnd;
  const qe = new Date(qeISO);
  if (!ticker || !qeISO || isNaN(qe.getTime())) {
    throw new Error('Invalid arguments for resolveEarningsEventDate');
  }

  // 검색 윈도우: 분기말 ±N일 (후보군 확보)
  // 과거 연도에서 8-K/Ex99 근거가 누락되는 케이스를 줄이기 위해 기본 45일로 확대
  const DAY = 86400000;
  const spanDays = 45;
  const fromISO = toISODate(new Date(qe.getTime() - spanDays * DAY))!;
  const toISO = toISODate(new Date(qe.getTime() + spanDays * DAY))!;

  // 정규화된 보고서 조회(내부적으로 8-K index.json/press release 스캔 포함)
  const filings = await fetchAllSECReports(ticker, fromISO, toISO);

  // 1순위: 8-K + Item 2.02(or event_types includes 'earnings')
  const k8Earnings = filings
    .filter(f => f.form.startsWith('8-K'))
    .filter(f => (f.items || []).includes('2.02') || (f.event_types || []).includes('earnings'));

  // 2순위: 모든 8-K
  const k8All = filings.filter(f => f.form.startsWith('8-K'));

  const preferEx99Event = process.env.USE_EX99_EVENT_DATE === '0' ? false : true;

  const pick = (cands: NormalizedSECFiling[]): NormalizedSECFiling | null => {
    if (!cands.length) return null;
    // 분기말과 가장 가까운 event_date(선호), 없으면 filed_at (USE_EX99_EVENT_DATE=1일 때 period_of_report는 마지막 우선)
    const qeTime = qe.getTime();
    const scored = [...cands]
      .map(f => {
        const press = (f.exhibits || []).some((e) => e.type === 'press_release' && /(htm|html|txt)$/i.test(e.href));
        const primaryISO = f.event_date || null;
        const filedISO = dateOnly(f.filed_at);
        const porISO = f.period_of_report || null;
        // 후보 선택: event_date 우선, 그 다음 filed_at, 마지막으로 period_of_report (환경변수에 따라 POR는 가급적 배제)
        const dISO = preferEx99Event
          ? (primaryISO || filedISO || (null))
          : (primaryISO || porISO || filedISO);
        const dateISO = dISO || porISO || filedISO;
        return { f, dateISO, press };
      })
      .filter(x => !!x.dateISO)
      .map(x => ({
        ...x,
        dist: Math.abs(new Date(x.dateISO!).getTime() - qeTime),
        bonus: (preferEx99Event && x.press && x.f.event_date) ? -1 : 0, // press+event_date 가점
      }))
      .sort((a, b) => (a.dist + a.bonus) - (b.dist + b.bonus));
    const best = scored[0];
    return best ? best.f : null;
  };

  const chosen = pick(k8Earnings) || pick(k8All);

  // 폴백: 아무것도 없으면 분기말 자체를 반환
  if (!chosen) {
    return { eventDateET: snapETMidnight(qeISO), when: 'unknown', source: 'period_of_report' };
  }

  // 소스 판정: press_release 존재 여부 → 8-K_ex99, 그 외 filed_at/period_of_report
  const press = (chosen.exhibits || []).find((e) => e.type === 'press_release' && /(htm|html|txt)$/i.test(e.href));
  // 후보 일자: USE_EX99_EVENT_DATE=1이면 event_date→filed_at 우선, POR는 마지막
  const candidateISO = (preferEx99Event
    ? (chosen.event_date || dateOnly(chosen.filed_at) || (chosen.period_of_report ?? null))
    : (chosen.event_date || (chosen.period_of_report ?? null) || dateOnly(chosen.filed_at))
  );

  let source: EventDateSource = 'filed_at';
  if (press && chosen.event_date) source = '8-K_ex99';
  else if (chosen.period_of_report && candidateISO === chosen.period_of_report) source = 'period_of_report';
  else source = 'filed_at';

  // BMO/AMC 판정: Exhibit 99 본문 우선 → 없으면 8-K 본문(primary) 헤더/문구에서 추정
  let when: WhenFlag = 'unknown';
  if (press && press.href) {
    try {
      const res = await secFetchLight(press.href, { headers: { Accept: 'text/html,text/plain,*/*' } });
      const text = (await res.text()).replace(/\s+/g, ' ').slice(0, 20000);
      const flag = detectWhenFromTextET(text);
      if (flag) when = flag;
    } catch {}
  } else if (chosen?.urls?.primary) {
    try {
      const res = await secFetchLight(chosen.urls.primary, { headers: { Accept: 'text/html,text/plain,*/*' } });
      const text = (await res.text()).replace(/\s+/g, ' ').slice(0, 20000);
      const flag = detectWhenFromTextET(text);
      if (flag) when = flag;
    } catch {}
  }

  return { eventDateET: snapETMidnight(candidateISO!), when, source };
}

function toISODate(d: Date): string | null {
  if (!d || isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10);
}

function dateOnly(isoDateTime: string | null | undefined): string | null {
  if (!isoDateTime) return null;
  const d = new Date(isoDateTime);
  if (isNaN(d.getTime())) return null;
  return toISODate(d);
}

// 간단 ET 자정 스냅(정확한 휴일/거래일 스냅은 이후 단계에서 처리)
function snapETMidnight(iso: string): Date {
  // DST를 엄밀히 반영하지 않음(후속 tradingCalendar에서 보정)
  // 일관성을 위해 UTC 00:00을 반환하고 상위 레이어에서 ET로 해석
  return new Date(`${iso}T00:00:00Z`);
}

// ---- Helpers: SEC fetch (light) ----
async function secFetchLight(url: string, init: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    'User-Agent': process.env.SEC_USER_AGENT || `gpts-api-server/1.0 (contact: ${process.env.SEC_CONTACT || 'noreply@example.com'})`,
    Accept: (init.headers as Record<string, string>)?.['Accept'] || 'application/json',
    'Accept-Encoding': 'gzip, deflate',
    ...(init.headers as Record<string, string>),
  };
  // 소규모 웨이트로 간단한 rate-limit
  await new Promise((r) => setTimeout(r, 600));
  const res = await fetch(url, { ...init, headers });
  return res;
}

// ---- Helpers: Detect BMO/AMC from press text (ET only) ----
function detectWhenFromTextET(text: string): WhenFlag | null {
  const t = text.toLowerCase();
  if (/after\s+(the\s+)?market\s+(close|closes)/i.test(text) || /\bafter-hours?\b/i.test(text)) return 'amc';
  if (/before\s+(the\s+)?market\s+(open|opens)/i.test(text) || /\bpre-market\b/i.test(text)) return 'bmo';

  // Prefer explicit ET/EDT/EST times
  const timeRe = /\b([0-1]?\d)(?::([0-5]\d))?\s*(a\.m\.|p\.m\.|am|pm)\s*(et|edt|est)\b/i;
  const m = timeRe.exec(text);
  if (m) {
    let hour = parseInt(m[1], 10);
    const min = m[2] ? parseInt(m[2], 10) : 0;
    const ap = m[3].toLowerCase();
    if (ap.startsWith('p') && hour !== 12) hour += 12;
    if (ap.startsWith('a') && hour === 12) hour = 0;
    if (hour > 16 || (hour === 16 && min >= 0)) return 'amc';
    if (hour < 9 || (hour === 9 && min < 30)) return 'bmo';
    return 'unknown';
  }
  return null;
}



// lib/external/sec-edgar.ts
// EDGAR 정규화: 10-K / 10-Q / 8-K → 공통 스키마
// - 공식 endpoints만 사용 (https://data.sec.gov)
// - 429/403 백오프 + User-Agent 필수
// - Exhibit 99(press release) 우선 event_date (+ 파일링일 근접성 검증)
// - 10-K/10-Q facts는 companyfacts API로 보강 (폼/기간/최근성 매칭 강화)
// - Exhibits 노이즈 필터링(R*.htm, css/js/img 등 제외), EPS 단위 'USD/share' 통일, 8-K Item 5.07 매핑 추가

import { CacheService } from '@/lib/kv';

// ---------- Const & Utils ----------
const SEC_BASE = 'https://data.sec.gov';
const DEFAULT_UA =
  process.env.SEC_USER_AGENT ||
  `gongui-sec-client/1.0 (contact: ${process.env.SEC_CONTACT || 'noreply@example.com'})`;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function secFetch(
  url: string,
  init: RequestInit = {},
  maxRetry = 5
): Promise<Response> {
  const headers: Record<string, string> = {
    'User-Agent': DEFAULT_UA,
    Accept: (init.headers as Record<string, string>)?.['Accept'] || 'application/json',
    'Accept-Encoding': 'gzip, deflate',
    Host: 'data.sec.gov',
    ...(init.headers as Record<string, string>),
  };

  let attempt = 0;
  while (true) {
    // 아주 간단한 rate-limit (~2rps)
    await sleep(600);
    const res = await fetch(url, { ...init, headers });
    if (res.ok) return res;

    if ((res.status === 429 || res.status === 403) && attempt < maxRetry) {
      const backoff = Math.min(2000 * 2 ** attempt, 15000);
      await sleep(backoff + Math.floor(Math.random() * 300));
      attempt++;
      continue;
    }
    // throw with body for debug
    let body = '';
    try {
      body = await res.text();
    } catch {}
    throw new Error(`SEC fetch ${res.status} ${res.statusText} for ${url}\n${body}`);
  }
}

function toISODate(d: string | Date | undefined | null): string | null {
  if (!d) return null;
  const dt = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(dt.getTime())) return null;
  return new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()))
    .toISOString()
    .slice(0, 10);
}

function periodToLabel(fy?: number, fp?: string, end?: string): string {
  if (fy && fp) {
    if (fp.toUpperCase() === 'FY') return String(fy);
    const m = fp.toUpperCase().match(/^Q([1-4])$/);
    if (m) return `${fy}Q${m[1]}`;
  }
  return end ? end.slice(0, 10) : 'NA';
}

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function cleanSnippet(text: string): string {
  // HTML 태그 제거 (더 강력한 정규식)
  let cleaned = text.replace(/<[^>]*>/g, ' ');
  
  // 연속 공백 정리
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  // TOC/목차 패턴 제거
  const tocPatterns = [
    /table\s+of\s+contents/i,
    /contents\s*$/i,
    /index\s*$/i,
    /^\s*<td[^>]*>.*<\/td>\s*$/i, // 단일 td 셀
    /^\s*<tr[^>]*>.*<\/tr>\s*$/i, // 단일 tr 행
  ];
  
  for (const pattern of tocPatterns) {
    if (pattern.test(cleaned)) {
      return '';
    }
  }
  
  // 문장 단위로 정리 (마침표 기준 1-2문장)
  const sentences = cleaned.split(/[.!?]+/).filter(s => s.trim().length > 10);
  const result = sentences.slice(0, 2).join('. ').trim();
  
  return result || cleaned.slice(0, 200) + '...';
}

function extractPressReleaseRevenue(text: string): number | null {
  // Revenue/Net sales 패턴 매칭
  const patterns = [
    /(?:revenue|net\s+sales|total\s+revenue)[:\s]*\$?([0-9,]+\.?[0-9]*)\s*(?:billion|million|b|m)/i,
    /(?:revenue|net\s+sales|total\s+revenue)[:\s]*\$([0-9,]+\.?[0-9]*)/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const value = parseFloat(match[1].replace(/,/g, ''));
      if (!isNaN(value)) {
        // billion/million 단위 정규화
        if (text.toLowerCase().includes('billion') || text.toLowerCase().includes('b')) {
          return value * 1000000000;
        } else if (text.toLowerCase().includes('million') || text.toLowerCase().includes('m')) {
          return value * 1000000;
        }
        return value;
      }
    }
  }
  return null;
}

async function sha256Hex(s: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(s);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ---------- CIK Lookup (with cache) ----------
/**
 * SEC company_tickers.json에서 티커→CIK 매핑
 */
async function getCIKFromTicker(ticker: string): Promise<string | null> {
  const key = `sec:cik_map:v1`;
  const cached = await CacheService.get(key);
  let map: Record<string, string> | null = cached ? JSON.parse(cached) : null;

  if (!map) {
    const url = `https://www.sec.gov/files/company_tickers.json`;
    const res = await secFetch(url);
    const data = await res.json();
    map = {};
    for (const [, v] of Object.entries<any>(data)) {
      if (v?.ticker) {
        map[v.ticker.toUpperCase()] = String(v.cik_str).padStart(10, '0');
      }
    }
    await CacheService.setex(key, 86400, JSON.stringify(map)); // 24h
  }

  const cik = map![ticker.toUpperCase()];
  if (!cik) {
    console.warn(`[SEC] CIK not found for ${ticker}`);
    return null;
  }
  return cik;
}

// ---------- Types ----------
export interface NormalizedSECFiling {
  cik: string;
  ticker: string | null;
  company: string | null;
  form: '8-K' | '10-K' | '10-Q' | '8-K/A' | '10-K/A' | '10-Q/A';
  accession: string;
  filed_at: string; // ISO datetime
  period_of_report: string | null; // YYYY-MM-DD
  event_date: string | null; // YYYY-MM-DD
  is_amendment: boolean;
  amends: string | null;
  urls: { index: string; primary: string };
  items: string[]; // 8-K item codes, e.g., ["2.02","7.01"]
  event_types: string[]; // normalized event types
  sections: {
    business?: { start: string; snippet: string };
    mdna?: { start: string; snippet: string };
    risk_factors?: { start: string; snippet: string };
  };
  exhibits: Array<{ type: string; href: string; title: string; detected_date?: string }>;
  facts: {
    revenues?: { value: number; unit: string; period: string };
    operating_income?: { value: number; unit: string; period: string };
    net_income?: { value: number; unit: string; period: string };
    eps_basic?: { value: number; unit: string; period: string };
  };
  snippets: { headline?: string; earnings_text?: string };
  nlp?: { polarity: number; confidence: number };
  source_hash: string | null;
  ingested_at: string;
}

type RawRecentFiling = {
  form: string;
  accession: string;
  filingDate: string;
  reportDate?: string;
  primaryDocument: string;
  size?: number;
  isXBRL?: boolean;
  isInlineXBRL?: boolean;
  companyName: string;
  tickers: string[];
};

// ---------- Public: Reports + Revenue ----------
/**
 * 특정 티커의 모든 10-K/10-Q/8-K를 정규화해서 반환
 */
export async function fetchAllSECReports(
  ticker: string,
  from: string,
  to: string
): Promise<NormalizedSECFiling[]> {
  const cacheKey = `sec_reports:${ticker}:${from}:${to}`;
  const cached = await CacheService.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const cik = await getCIKFromTicker(ticker);
  if (!cik) return [];

  const raws = await fetchRawSECReports(cik, from, to);
  const normalized = await Promise.all(
    raws.map((r) => normalizeSECFiling(r, ticker, cik))
  );

  await CacheService.setex(cacheKey, 86400, JSON.stringify(normalized));
  return normalized;
}

/**
 * 회사 리베뉴(연/분기) 추출: companyfacts API 사용 (정규화 참고용)
 */
export async function fetchRevenueData(
  ticker: string,
  from: string,
  to: string
): Promise<Array<{ date: string; revenue: number }>> {
  const cacheKey = `revenue:${ticker}:${from}:${to}`;
  const cached = await CacheService.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const cik = await getCIKFromTicker(ticker);
  if (!cik) return [];

  const facts = await getCompanyFacts(cik);
  const seriesKeys = ['Revenues', 'SalesRevenueNet', 'RevenueFromContractWithCustomerExcludingAssessedTax'];
  const rows: Array<{ date: string; revenue: number }> = [];
  const fromDt = new Date(from);
  const toDt = new Date(to);

  for (const key of seriesKeys) {
    const node = facts?.facts?.['us-gaap']?.[key];
    if (!node?.units) continue;

    const unitKey = Object.keys(node.units).find((u) => u.toUpperCase().includes('USD')) || Object.keys(node.units)[0];
    const arr = node.units[unitKey] || [];
    for (const it of arr) {
      const end = toISODate(it.end);
      if (!end) continue;
      const dt = new Date(end);
      if (dt >= fromDt && dt <= toDt && typeof it.val === 'number') {
        rows.push({ date: end, revenue: it.val });
      }
    }
    if (rows.length) break; // 첫 유효 시리즈만 채택
  }

  rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  await CacheService.setex(cacheKey, 86400, JSON.stringify(rows));
  return rows;
}

// ---------- Raw filings (submissions) ----------
async function fetchRawSECReports(cik: string, from: string, to: string): Promise<RawRecentFiling[]> {
  const url = `${SEC_BASE}/submissions/CIK${cik.padStart(10, '0')}.json`;
  const res = await secFetch(url);
  const data = await res.json();

  const filings = data?.filings?.recent || {};
  const forms: string[] = filings.form || [];
  const accessions: string[] = filings.accessionNumber || [];
  const filingDate: string[] = filings.filingDate || [];
  const reportDate: string[] = filings.reportDate || filings.periodOfReport || [];
  const primaryDoc: string[] = filings.primaryDocument || [];
  const fromDt = new Date(from);
  const toDt = new Date(to);

  const allow = new Set(['10-K', '10-Q', '8-K', '10-K/A', '10-Q/A', '8-K/A']);
  const out: RawRecentFiling[] = [];

  for (let i = 0; i < forms.length; i++) {
    const f = forms[i];
    if (!allow.has(f)) continue;
    const fDate = new Date(filingDate[i]);
    if (isNaN(fDate.getTime())) continue;
    if (fDate < fromDt || fDate > toDt) continue;

    out.push({
      form: f,
      accession: accessions[i],
      filingDate: filingDate[i],
      reportDate: reportDate?.[i],
      primaryDocument: primaryDoc?.[i] || 'index.html',
      size: filings.size?.[i],
      isXBRL: filings.isXBRL?.[i],
      isInlineXBRL: filings.isInlineXBRL?.[i],
      companyName: data?.name || 'Unknown Company',
      tickers: data?.tickers || [],
    });
  }

  // 최신순
  out.sort((a, b) => new Date(b.filingDate).getTime() - new Date(a.filingDate).getTime());
  return out;
}

// ---------- Normalize ----------
async function normalizeSECFiling(
  raw: RawRecentFiling,
  ticker: string,
  cik: string
): Promise<NormalizedSECFiling> {
  const accessionPath = raw.accession.replace(/-/g, '');
  const baseUrl = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accessionPath}`;

  const parsed = await parseSECDocument(raw, baseUrl, ticker);
  const isAmend = raw.form.endsWith('/A');

  const normalized: NormalizedSECFiling = {
    cik,
    ticker,
    company: raw.companyName || null,
    form: raw.form as any,
    accession: raw.accession,
    filed_at: new Date(raw.filingDate).toISOString(),
    period_of_report: toISODate(raw.reportDate) || null,
    event_date: parsed.event_date || toISODate(raw.reportDate) || toISODate(raw.filingDate),
    is_amendment: isAmend,
    amends: parsed.amends,
    urls: { index: `${baseUrl}/index.json`, primary: `${baseUrl}/${raw.primaryDocument}` },
    items: parsed.items,
    event_types: parsed.event_types,
    sections: parsed.sections,
    exhibits: parsed.exhibits,
    facts: parsed.facts,
    snippets: parsed.snippets,
    source_hash: parsed.source_hash,
    ingested_at: new Date().toISOString(),
  };

  return normalized;
}

// ---------- Parse document roots ----------
async function parseSECDocument(
  raw: RawRecentFiling,
  baseUrl: string,
  ticker: string
): Promise<{
  items: string[];
  event_types: string[];
  sections: any;
  exhibits: any[];
  facts: any;
  snippets: any;
  event_date: string | null;
  amends: string | null;
  source_hash: string | null;
}> {
  const itemToEventType: Record<string, string[]> = {
    '1.01': ['agreement', 'mna'],
    '1.03': ['bankruptcy'],
    '2.01': ['mna'],
    '2.02': ['earnings'],
    '2.05': ['restructuring'],
    '3.01': ['listing', 'securities'],
    '3.02': ['listing', 'securities'],
    '5.02': ['governance_exec'],
    '5.07': ['governance_shareholder'], // 주총/투표 결과
    '7.01': ['reg_fd'],
    '8.01': ['other_event'],
  };

  const [items, sections, exhibits] = await Promise.all([
    parse8KItems(raw, baseUrl),
    parseSections(raw, baseUrl),
    parseExhibits(raw, baseUrl),
  ]);

  const event_types = unique(items.flatMap((it) => itemToEventType[it] || []));

  const facts = await parseFactsWithCompanyFacts(raw, baseUrl, ticker, exhibits);
  const snippets = await extractSnippets(raw, baseUrl, ticker);

  const event_date = await determineEventDate(raw, exhibits);
  const amends = raw.form.endsWith('/A') ? null : null;

  // compute source hash (index.json)
  let source_hash: string | null = null;
  try {
    const idxRes = await secFetch(`${baseUrl}/index.json`);
    const idxText = await idxRes.text();
    source_hash = `sha256:${(await sha256Hex(idxText)).slice(0, 16)}`;
  } catch {
    source_hash = null;
  }

  return { items, event_types, sections, exhibits, facts, snippets, event_date, amends, source_hash };
}

// ---------- 8-K Items ----------
async function parse8KItems(raw: RawRecentFiling, baseUrl: string): Promise<string[]> {
  if (!raw.form.startsWith('8-K')) return [];

  try {
    const url = `${baseUrl}/${raw.primaryDocument}`;
    const res = await secFetch(url, { headers: { Accept: 'text/html,*/*' } });
    const html = await res.text();

    // 많은 8-K가 &nbsp; / 소문자 / 구두점 변형을 포함
    // "Item 2.02", "ITEM 2.02.", "Item 2.02 – Results..."
    const norm = html.replace(/\s+/g, ' ').replace(/&nbsp;/gi, ' ');
    const regex = /Item\s+(\d+\.\d+)\b/gi;
    const out: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = regex.exec(norm))) {
      out.push(m[1]);
    }
    return unique(out);
  } catch (e) {
    console.warn(`[SEC] parse8KItems failed: ${e}`);
    return [];
  }
}

// ---------- 10-K / 10-Q Sections (R*.htm 백업 파싱 + 정규식 확장) ----------
async function parseSections(raw: RawRecentFiling, baseUrl: string): Promise<any> {
  if (!(raw.form.startsWith('10-K') || raw.form.startsWith('10-Q'))) return {};
  const sections: any = {};
  const grab = (label: string, text: string, patterns: RegExp[]) => {
    for (const re of patterns) {
      const m = re.exec(text);
      if (m && !sections[label]) {
        const rawSnippet = text.substring(m.index, m.index + 360);
        const cleanedSnippet = cleanSnippet(rawSnippet);
        if (cleanedSnippet) {
          sections[label] = { start: m[0].slice(0, 80), snippet: cleanedSnippet };
          return;
        }
      }
    }
  };
  const fetchText = async (href: string) => {
    const r = await secFetch(href, { headers: { Accept: 'text/html,*/*' } });
    const html = await r.text();
    return html.replace(/\s+/g, ' ').replace(/&nbsp;/gi, ' ');
  };

  // 패턴: Item 헤더 + 대체 표현(‘Item’이 누락된 경우도 커버)
  const RE_MDNA = [
    /Item\s+(7|2)\s*\.?\s*Management[’'`]s?\s*Discussion[^]{0,120}?Results of Operations/i,
    /Management[’'`]s?\s*Discussion[^]{0,120}?Results of Operations/i
  ];
  const RE_BUSINESS = [
    /Item\s+1\s*\.?\s*Business/i,
    /\bBusiness\s+Overview\b/i
  ];
  const RE_RISK = [
    /Item\s+1A\s*\.?\s*Risk\s*Factors/i,
    /\bRisk\s+Factors\b/i
  ];

  // 1) primary 문서
  try {
    const primaryText = await fetchText(`${baseUrl}/${raw.primaryDocument}`);
    grab('business', primaryText, RE_BUSINESS);
    grab('risk_factors', primaryText, RE_RISK);
    grab('mdna', primaryText, RE_MDNA);
    if (sections.business || sections.risk_factors || sections.mdna) return sections;
  } catch {}

  // 2) fallback: R*.htm (처음 8개 정도만)
  try {
    const idxRes = await secFetch(`${baseUrl}/index.json`);
    const idx = await idxRes.json();
    const Rs = (idx?.directory?.item || [])
      .map((it: any) => String(it.name || ''))
      .filter((n: string) => /^R\d+\.htm$/i.test(n))
      .slice(0, 8);

    for (const name of Rs) {
      const text = await fetchText(`${baseUrl}/${name}`);
      grab('business', text, RE_BUSINESS);
      grab('risk_factors', text, RE_RISK);
      grab('mdna', text, RE_MDNA);
      if (sections.business && sections.mdna) break;
    }
  } catch {}

  return sections;
}

// ---------- Exhibits (index.json) - 노이즈 제거 ----------
async function parseExhibits(raw: RawRecentFiling, baseUrl: string): Promise<any[]> {
  try {
    const url = `${baseUrl}/index.json`;
    const res = await secFetch(url);
    const idx = await res.json();

    const items: any[] = idx?.directory?.item || [];
    const out: any[] = [];

    for (const it of items) {
      const name = String(it.name || '');
      const lower = name.toLowerCase();
      const href = `${baseUrl}/${name}`;

      // 1) Press Release / Exhibit 99 (이미지 첨부 제외)
      if (/ex[-_\.]?99|exhibit[-_\.]?99|press|earningsrelease/i.test(name)) {
        if (!/\.(jpg|jpeg|png|gif|svg)$/i.test(lower)) {
          out.push({ type: 'press_release', href, title: 'Exhibit 99 / Press Release' });
        }
        continue;
      }

      // 2) 데이터/스키마/XLSX/PDF
      if (/\.(xlsx|xls)$/i.test(lower)) { out.push({ type: 'xlsx', href, title: name }); continue; }
      if (/\.(xml|json|zip|xsd)$/i.test(lower) || /_htm\.xml$/i.test(lower)) { out.push({ type: 'data', href, title: name }); continue; }
      if (/\.(pdf)$/i.test(lower)) { out.push({ type: 'pdf', href, title: name }); continue; }

      // 3) 명백한 노이즈(R*.htm, index-headers, *-index.html, css/js/img)
      if (
        /^r\d+\.htm$/i.test(name) ||
        /index-headers\.html$/i.test(lower) ||
        /(^|\/)index\.html$/i.test(lower) ||
        /-index\.html$/i.test(lower) ||
        /\.(css|js|jpg|jpeg|png|gif|svg)$/i.test(lower)
      ) continue;

      // 4) 나머지(중요 계약서 ex10-*, ex2-* 등)는 exhibit로 유지
      out.push({ type: 'exhibit', href, title: name });
    }
    return out;
  } catch (e) {
    console.warn(`[SEC] parseExhibits failed: ${e}`);
    return [];
  }
}

// ---------- Facts via companyfacts ----------
async function getCompanyFacts(cik: string): Promise<any | null> {
  const key = `sec:companyfacts:${cik}`;
  const cached = await CacheService.get(key);
  if (cached) return JSON.parse(cached);
  try {
    const url = `${SEC_BASE}/api/xbrl/companyfacts/CIK${cik}.json`;
    const res = await secFetch(url);
    const json = await res.json();
    await CacheService.setex(key, 86400, JSON.stringify(json));
    return json;
  } catch (e) {
    console.warn(`[SEC] companyfacts failed: ${e}`);
    return null;
  }
}

function pickUnit(units: Record<string, any[]> | undefined) {
  if (!units) return { key: '', arr: [] as any[] };
  const key = Object.keys(units).find((k) => k.toUpperCase().includes('USD')) || Object.keys(units)[0];
  return { key, arr: units[key] || [] };
}

// 모든 USD 계열 유닛의 시계열을 합쳐 후보군을 만든다. (USD가 없으면 전체 유닛 평탄화)
function collectUSDUnitFacts(units: Record<string, any[]>): any[] {
  const all = Object.entries(units)
    .filter(([k]) => k.toUpperCase().includes('USD'))
    .flatMap(([, arr]) => arr || []);
  
  if (all.length === 0) {
    return Object.values(units).flatMap((arr) => arr || []);
  }
  
  // 최근 5년 이내 데이터만 필터링 (더 엄격하게)
  const currentYear = new Date().getFullYear();
  return all.filter(item => {
    if (!item.end) return false;
    const endDate = new Date(item.end);
    const year = endDate.getFullYear();
    return year >= (currentYear - 5) && year <= currentYear;
  });
}

// 폼/기간/최근성 매칭 강화: 폼 일치(10-Q/10-K) 우선, 보고기간 근접, 파일링연도 기준 최근 6년 우선
function chooseBestFact(arr: any[], formHint: string, reportDtISO: string | null, filingISO?: string) {
  const hint = formHint.replace('/A','');
  const filingYear = filingISO ? new Date(filingISO).getUTCFullYear() : null;
  const reportYear = reportDtISO ? new Date(reportDtISO).getUTCFullYear() : null;
  
  return arr
    .filter(x => typeof x.val === 'number' && x.end)
    .map(x => {
      const endISO = toISODate(x.end);
      const endDate = endISO ? new Date(endISO) : null;
      const reportDate = reportDtISO ? new Date(reportDtISO) : null;
      const endYear = endDate ? endDate.getUTCFullYear() : 0;
      
      return {
        ...x,
        endISO,
        formScore: x.form === hint ? 2 : (x.form?.startsWith('10') ? 1 : 0),
        dist: (reportDate && endDate) ? Math.abs(+reportDate - +endDate) : 9e15,
        recent: filingYear && endDate ? (Math.abs(endYear - filingYear) <= 6 ? 1 : 0) : 1,
        yearScore: endYear,
        // 보고년도와 일치하는지 확인
        yearMatch: reportYear ? (endYear === reportYear ? 1 : 0) : 0,
        // 최근 3년 이내인지 확인
        veryRecent: endYear >= (filingYear ? filingYear - 3 : 2020) ? 1 : 0
      };
    })
    .sort((a,b) => {
      // 1. 보고년도 일치 (가장 중요)
      if (b.yearMatch !== a.yearMatch) return b.yearMatch - a.yearMatch;
      // 2. 최근 3년 이내
      if (b.veryRecent !== a.veryRecent) return b.veryRecent - a.veryRecent;
      // 3. 최근성 (6년 이내)
      if (b.recent !== a.recent) return b.recent - a.recent;
      // 4. 폼 일치
      if (b.formScore !== a.formScore) return b.formScore - a.formScore;
      // 5. 연도 (최신 우선)
      if (b.yearScore !== a.yearScore) return b.yearScore - a.yearScore;
      // 6. 기간 근접성
      return a.dist - b.dist;
    })[0];
}

async function parseFactsWithCompanyFacts(raw: RawRecentFiling, _baseUrl: string, ticker?: string, exhibits?: any[]): Promise<any> {
  if (!(raw.form.startsWith('10-K') || raw.form.startsWith('10-Q'))) return {};
  const t = raw.tickers?.[0] || ticker;
  const cik = t ? await getCIKFromTicker(t) : null;
  const factsAll = cik ? await getCompanyFacts(cik) : null;
  if (!factsAll) return {};

  const filingISO = toISODate(raw.filingDate);
  const por = toISODate(raw.reportDate) || filingISO;
  const getNode = (key: string) => factsAll?.facts?.['us-gaap']?.[key];

  const pick = (keys: string[]) => {
    for (const k of keys) {
      const node = getNode(k);
      if (!node?.units) continue;
      const candidates = collectUSDUnitFacts(node.units);
      if (!candidates.length) continue;
      const best = chooseBestFact(candidates, raw.form, por, filingISO || undefined);
      if (best) return { val: best.val, fy: best.fy, fp: best.fp, end: best.end };
    }
    return null;
  };

  const rev = pick(['Revenues','SalesRevenueNet','RevenueFromContractWithCustomerExcludingAssessedTax']);
  const op  = pick(['OperatingIncomeLoss']);
  const ni  = pick(['NetIncomeLoss']);
  const eps = pick(['EarningsPerShareBasic','EarningsPerShareDiluted']);

  const out: any = {};
  if (rev) out.revenues = { value: rev.val, unit: 'USD',       period: periodToLabel(rev.fy, rev.fp, rev.end) };
  if (op)  out.operating_income = { value: op.val,  unit: 'USD',       period: periodToLabel(op.fy, op.fp, op.end) };
  if (ni)  out.net_income = { value: ni.val, unit: 'USD',       period: periodToLabel(ni.fy, ni.fp, ni.end) };
  if (eps) out.eps_basic = { value: eps.val, unit: 'USD/share', period: periodToLabel(eps.fy, eps.fp, eps.end) };
  
  // Press release 수치 검증 (선택사항)
  try {
    const pressRelease = exhibits?.find((e: any) => e.type === 'press_release' && /\.(htm|html|txt)$/i.test(e.href));
    if (pressRelease && rev) {
      const res = await secFetch(pressRelease.href, { headers: { Accept: 'text/html,text/plain,*/*' } });
      const text = await res.text();
      const prRevenue = extractPressReleaseRevenue(text);
      if (prRevenue && Math.abs(prRevenue - rev.val) / rev.val > 0.1) { // 10% 이상 차이
        out.facts_alt = { press_release_revenue: { value: prRevenue, unit: 'USD', source: 'press_release' } };
      }
    }
  } catch (e) {
    // Press release 검증 실패는 무시
  }
  
  return out;
}

// ---------- Snippets ----------
async function extractSnippets(raw: RawRecentFiling, _baseUrl: string, ticker: string): Promise<any> {
  const out: any = {};
  if (raw.form.startsWith('8-K')) {
    out.headline = `${ticker} filed ${raw.form}`;
    // 필요시 press_release에서 첫 문장 추출 가능(요청 多 시 확장)
  }
  return out;
}

// ---------- Event date (Exhibit 99 > filingDate) with sanity check ----------
const MONTHS = [
  'January','February','March','April','May','June','July','August','September','October','November','December'
];
const MONTHS_SHORT = MONTHS.map((m)=>m.slice(0,3));

function tryParseUsDate(s: string): string | null {
  // "August 22, 2024" / "Aug 22, 2024" / "2024-08-22" / "22 August 2024"
  const re1 = new RegExp(`\\b(${MONTHS.join('|')}|${MONTHS_SHORT.join('|')})\\s+([0-9]{1,2}),\\s*([0-9]{4})\\b`, 'i');
  const m1 = s.match(re1);
  if (m1) {
    const month = [...MONTHS, ...MONTHS_SHORT].findIndex(
      (mm) => mm.toLowerCase() === m1[1].toLowerCase()
    ) % 12;
    const day = parseInt(m1[2], 10);
    const year = parseInt(m1[3], 10);
    return toISODate(new Date(Date.UTC(year, month, day)));
  }
  const re2 = /\b(\d{4})-(\d{2})-(\d{2})\b/;
  const m2 = s.match(re2);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
  const re3 = new RegExp(`\\b([0-9]{1,2})\\s+(${MONTHS.join('|')}|${MONTHS_SHORT.join('|')})\\s+([0-9]{4})\\b`, 'i');
  const m3 = s.match(re3);
  if (m3) {
    const day = parseInt(m3[1], 10);
    const month = [...MONTHS, ...MONTHS_SHORT].findIndex(
      (mm) => mm.toLowerCase() === m3[2].toLowerCase()
    ) % 12;
    const year = parseInt(m3[3], 10);
    return toISODate(new Date(Date.UTC(year, month, day)));
  }
    return null;
}

function clampEventDateToFilingRange(candidateISO: string, filingISO: string, days = 21): string | null {
  const c = new Date(candidateISO), f = new Date(filingISO);
  if (isNaN(c.getTime()) || isNaN(f.getTime())) return null;
  const diff = Math.abs((+c - +f) / 86400000);
  return diff <= days ? candidateISO : null;
}

async function determineEventDate(raw: RawRecentFiling, exhibits: any[]): Promise<string | null> {
  const filingISO = toISODate(raw.filingDate)!;
  const prs = exhibits.find((e: any) => e.type === 'press_release' && /\.(htm|html|txt)$/i.test(e.href));
  const candidates: string[] = [];

  if (prs) {
    try {
      const res = await secFetch(prs.href, { headers: { Accept: 'text/html,text/plain,*/*' } });
      const txt = (await res.text()).replace(/\s+/g, ' ').slice(0, 20000);
      // 여러 후보를 뽑아 파일링일에 가장 가까운 날짜를 선택
      const reList = [
        new RegExp(`\\b(${MONTHS.join('|')}|${MONTHS_SHORT.join('|')})\\s+\\d{1,2},\\s*\\d{4}\\b`, 'gi'),
        /\b\d{4}-\d{2}-\d{2}\b/g,
        new RegExp(`\\b\\d{1,2}\\s+(${MONTHS.join('|')}|${MONTHS_SHORT.join('|')})\\s+\\d{4}\\b`, 'gi')
      ];
      for (const re of reList) {
        let m: RegExpExecArray | null;
        while ((m = re.exec(txt))) {
          const iso = tryParseUsDate(m[0]);
          if (iso) candidates.push(iso);
        }
      }
    } catch {}
  }

  // 파일링일 ±21일 이내 후보만 남기고, 파일링일과 가장 가까운 날짜 채택
  const inRange = candidates
    .map((d) => clampEventDateToFilingRange(d, filingISO, 21))
    .filter(Boolean) as string[];

  if (inRange.length) {
    inRange.sort((a, b) => Math.abs(+new Date(a) - +new Date(filingISO)) - Math.abs(+new Date(b) - +new Date(filingISO)));
    return inRange[0];
  }
  return filingISO; // 폴백
}

// ---------- END ----------

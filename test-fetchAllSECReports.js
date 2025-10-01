#!/usr/bin/env node

/**
 * fetchAllSECReports 함수 직접 테스트
 * SEC EDGAR API를 통해 실제 보고서 데이터를 가져와서 정규화된 스키마로 변환하는 테스트
 */

const API_BASE_URL = 'http://localhost:3000';

// SEC EDGAR API 직접 호출 함수들
async function getCIKFromTicker(ticker) {
  try {
    console.log(`🔍 ${ticker}의 CIK 조회 중...`);
    const response = await fetch('https://www.sec.gov/files/company_tickers.json', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`✅ SEC API 응답 성공: ${Object.keys(data).length}개 회사 데이터`);

    for (const [key, company] of Object.entries(data)) {
      if (company.ticker === ticker.toUpperCase()) {
        const cik = String(company.cik_str).padStart(10, '0');
        console.log(`🎯 찾은 결과:`);
        console.log(`   티커: ${company.ticker}`);
        console.log(`   CIK: ${cik}`);
        console.log(`   회사명: ${company.title}`);
        return cik;
      }
    }

    console.log(`❌ ${ticker}에 대한 CIK를 찾을 수 없습니다.`);
    return null;
  } catch (error) {
    console.error(`❌ CIK 조회 실패: ${error.message}`);
    return null;
  }
}

async function fetchRawSECReports(cik, from, to) {
  try {
    console.log(`📄 CIK ${cik}의 SEC 보고서 조회 중...`);
    const submissionsUrl = `https://data.sec.gov/submissions/CIK${cik.padStart(10, '0')}.json`;
    
    const response = await fetch(submissionsUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Host': 'data.sec.gov'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const filings = data.filings?.recent || {};
    const fromDate = new Date(from);
    const toDate = new Date(to);
    
    const reports = [];
    
    if (filings.form && filings.filingDate) {
      for (let i = 0; i < filings.form.length; i++) {
        const formType = filings.form[i];
        if (['10-K', '10-Q', '8-K'].includes(formType)) {
          const filingDate = new Date(filings.filingDate[i]);
          if (filingDate >= fromDate && filingDate <= toDate) {
            reports.push({
              form: formType,
              accession: filings.accessionNumber[i],
              filingDate: filings.filingDate[i],
              reportDate: filings.reportDate[i] || filings.filingDate[i],
              primaryDocument: filings.primaryDocument?.[i] || '',
              size: filings.size?.[i] || 0,
              isXBRL: filings.isXBRL?.[i] || false,
              isInlineXBRL: filings.isInlineXBRL?.[i] || false,
              companyName: data.name || 'Unknown Company',
              tickers: data.tickers || []
            });
          }
        }
      }
    }
    
    reports.sort((a, b) => new Date(b.filingDate).getTime() - new Date(a.filingDate).getTime());
    
    console.log(`✅ ${reports.length}개의 SEC 보고서 발견`);
    return reports;
  } catch (error) {
    console.error(`❌ SEC 보고서 조회 실패: ${error.message}`);
    return [];
  }
}

function normalizeSECFiling(rawReport, ticker, cik) {
  console.log(`🔄 ${rawReport.form} 보고서 정규화 중...`);
  
  const accession = rawReport.accession;
  const accessionPath = accession.replace(/-/g, '');
  
  const baseUrl = `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionPath}`;
  
  // 8-K item to event type mapping
  const itemToEventType = {
    '1.01': ['agreement', 'mna'],
    '1.03': ['bankruptcy'],
    '2.01': ['mna'],
    '2.02': ['earnings'],
    '2.05': ['restructuring'],
    '3.01': ['listing', 'securities'],
    '3.02': ['listing', 'securities'],
    '5.02': ['governance_exec'],
    '7.01': ['reg_fd'],
    '8.01': ['other_event']
  };
  
  const normalized = {
    cik: cik,
    ticker: ticker,
    company: rawReport.companyName,
    form: rawReport.form,
    accession: accession,
    filed_at: new Date(rawReport.filingDate).toISOString(),
    period_of_report: rawReport.reportDate || null,
    event_date: rawReport.reportDate || rawReport.filingDate,
    is_amendment: rawReport.form.includes('/A'),
    amends: null,
    urls: {
      index: `${baseUrl}/index.json`,
      primary: `${baseUrl}/${rawReport.primaryDocument}`
    },
    items: [],
    event_types: [],
    sections: {},
    exhibits: [],
    facts: {},
    snippets: {},
    source_hash: null,
    ingested_at: new Date().toISOString()
  };
  
  console.log(`✅ 정규화 완료: ${normalized.form} - ${normalized.filed_at}`);
  return normalized;
}

async function fetchAllSECReports(ticker, from, to) {
  console.log(`\n🚀 fetchAllSECReports 테스트 시작`);
  console.log(`   티커: ${ticker}`);
  console.log(`   기간: ${from} ~ ${to}`);
  
  try {
    // 1. CIK 조회
    const cik = await getCIKFromTicker(ticker);
    if (!cik) {
      console.log(`❌ ${ticker}의 CIK를 찾을 수 없습니다.`);
      return [];
    }

    // 2. 원시 보고서 조회
    const rawReports = await fetchRawSECReports(cik, from, to);
    
    if (rawReports.length === 0) {
      console.log(`📄 ${ticker}에 대한 SEC 보고서가 없습니다.`);
      return [];
    }

    // 3. 정규화
    console.log(`\n🔄 ${rawReports.length}개 보고서 정규화 중...`);
    const normalizedReports = rawReports.map(report => 
      normalizeSECFiling(report, ticker, cik)
    );
    
    console.log(`\n✅ fetchAllSECReports 완료!`);
    console.log(`   총 ${normalizedReports.length}개 보고서 처리됨`);
    
    return normalizedReports;
    
  } catch (error) {
    console.error(`❌ fetchAllSECReports 실패: ${error.message}`);
    return [];
  }
}

// 테스트 실행
async function runTests() {
  console.log('🚀 fetchAllSECReports 함수 직접 테스트');
  console.log('=====================================\n');

  const testCases = [
    { ticker: 'AAPL', from: '2024-01-01', to: '2024-12-31' },
    { ticker: 'MSFT', from: '2024-01-01', to: '2024-12-31' },
    { ticker: 'TSLA', from: '2024-01-01', to: '2024-12-31' }
  ];

  for (const testCase of testCases) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`🔍 테스트: ${testCase.ticker} ${testCase.from} ~ ${testCase.to}`);
    console.log(`${'='.repeat(50)}`);
    
    const reports = await fetchAllSECReports(testCase.ticker, testCase.from, testCase.to);
    
    if (reports.length > 0) {
      console.log(`\n📊 정규화된 보고서 샘플:`);
      const sample = reports[0];
      console.log(`   Form: ${sample.form}`);
      console.log(`   Filed: ${sample.filed_at}`);
      console.log(`   Company: ${sample.company}`);
      console.log(`   URLs: ${sample.urls.primary}`);
      console.log(`   Items: ${sample.items.join(', ') || 'None'}`);
      console.log(`   Event Types: ${sample.event_types.join(', ') || 'None'}`);
    }
    
    // API 호출 간격 조절
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log(`\n🎉 모든 테스트 완료!`);
}

// 실행
runTests().catch(console.error);

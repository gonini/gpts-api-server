#!/usr/bin/env node

/**
 * SEC EDGAR CIK 조회 테스트 스크립트
 * 
 * 사용법:
 * node test-sec-edgar.js [ticker]
 * 
 * 예시:
 * node test-sec-edgar.js AAPL
 * node test-sec-edgar.js TSLA
 * node test-sec-edgar.js COST
 */

const http = require('http');

// 기본값 설정
const DEFAULT_TICKER = 'AAPL';
const DEFAULT_PORT = 3002;

// 명령행 인수 파싱
const args = process.argv.slice(2);
const ticker = args[0] || DEFAULT_TICKER;

console.log('🧪 SEC EDGAR CIK 조회 테스트');
console.log(`📊 티커: ${ticker}`);
console.log('─'.repeat(50));

// SEC EDGAR Company Tickers API 테스트
async function testSECCompanyTickers(ticker) {
  try {
    console.log(`🔍 SEC EDGAR Company Tickers API에서 ${ticker} 조회 중...`);
    
    const url = 'https://www.sec.gov/files/company_tickers.json';
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`✅ SEC API 응답 성공: ${Object.keys(data).length}개 회사 데이터`);
    
    // 티커로 CIK 찾기
    let found = false;
    for (const [key, company] of Object.entries(data)) {
      if (company.ticker === ticker.toUpperCase()) {
        const cik = String(company.cik_str).padStart(10, '0');
        console.log(`\n🎯 찾은 결과:`);
        console.log(`   티커: ${company.ticker}`);
        console.log(`   CIK: ${cik}`);
        console.log(`   회사명: ${company.title}`);
        console.log(`   키: ${key}`);
        found = true;
        break;
      }
    }
    
    if (!found) {
      console.log(`❌ ${ticker}에 대한 CIK를 찾을 수 없습니다.`);
      
      // 비슷한 티커들 찾기
      console.log(`\n🔍 비슷한 티커들 검색:`);
      const similarTickers = [];
      for (const [key, company] of Object.entries(data)) {
        if (company.ticker.includes(ticker.toUpperCase()) || 
            ticker.toUpperCase().includes(company.ticker)) {
          similarTickers.push({
            ticker: company.ticker,
            title: company.title,
            cik: String(company.cik_str).padStart(10, '0')
          });
        }
      }
      
      if (similarTickers.length > 0) {
        console.log(`   비슷한 티커들 (${similarTickers.length}개):`);
        similarTickers.slice(0, 10).forEach(item => {
          console.log(`   • ${item.ticker}: ${item.title} (CIK: ${item.cik})`);
        });
      } else {
        console.log(`   비슷한 티커를 찾을 수 없습니다.`);
      }
    }
    
    return found;
    
  } catch (error) {
    console.log(`❌ SEC API 호출 오류: ${error.message}`);
    return false;
  }
}

// 여러 티커 테스트
async function testMultipleTickers() {
  const testTickers = [
    'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'NFLX', 'AMD',
    'COST', 'WMT', 'JPM', 'BAC', 'JNJ', 'PG', 'KO', 'PFE', 'UNH', 'HD', 'V',
    'INVALID', 'FAKE', 'TEST'
  ];
  
  console.log('🧪 다중 티커 테스트');
  console.log('─'.repeat(50));
  
  const results = [];
  
  for (const testTicker of testTickers) {
    console.log(`\n🔍 테스트: ${testTicker}`);
    
    try {
      const found = await testSECCompanyTickers(testTicker);
      results.push({ ticker: testTicker, found });
      console.log(`   ${found ? '✅' : '❌'} ${found ? '성공' : '실패'}`);
    } catch (error) {
      console.log(`   ❌ 오류: ${error.message}`);
      results.push({ ticker: testTicker, found: false, error: error.message });
    }
    
    // API 호출 간격
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // 결과 요약
  console.log('\n📊 테스트 결과 요약');
  console.log('─'.repeat(50));
  
  const successful = results.filter(r => r.found);
  const failed = results.filter(r => !r.found);
  
  console.log(`✅ 성공: ${successful.length}/${results.length}`);
  console.log(`❌ 실패: ${failed.length}/${results.length}`);
  
  if (successful.length > 0) {
    console.log('\n✅ 성공한 티커들:');
    successful.forEach(r => {
      console.log(`   • ${r.ticker}`);
    });
  }
  
  if (failed.length > 0) {
    console.log('\n❌ 실패한 티커들:');
    failed.forEach(r => {
      console.log(`   • ${r.ticker}`);
    });
  }
}

// 메인 실행
async function main() {
  try {
    if (process.argv.includes('--multiple') || process.argv.includes('-m')) {
      await testMultipleTickers();
    } else {
      await testSECCompanyTickers(ticker);
    }
    
    console.log('\n🎉 테스트 완료!');
    
  } catch (error) {
    console.log('\n💥 테스트 실패:', error.message);
    process.exit(1);
  }
}

// 도움말 출력
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
🧪 SEC EDGAR CIK 조회 테스트 도구

사용법:
  node test-sec-edgar.js [ticker]

옵션:
  --multiple, -m     여러 티커 테스트
  --help, -h         도움말 표시

예시:
  node test-sec-edgar.js AAPL
  node test-sec-edgar.js TSLA
  node test-sec-edgar.js --multiple

기본값:
  티커: ${DEFAULT_TICKER}
`);
  process.exit(0);
}

main();

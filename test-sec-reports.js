#!/usr/bin/env node

/**
 * SEC EDGAR 보고서 조회 테스트 스크립트
 * 특정 티커의 10-K, 10-Q, 8-K 보고서를 모두 가져오는 기능을 테스트합니다.
 */

const BASE_URL = 'http://localhost:3000';

async function testSECReports(ticker, from, to) {
  console.log(`\n🔍 SEC EDGAR 보고서 조회 테스트`);
  console.log(`   티커: ${ticker}`);
  console.log(`   기간: ${from} ~ ${to}`);
  
  try {
    // SEC EDGAR 보고서 조회 API 호출 (직접 함수 호출)
    const { fetchAllSECReports } = await import('./lib/external/sec-edgar.ts');
    
    console.log(`\n📋 ${ticker}의 SEC EDGAR 보고서 조회 중...`);
    const reports = await fetchAllSECReports(ticker, from, to);
    
    console.log(`\n✅ 조회 완료: ${reports.length}개 보고서 발견`);
    
    if (reports.length > 0) {
      console.log(`\n📊 보고서 유형별 통계:`);
      const reportTypes = {};
      reports.forEach(report => {
        reportTypes[report.reportType] = (reportTypes[report.reportType] || 0) + 1;
      });
      
      Object.entries(reportTypes).forEach(([type, count]) => {
        console.log(`   ${type}: ${count}개`);
      });
      
      console.log(`\n📄 최근 보고서 5개:`);
      reports.slice(0, 5).forEach((report, index) => {
        console.log(`   ${index + 1}. ${report.reportType} - ${report.filingDate}`);
        console.log(`      회사: ${report.companyName}`);
        console.log(`      보고서 날짜: ${report.reportDate}`);
        console.log(`      접근번호: ${report.accessionNumber}`);
        console.log(`      XBRL: ${report.isXBRL ? 'Yes' : 'No'}`);
        console.log(`      크기: ${(report.size / 1024).toFixed(2)} KB`);
        console.log(`      URL: ${report.documentUrl}`);
        console.log('');
      });
      
      // 보고서 유형별 상세 정보
      console.log(`\n📋 보고서 유형별 상세 정보:`);
      ['10-K', '10-Q', '8-K'].forEach(type => {
        const typeReports = reports.filter(r => r.reportType === type);
        if (typeReports.length > 0) {
          console.log(`\n   ${type} 보고서 (${typeReports.length}개):`);
          typeReports.slice(0, 3).forEach((report, index) => {
            console.log(`     ${index + 1}. ${report.filingDate} - ${report.reportDate}`);
            console.log(`        접근번호: ${report.accessionNumber}`);
            console.log(`        크기: ${(report.size / 1024).toFixed(2)} KB`);
          });
        }
      });
      
    } else {
      console.log(`\n❌ ${ticker}에 대한 보고서를 찾을 수 없습니다.`);
    }
    
    return {
      success: true,
      ticker,
      from,
      to,
      reportCount: reports.length,
      reports: reports.slice(0, 10) // 처음 10개만 반환
    };
    
  } catch (error) {
    console.log(`\n❌ SEC EDGAR 보고서 조회 실패: ${error.message}`);
    return {
      success: false,
      ticker,
      from,
      to,
      error: error.message
    };
  }
}

async function runMultipleTests() {
  console.log(`🚀 SEC EDGAR 보고서 조회 다중 테스트 시작\n`);
  
  const testCases = [
    { description: 'Apple 2024년 보고서', ticker: 'AAPL', from: '2024-01-01', to: '2024-12-31' },
    { description: 'Microsoft 2023-2024년 보고서', ticker: 'MSFT', from: '2023-01-01', to: '2024-12-31' },
    { description: 'Google 2024년 보고서', ticker: 'GOOGL', from: '2024-01-01', to: '2024-12-31' },
    { description: 'Tesla 2024년 보고서', ticker: 'TSLA', from: '2024-01-01', to: '2024-12-31' },
  ];

  const results = [];
  
  for (const testCase of testCases) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔍 테스트: ${testCase.description}`);
    console.log(`   티커: ${testCase.ticker}, 기간: ${testCase.from} ~ ${testCase.to}`);
    
    try {
      const result = await testSECReports(testCase.ticker, testCase.from, testCase.to);
      results.push({ ...testCase, ...result });
      
      if (result.success) {
        console.log(`   ✅ 성공: ${result.reportCount}개 보고서 발견`);
      } else {
        console.log(`   ❌ 실패: ${result.error}`);
      }
    } catch (error) {
      console.log(`   ❌ 오류: ${error.message}`);
      results.push({ ...testCase, success: false, error: error.message });
    }
    
    // API 호출 간격 조절
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // 결과 요약
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 테스트 결과 요약`);
  console.log(`${'='.repeat(60)}`);
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`\n✅ 성공: ${successful.length}개`);
  successful.forEach(result => {
    console.log(`   ${result.ticker}: ${result.reportCount}개 보고서`);
  });
  
  if (failed.length > 0) {
    console.log(`\n❌ 실패: ${failed.length}개`);
    failed.forEach(result => {
      console.log(`   ${result.ticker}: ${result.error}`);
    });
  }
  
  const totalReports = successful.reduce((sum, r) => sum + (r.reportCount || 0), 0);
  console.log(`\n📈 총 보고서 수: ${totalReports}개`);
  
  return results;
}

// 메인 실행
async function main() {
  try {
    console.log(`🚀 SEC EDGAR 보고서 조회 테스트 시작`);
    console.log(`   서버: ${BASE_URL}`);
    console.log(`   시간: ${new Date().toISOString()}`);
    
    await runMultipleTests();
    
    console.log(`\n🎉 모든 테스트 완료!`);
    
  } catch (error) {
    console.error(`\n💥 테스트 실행 중 오류 발생:`, error);
    process.exit(1);
  }
}

// 스크립트 직접 실행 시
if (require.main === module) {
  main();
}

module.exports = { testSECReports, runMultipleTests };

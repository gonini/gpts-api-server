#!/usr/bin/env node

/**
 * SEC EDGAR 보고서 조회 API 테스트 스크립트
 * API 엔드포인트를 통해 SEC EDGAR 보고서 조회 기능을 테스트합니다.
 */

const BASE_URL = 'http://localhost:3000';

async function testSECReportsAPI(ticker, from, to) {
  console.log(`\n🔍 SEC EDGAR 보고서 조회 API 테스트`);
  console.log(`   티커: ${ticker}`);
  console.log(`   기간: ${from} ~ ${to}`);
  
  try {
    // SEC EDGAR 보고서 조회를 위한 API 엔드포인트 호출
    // (실제로는 analyze API를 통해 간접적으로 테스트)
    const url = `${BASE_URL}/api/analyze?ticker=${ticker}&from=${from}&to=${to}`;
    
    console.log(`\n📋 ${ticker}의 데이터 조회 중...`);
    console.log(`   URL: ${url}`);
    
    const startTime = Date.now();
    const response = await fetch(url);
    const responseTime = Date.now() - startTime;
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    console.log(`\n✅ 조회 완료: ${responseTime}ms`);
    console.log(`   성공: ${data.success}`);
    
    let secUrls = [];
    
    if (data.success && data.data) {
      console.log(`   티커: ${data.data.ticker}`);
      console.log(`   세그먼트 수: ${data.data.segments?.length || 0}`);
      console.log(`   기준일: ${data.data.as_of}`);
      
      // source_urls에서 SEC EDGAR 관련 URL 확인
      secUrls = data.data.segments?.flatMap(segment => 
        segment.source_urls?.filter(url => url.includes('sec.gov') || url.includes('edgar'))
      ) || [];
      
      if (secUrls.length > 0) {
        console.log(`\n📄 SEC EDGAR 관련 URL 발견: ${secUrls.length}개`);
        secUrls.slice(0, 3).forEach((url, index) => {
          console.log(`   ${index + 1}. ${url}`);
        });
      } else {
        console.log(`\n📄 SEC EDGAR 관련 URL 없음 (다른 데이터 소스 사용 중)`);
      }
      
      // notes에서 데이터 소스 정보 확인
      if (data.data.notes) {
        console.log(`\n📝 데이터 소스 정보:`);
        data.data.notes.forEach(note => {
          console.log(`   - ${note}`);
        });
      }
      
    } else {
      console.log(`\n❌ 데이터 조회 실패`);
    }
    
    return {
      success: data.success,
      ticker,
      from,
      to,
      responseTime,
      segments: data.data?.segments?.length || 0,
      secUrls: secUrls.length
    };
    
  } catch (error) {
    console.log(`\n❌ API 호출 실패: ${error.message}`);
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
  console.log(`🚀 SEC EDGAR 보고서 조회 API 다중 테스트 시작\n`);
  
  const testCases = [
    { description: 'Apple 2024년 데이터', ticker: 'AAPL', from: '2024-01-01', to: '2024-12-31' },
    { description: 'Microsoft 2023-2024년 데이터', ticker: 'MSFT', from: '2023-01-01', to: '2024-12-31' },
    { description: 'Google 2024년 데이터', ticker: 'GOOGL', from: '2024-01-01', to: '2024-12-31' },
    { description: 'Tesla 2024년 데이터', ticker: 'TSLA', from: '2024-01-01', to: '2024-12-31' },
  ];

  const results = [];
  
  for (const testCase of testCases) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔍 테스트: ${testCase.description}`);
    console.log(`   티커: ${testCase.ticker}, 기간: ${testCase.from} ~ ${testCase.to}`);
    
    try {
      const result = await testSECReportsAPI(testCase.ticker, testCase.from, testCase.to);
      results.push({ ...testCase, ...result });
      
      if (result.success) {
        console.log(`   ✅ 성공: ${result.segments}개 세그먼트, ${result.responseTime}ms`);
        if (result.secUrls > 0) {
          console.log(`   📄 SEC EDGAR URL: ${result.secUrls}개`);
        }
      } else {
        console.log(`   ❌ 실패: ${result.error}`);
      }
    } catch (error) {
      console.log(`   ❌ 오류: ${error.message}`);
      results.push({ ...testCase, success: false, error: error.message });
    }
    
    // API 호출 간격 조절
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // 결과 요약
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 테스트 결과 요약`);
  console.log(`${'='.repeat(60)}`);
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`\n✅ 성공: ${successful.length}개`);
  successful.forEach(result => {
    console.log(`   ${result.ticker}: ${result.segments}개 세그먼트, ${result.responseTime}ms`);
    if (result.secUrls > 0) {
      console.log(`     SEC EDGAR URL: ${result.secUrls}개`);
    }
  });
  
  if (failed.length > 0) {
    console.log(`\n❌ 실패: ${failed.length}개`);
    failed.forEach(result => {
      console.log(`   ${result.ticker}: ${result.error}`);
    });
  }
  
  const totalSegments = successful.reduce((sum, r) => sum + (r.segments || 0), 0);
  const totalSecUrls = successful.reduce((sum, r) => sum + (r.secUrls || 0), 0);
  const avgResponseTime = successful.length > 0 ? 
    Math.round(successful.reduce((sum, r) => sum + (r.responseTime || 0), 0) / successful.length) : 0;
  
  console.log(`\n📈 총 세그먼트 수: ${totalSegments}개`);
  console.log(`📈 총 SEC EDGAR URL: ${totalSecUrls}개`);
  console.log(`📈 평균 응답 시간: ${avgResponseTime}ms`);
  
  return results;
}

// 메인 실행
async function main() {
  try {
    console.log(`🚀 SEC EDGAR 보고서 조회 API 테스트 시작`);
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

module.exports = { testSECReportsAPI, runMultipleTests };

#!/usr/bin/env node

/**
 * 모든 API 엔드포인트 종합 테스트
 * 통합 후 기존 기능들이 정상 동작하는지 확인
 */

const BASE_URL = 'http://localhost:3000';

async function testHealthCheck() {
  console.log('🏥 Health Check API 테스트...');
  
  try {
    const response = await fetch(`${BASE_URL}/api/health`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('✅ Health Check 성공:', data);
    return true;
  } catch (error) {
    console.error('❌ Health Check 실패:', error.message);
    return false;
  }
}

async function testSECReportsAPI() {
  console.log('\n📊 SEC Reports API 테스트...');
  
  try {
    const response = await fetch(`${BASE_URL}/api/sec-reports?ticker=AAPL&from=2023-01-01&to=2023-12-31`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('✅ SEC Reports API 성공');
    console.log(`   성공: ${data.success}`);
    console.log(`   보고서 수: ${data.data?.reports?.length || 0}`);
    
    if (data.data?.reports && data.data.reports.length > 0) {
      const firstReport = data.data.reports[0];
      console.log(`   첫 번째 보고서: ${firstReport.form} (${firstReport.filed_at})`);
      console.log(`   회사: ${firstReport.company}`);
    }
    
    return true;
  } catch (error) {
    console.error('❌ SEC Reports API 실패:', error.message);
    return false;
  }
}

async function testAnalyzeAPI() {
  console.log('\n🔍 Analyze API 테스트...');
  
  try {
    const response = await fetch(`${BASE_URL}/api/analyze?ticker=AAPL&from=2023-01-01&to=2023-12-31`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('✅ Analyze API 성공');
    console.log(`   성공: ${data.success}`);
    console.log(`   티커: ${data.data?.ticker}`);
    console.log(`   세그먼트 수: ${data.data?.segments?.length || 0}`);
    
    if (data.data?.segments?.length === 0) {
      console.log(`   ⚠️  세그먼트가 0개 - Finnhub API 키 없음으로 인한 정상 동작`);
    }
    
    return true;
  } catch (error) {
    console.error('❌ Analyze API 실패:', error.message);
    return false;
  }
}

async function testEarningsCalendarAPI() {
  console.log('\n📈 Earnings Calendar API 테스트 (통합된 기능)...');
  
  try {
    const response = await fetch(`${BASE_URL}/api/earnings-calendar?ticker=AAPL&from=2023-01-01&to=2024-12-31`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('✅ Earnings Calendar API 성공');
    console.log(`   성공: ${data.success}`);
    console.log(`   실적 이벤트 수: ${data.data?.earningsCalendar?.length || 0}`);
    
    if (data.data?.earningsCalendar?.length > 0) {
      const firstEvent = data.data.earningsCalendar[0];
      console.log(`   첫 번째 이벤트: ${firstEvent.date} (Q${firstEvent.quarter} ${firstEvent.year})`);
      console.log(`   EPS: ${firstEvent.epsActual}, Revenue: ${firstEvent.revenueActual}`);
    }
    
    return true;
  } catch (error) {
    console.error('❌ Earnings Calendar API 실패:', error.message);
    return false;
  }
}

async function checkServer() {
  try {
    const response = await fetch(`${BASE_URL}/api/health`);
    return response.ok;
  } catch (error) {
    return false;
  }
}

async function runAllTests() {
  console.log('🚀 모든 API 엔드포인트 종합 테스트 시작\n');
  
  // 서버 상태 확인
  const serverRunning = await checkServer();
  if (!serverRunning) {
    console.log('❌ 서버가 실행되지 않았습니다.');
    console.log('   다음 명령어로 서버를 시작하세요: npm run dev');
    process.exit(1);
  }
  
  console.log('✅ 서버가 실행 중입니다.\n');
  
  // 각 API 테스트 실행
  const results = {
    health: await testHealthCheck(),
    secReports: await testSECReportsAPI(),
    analyze: await testAnalyzeAPI(),
    earningsCalendar: await testEarningsCalendarAPI()
  };
  
  // 결과 요약
  console.log('\n📊 테스트 결과 요약:');
  console.log('========================');
  
  const totalTests = Object.keys(results).length;
  const passedTests = Object.values(results).filter(Boolean).length;
  
  console.log(`✅ 통과: ${passedTests}/${totalTests}`);
  console.log(`❌ 실패: ${totalTests - passedTests}/${totalTests}`);
  
  // 상세 결과
  Object.entries(results).forEach(([test, passed]) => {
    const status = passed ? '✅' : '❌';
    const testName = {
      health: 'Health Check',
      secReports: 'SEC Reports',
      analyze: 'Analyze',
      earningsCalendar: 'Earnings Calendar'
    }[test];
    
    console.log(`${status} ${testName}`);
  });
  
  if (passedTests === totalTests) {
    console.log('\n🎉 모든 API 엔드포인트가 정상 동작합니다!');
    console.log('   통합 작업이 성공적으로 완료되었습니다.');
  } else {
    console.log('\n⚠️  일부 API에서 문제가 발견되었습니다.');
    console.log('   로그를 확인하여 문제를 해결하세요.');
  }
  
  return passedTests === totalTests;
}

// 메인 실행
runAllTests()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('💥 테스트 실행 중 오류 발생:', error);
    process.exit(1);
  });

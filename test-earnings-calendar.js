// test-earnings-calendar.js
// 통합된 earnings calendar API 테스트 (sec-edgar.ts 기반)

const BASE_URL = 'http://localhost:3000';

async function testEarningsCalendar() {
  console.log('🧪 Testing Integrated Earnings Calendar API (sec-edgar.ts)...\n');

  try {
    // Apple (AAPL) 실적 데이터 테스트
    console.log('📊 Testing AAPL earnings data with integrated SEC EDGAR...');
    const response = await fetch(`${BASE_URL}/api/earnings-calendar?ticker=AAPL&from=2023-01-01&to=2024-12-31`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('✅ Response received:');
    console.log(`   Success: ${data.success}`);
    console.log(`   Earnings Calendar entries: ${data.data?.earningsCalendar?.length || 0}`);
    
    if (data.data?.earningsCalendar?.length > 0) {
      const firstEntry = data.data.earningsCalendar[0];
      console.log('\n📈 Sample entry:');
      console.log(`   Symbol: ${firstEntry.symbol}`);
      console.log(`   Date: ${firstEntry.date}`);
      console.log(`   Quarter: Q${firstEntry.quarter} ${firstEntry.year}`);
      console.log(`   Hour: ${firstEntry.hour}`);
      console.log(`   EPS Actual: ${firstEntry.epsActual}`);
      console.log(`   EPS Estimate: ${firstEntry.epsEstimate}`);
      console.log(`   Revenue Actual: ${firstEntry.revenueActual}`);
      console.log(`   Revenue Estimate: ${firstEntry.revenueEstimate}`);
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.cause) {
      console.error('   Cause:', error.cause);
    }
  }
}

// 서버가 실행 중인지 확인
async function checkServer() {
  try {
    const response = await fetch(`${BASE_URL}/api/health`);
    if (response.ok) {
      console.log('✅ Server is running');
      return true;
    }
  } catch (error) {
    console.log('❌ Server is not running. Please start with: npm run dev');
    return false;
  }
}

async function main() {
  console.log('🚀 Integrated Earnings Calendar API Test (Duplication Resolved)\n');
  
  const serverRunning = await checkServer();
  if (!serverRunning) {
    process.exit(1);
  }
  
  await testEarningsCalendar();
}

main().catch(console.error);

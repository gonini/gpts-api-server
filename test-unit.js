#!/usr/bin/env node

/**
 * 단위 테스트 스크립트 - API 없이 로직만 테스트
 */

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

/**
 * Breakpoint 감지 로직 테스트
 */
function testBreakpointDetection() {
  console.log(`${colors.blue}🧪 Testing Breakpoint Detection Logic${colors.reset}\n`);
  
  // 테스트 데이터: 극단적인 EPS 변화가 있는 경우
  const testEarnings = [
    {
      date: '2024-12-31',
      when: 'unknown',
      eps: -6.67,
      revenue: 2800000000
    },
    {
      date: '2024-09-30', 
      when: 'unknown',
      eps: -4.15,
      revenue: 700000000
    },
    {
      date: '2024-06-30',
      when: 'unknown', 
      eps: 2.18,
      revenue: 650000000
    },
    {
      date: '2024-03-31',
      when: 'unknown',
      eps: -2.71,
      revenue: 600000000
    },
    {
      date: '2023-12-31',
      when: 'unknown',
      eps: -1.50,
      revenue: 3200000000
    },
    {
      date: '2023-09-30',
      when: 'unknown',
      eps: -0.80,
      revenue: 800000000
    },
    {
      date: '2023-06-30',
      when: 'unknown',
      eps: 1.20,
      revenue: 750000000
    },
    {
      date: '2023-03-31',
      when: 'unknown',
      eps: -0.50,
      revenue: 700000000
    }
  ];
  
  console.log(`${colors.cyan}📊 Test Data:${colors.reset}`);
  testEarnings.forEach((earning, index) => {
    console.log(`  ${index + 1}. ${earning.date}: EPS=${earning.eps}, Revenue=$${(earning.revenue / 1000000000).toFixed(1)}B`);
  });
  
  // YoY 계산 시뮬레이션
  console.log(`\n${colors.cyan}📈 YoY Calculations:${colors.reset}`);
  
  for (let i = 0; i < testEarnings.length - 4; i++) {
    const current = testEarnings[i];
    const previous = testEarnings[i + 4];
    
    if (current.eps !== null && previous.eps !== null && previous.eps !== 0) {
      const epsYoY = (current.eps / previous.eps) - 1;
      const epsYoYPercent = (epsYoY * 100).toFixed(1);
      
      console.log(`  ${current.date} vs ${previous.date}:`);
      console.log(`    EPS: ${current.eps} vs ${previous.eps} = ${epsYoYPercent}%`);
      
      if (Math.abs(epsYoY) >= 0.01) {
        console.log(`    ${colors.green}✅ BREAKPOINT DETECTED!${colors.reset}`);
      } else {
        console.log(`    ${colors.yellow}⚠️  No significant change${colors.reset}`);
      }
    }
    
    if (current.revenue !== null && previous.revenue !== null && previous.revenue !== 0) {
      const revYoY = (current.revenue / previous.revenue) - 1;
      const revYoYPercent = (revYoY * 100).toFixed(1);
      
      console.log(`    Revenue: $${(current.revenue / 1000000000).toFixed(1)}B vs $${(previous.revenue / 1000000000).toFixed(1)}B = ${revYoYPercent}%`);
      
      if (Math.abs(revYoY) >= 0.01) {
        console.log(`    ${colors.green}✅ REVENUE BREAKPOINT DETECTED!${colors.reset}`);
      } else {
        console.log(`    ${colors.yellow}⚠️  No significant revenue change${colors.reset}`);
      }
    }
    
    console.log('');
  }
}

/**
 * 데이터 매칭 테스트
 */
function testDataMatching() {
  console.log(`${colors.blue}🔗 Testing Data Matching Logic${colors.reset}\n`);
  
  // EPS 데이터 (Finnhub)
  const epsData = [
    { date: '2024-12-31', eps: -6.67 },
    { date: '2024-09-30', eps: -4.15 },
    { date: '2024-06-30', eps: 2.18 },
    { date: '2024-03-31', eps: -2.71 }
  ];
  
  // Revenue 데이터 (SEC EDGAR)
  const revenueData = [
    { date: '2024-12-31', revenue: 2800000000 },
    { date: '2024-09-30', revenue: 700000000 },
    { date: '2024-06-30', revenue: 650000000 },
    { date: '2024-03-31', revenue: 600000000 }
  ];
  
  console.log(`${colors.cyan}📊 EPS Data (Finnhub):${colors.reset}`);
  epsData.forEach(item => {
    console.log(`  ${item.date}: ${item.eps}`);
  });
  
  console.log(`\n${colors.cyan}💰 Revenue Data (SEC EDGAR):${colors.reset}`);
  revenueData.forEach(item => {
    console.log(`  ${item.date}: $${(item.revenue / 1000000000).toFixed(1)}B`);
  });
  
  // 데이터 매칭 시뮬레이션
  console.log(`\n${colors.cyan}🔗 Data Matching Results:${colors.reset}`);
  
  const matchedData = epsData.map(eps => {
    const matchingRevenue = revenueData.find(rev => rev.date === eps.date);
    return {
      date: eps.date,
      eps: eps.eps,
      revenue: matchingRevenue?.revenue || null
    };
  });
  
  matchedData.forEach(item => {
    console.log(`  ${item.date}: EPS=${item.eps}, Revenue=${item.revenue ? `$${(item.revenue / 1000000000).toFixed(1)}B` : 'N/A'}`);
  });
  
  const matchedCount = matchedData.filter(item => item.revenue !== null).length;
  console.log(`\n${colors.green}✅ Matched ${matchedCount}/${matchedData.length} records${colors.reset}`);
}

/**
 * 임계값 테스트
 */
function testThresholds() {
  console.log(`${colors.blue}📏 Testing Breakpoint Thresholds${colors.reset}\n`);
  
  const testCases = [
    { eps: 1.0, prevEps: 0.5, expected: true, description: '100% increase' },
    { eps: 1.0, prevEps: 0.99, expected: true, description: '1% increase' },
    { eps: 1.0, prevEps: 0.999, expected: false, description: '0.1% increase' },
    { eps: -1.0, prevEps: 1.0, expected: true, description: '200% decrease' },
    { eps: 0.0, prevEps: 1.0, expected: true, description: '100% decrease' }
  ];
  
  const threshold = 0.01; // 1%
  
  console.log(`${colors.cyan}📊 Test Cases (Threshold: ${threshold * 100}%):${colors.reset}`);
  
  testCases.forEach((testCase, index) => {
    const epsYoY = (testCase.eps / testCase.prevEps) - 1;
    const isBreakpoint = Math.abs(epsYoY) >= threshold;
    const status = isBreakpoint === testCase.expected ? '✅' : '❌';
    
    console.log(`  ${index + 1}. ${testCase.description}`);
    console.log(`     EPS: ${testCase.eps} vs ${testCase.prevEps} = ${(epsYoY * 100).toFixed(1)}%`);
    console.log(`     Expected: ${testCase.expected}, Got: ${isBreakpoint} ${status}`);
    console.log('');
  });
}

/**
 * 메인 테스트 실행
 */
function runUnitTests() {
  console.log(`${colors.bright}🧪 Unit Tests 시작${colors.reset}\n`);
  
  testBreakpointDetection();
  console.log('='.repeat(60) + '\n');
  
  testDataMatching();
  console.log('='.repeat(60) + '\n');
  
  testThresholds();
  console.log('='.repeat(60) + '\n');
  
  console.log(`${colors.green}✅ 모든 단위 테스트 완료! 🎉${colors.reset}`);
}

// 테스트 실행
if (require.main === module) {
  runUnitTests();
}

module.exports = {
  testBreakpointDetection,
  testDataMatching,
  testThresholds,
  runUnitTests
};

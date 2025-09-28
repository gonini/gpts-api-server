#!/usr/bin/env node

/**
 * Analyze API 엔드포인트 로컬 테스트 스크립트
 * 
 * 사용법:
 * node test-analyze.js
 * 
 * 또는 특정 티커 테스트:
 * node test-analyze.js NBR
 */

const http = require('http');

// 테스트 설정
const API_BASE_URL = 'http://localhost:3000';
const TEST_TICKERS = ['NBR', 'AAPL', 'TSLA', 'MSFT'];
const TEST_PERIODS = [
  { from: '2023-01-01', to: '2024-12-31', label: '최근 2년' },
  { from: '2024-01-01', to: '2024-12-31', label: '2024년' },
  { from: '2023-01-01', to: '2023-12-31', label: '2023년' }
];

// 색상 코드
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
 * HTTP 요청을 보내고 응답을 반환하는 헬퍼 함수
 */
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const requestOptions = {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    };

    const req = http.request(url, requestOptions, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsedData = JSON.parse(data);
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: parsedData
          });
        } catch (error) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: data,
            parseError: error.message
          });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }

    req.end();
  });
}

/**
 * Analyze API 테스트 함수
 */
async function testAnalyzeAPI(ticker, from, to) {
  const url = `${API_BASE_URL}/api/analyze`;
  const requestBody = { ticker, from, to };
  
  console.log(`${colors.cyan}📊 Testing ${ticker} (${from} ~ ${to})${colors.reset}`);
  
  try {
    const startTime = Date.now();
    const response = await makeRequest(url, {
      method: 'POST',
      body: requestBody
    });
    const endTime = Date.now();
    
    console.log(`${colors.blue}⏱️  Response time: ${endTime - startTime}ms${colors.reset}`);
    console.log(`${colors.blue}📈 Status: ${response.statusCode}${colors.reset}`);
    
    if (response.statusCode === 200) {
      const { data } = response.data;
      
      if (data.segments && data.segments.length > 0) {
        console.log(`${colors.green}✅ Breakpoints detected: ${data.segments.length}${colors.reset}`);
        
        data.segments.forEach((segment, index) => {
          console.log(`${colors.green}  📍 Segment ${index + 1}:${colors.reset}`);
          console.log(`     📅 Date: ${segment.earnings.date}`);
          console.log(`     💰 EPS: ${segment.earnings.eps}`);
          console.log(`     📊 Revenue: ${segment.earnings.revenue ? `$${(segment.earnings.revenue / 1000000000).toFixed(1)}B` : 'N/A'}`);
          console.log(`     📈 EPS YoY: ${segment.earnings.eps_yoy ? `${(segment.earnings.eps_yoy * 100).toFixed(1)}%` : 'N/A'}`);
          console.log(`     📈 Rev YoY: ${segment.earnings.rev_yoy ? `${(segment.earnings.rev_yoy * 100).toFixed(1)}%` : 'N/A'}`);
          console.log(`     🎯 CAR: ${segment.price_reaction.car.toFixed(4)}`);
        });
      } else {
        console.log(`${colors.yellow}⚠️  No breakpoints detected${colors.reset}`);
        if (data.notes) {
          console.log(`${colors.yellow}   Notes: ${data.notes.join(', ')}${colors.reset}`);
        }
      }
      
      return {
        success: true,
        ticker,
        segments: data.segments?.length || 0,
        responseTime: endTime - startTime
      };
    } else {
      console.log(`${colors.red}❌ Error: ${response.data.error || 'Unknown error'}${colors.reset}`);
      return {
        success: false,
        ticker,
        error: response.data.error,
        responseTime: endTime - startTime
      };
    }
  } catch (error) {
    console.log(`${colors.red}❌ Request failed: ${error.message}${colors.reset}`);
    return {
      success: false,
      ticker,
      error: error.message,
      responseTime: 0
    };
  }
}

/**
 * SEC EDGAR 테스트 함수
 */
async function testSECAPI(ticker, from, to) {
  const url = `${API_BASE_URL}/api/test-sec?ticker=${ticker}&from=${from}&to=${to}`;
  
  console.log(`${colors.magenta}🏛️  Testing SEC EDGAR for ${ticker}${colors.reset}`);
  
  try {
    const response = await makeRequest(url);
    
    if (response.statusCode === 200) {
      const { data } = response.data;
      console.log(`${colors.green}✅ SEC EDGAR data: ${data.revenueRecords} records${colors.reset}`);
      
      if (data.revenueData && data.revenueData.length > 0) {
        console.log(`${colors.green}   Sample revenue data:${colors.reset}`);
        data.revenueData.slice(0, 3).forEach(item => {
          console.log(`     📅 ${item.date}: $${(item.revenue / 1000000000).toFixed(1)}B`);
        });
      }
      
      return {
        success: true,
        ticker,
        revenueRecords: data.revenueRecords
      };
    } else {
      console.log(`${colors.red}❌ SEC EDGAR Error: ${response.data.error || 'Unknown error'}${colors.reset}`);
      return {
        success: false,
        ticker,
        error: response.data.error
      };
    }
  } catch (error) {
    console.log(`${colors.red}❌ SEC EDGAR Request failed: ${error.message}${colors.reset}`);
    return {
      success: false,
      ticker,
      error: error.message
    };
  }
}

/**
 * 헬스 체크 함수
 */
async function testHealthCheck() {
  const url = `${API_BASE_URL}/api/health`;
  
  console.log(`${colors.blue}🏥 Testing health check...${colors.reset}`);
  
  try {
    const response = await makeRequest(url);
    
    if (response.statusCode === 200) {
      console.log(`${colors.green}✅ Health check passed${colors.reset}`);
      console.log(`   Redis: ${response.data.data.redis ? '✅' : '❌'}`);
      return true;
    } else {
      console.log(`${colors.red}❌ Health check failed: ${response.statusCode}${colors.reset}`);
      return false;
    }
  } catch (error) {
    console.log(`${colors.red}❌ Health check request failed: ${error.message}${colors.reset}`);
    return false;
  }
}

/**
 * 메인 테스트 실행 함수
 */
async function runTests() {
  console.log(`${colors.bright}🚀 Analyze API 테스트 시작${colors.reset}\n`);
  
  // 헬스 체크
  const isHealthy = await testHealthCheck();
  if (!isHealthy) {
    console.log(`${colors.red}❌ 서버가 정상적으로 실행되지 않았습니다. 서버를 시작해주세요.${colors.reset}`);
    console.log(`${colors.yellow}   npm run dev${colors.reset}`);
    process.exit(1);
  }
  
  console.log('\n' + '='.repeat(60) + '\n');
  
  // 명령행 인수에서 티커 가져오기
  const targetTicker = process.argv[2];
  const tickersToTest = targetTicker ? [targetTicker] : TEST_TICKERS;
  
  const results = [];
  
  for (const ticker of tickersToTest) {
    console.log(`${colors.bright}📈 Testing ${ticker}${colors.reset}\n`);
    
    // SEC EDGAR 테스트
    const secResult = await testSECAPI(ticker, '2023-01-01', '2024-12-31');
    console.log('');
    
    // Analyze API 테스트
    for (const period of TEST_PERIODS) {
      const result = await testAnalyzeAPI(ticker, period.from, period.to);
      results.push({
        ...result,
        period: period.label
      });
      console.log('');
    }
    
    console.log('='.repeat(60) + '\n');
  }
  
  // 결과 요약
  console.log(`${colors.bright}📊 테스트 결과 요약${colors.reset}\n`);
  
  const successfulTests = results.filter(r => r.success);
  const failedTests = results.filter(r => !r.success);
  
  console.log(`${colors.green}✅ 성공: ${successfulTests.length}개${colors.reset}`);
  console.log(`${colors.red}❌ 실패: ${failedTests.length}개${colors.reset}`);
  
  if (successfulTests.length > 0) {
    console.log(`\n${colors.green}성공한 테스트:${colors.reset}`);
    successfulTests.forEach(result => {
      console.log(`  📈 ${result.ticker} (${result.period}): ${result.segments} breakpoints, ${result.responseTime}ms`);
    });
  }
  
  if (failedTests.length > 0) {
    console.log(`\n${colors.red}실패한 테스트:${colors.reset}`);
    failedTests.forEach(result => {
      console.log(`  ❌ ${result.ticker} (${result.period}): ${result.error}`);
    });
  }
  
  console.log(`\n${colors.cyan}테스트 완료! 🎉${colors.reset}`);
}

// 에러 핸들링
process.on('unhandledRejection', (reason, promise) => {
  console.error(`${colors.red}Unhandled Rejection at:${colors.reset}`, promise, `${colors.red}reason:${colors.reset}`, reason);
  process.exit(1);
});

// 테스트 실행
if (require.main === module) {
  runTests().catch(error => {
    console.error(`${colors.red}테스트 실행 중 오류 발생:${colors.reset}`, error);
    process.exit(1);
  });
}

module.exports = {
  testAnalyzeAPI,
  testSECAPI,
  testHealthCheck,
  runTests
};

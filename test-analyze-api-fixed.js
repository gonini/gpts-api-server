#!/usr/bin/env node

/**
 * Analyze API 로컬 테스트 스크립트 (수정된 버전)
 * 
 * 사용법:
 * node test-analyze-api-fixed.js [ticker] [from] [to]
 * 
 * 예시:
 * node test-analyze-api-fixed.js AAPL 2014-01-01 2016-12-31
 * node test-analyze-api-fixed.js MSFT 2020-01-01 2024-12-31
 */

const http = require('http');

// 기본값 설정
const DEFAULT_TICKER = 'AAPL';
const DEFAULT_FROM = '2014-01-01';
const DEFAULT_TO = '2016-12-31';
const DEFAULT_PORT = 3002;

// 명령행 인수 파싱
const args = process.argv.slice(2);
const ticker = args[0] || DEFAULT_TICKER;
const from = args[1] || DEFAULT_FROM;
const to = args[2] || DEFAULT_TO;
const port = args[3] || DEFAULT_PORT;

console.log('🧪 Analyze API 테스트 시작');
console.log(`📊 티커: ${ticker}`);
console.log(`📅 기간: ${from} ~ ${to}`);
console.log(`🌐 포트: ${port}`);
console.log('─'.repeat(50));

// API 요청 함수
function testAnalyzeAPI(customTicker = ticker, customFrom = from, customTo = to) {
  return new Promise((resolve, reject) => {
    const url = `http://localhost:${port}/api/analyze?ticker=${customTicker}&from=${customFrom}&to=${customTo}`;
    
    console.log(`🔗 요청 URL: ${url}`);
    console.log('⏳ 요청 중...');
    
    const startTime = Date.now();
    
    const req = http.get(url, (res) => {
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      
      console.log(`✅ 응답 상태: ${res.statusCode}`);
      console.log(`⏱️  응답 시간: ${responseTime}ms`);
      
      // 헤더 정보 출력
      console.log('📋 응답 헤더:');
      console.log(`   X-Provider: ${res.headers['x-provider'] || 'N/A'}`);
      console.log(`   X-RateLimit-Remaining: ${res.headers['x-ratelimit-remaining'] || 'N/A'}`);
      console.log(`   X-RateLimit-Reset: ${res.headers['x-ratelimit-reset'] || 'N/A'}`);
      
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          
          console.log('─'.repeat(50));
          console.log('📊 분석 결과:');
          
          if (jsonData.success) {
            const { ticker: responseTicker, as_of, segments, notes } = jsonData.data;
            
            console.log(`   티커: ${responseTicker}`);
            console.log(`   기준일: ${as_of}`);
            console.log(`   분석 세그먼트 수: ${segments.length}`);
            console.log(`   메모: ${notes.length}개`);
            
            if (segments.length > 0) {
              console.log('\n📈 주요 분석 세그먼트:');
              segments.slice(0, 3).forEach((segment, index) => {
                console.log(`   ${index + 1}. ${segment.label}`);
                console.log(`      실적: EPS YoY ${(segment.earnings.eps_yoy * 100).toFixed(1)}%, Rev YoY ${(segment.earnings.rev_yoy * 100).toFixed(1)}%`);
                console.log(`      주가반응: CAR ${(segment.price_reaction.car * 100).toFixed(2)}% (${segment.price_reaction.window})`);
                console.log(`      기간: ${segment.period.start} ~ ${segment.period.end}`);
                console.log(`      Day0: ${segment.day0}`);
                console.log('');
              });
              
              if (segments.length > 3) {
                console.log(`   ... 및 ${segments.length - 3}개 추가 세그먼트`);
              }
            } else {
              console.log('   ⚠️  분석 세그먼트가 없습니다.');
            }
            
            console.log('\n📝 메모:');
            notes.forEach(note => {
              console.log(`   • ${note}`);
            });
            
            // 성능 지표
            console.log('\n⚡ 성능 지표:');
            console.log(`   응답 시간: ${responseTime}ms`);
            console.log(`   데이터 크기: ${(data.length / 1024).toFixed(2)}KB`);
            console.log(`   세그먼트당 평균 처리시간: ${(responseTime / Math.max(segments.length, 1)).toFixed(2)}ms`);
            
          } else {
            console.log('❌ API 오류:');
            console.log(`   오류 코드: ${jsonData.error || 'Unknown'}`);
            console.log(`   메시지: ${jsonData.message || 'No message'}`);
          }
          
          resolve({
            success: jsonData.success,
            statusCode: res.statusCode,
            responseTime,
            dataSize: data.length,
            segments: jsonData.success ? jsonData.data.segments.length : 0
          });
          
        } catch (error) {
          console.log('❌ JSON 파싱 오류:', error.message);
          console.log('📄 원본 응답:');
          console.log(data.substring(0, 500) + (data.length > 500 ? '...' : ''));
          reject(error);
        }
      });
    });
    
    req.on('error', (error) => {
      console.log('❌ 요청 오류:', error.message);
      console.log('💡 서버가 실행 중인지 확인하세요:');
      console.log(`   FINNHUB_API_KEY=d3ce8g1r01qu125aq3h0d3ce8g1r01qu125aq3hg USE_FINNHUB_EARNINGS=true USE_FINNHUB_PRICES=false npm run dev -- --port ${port}`);
      reject(error);
    });
    
    req.setTimeout(30000, () => {
      console.log('⏰ 요청 시간 초과 (30초)');
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

// 여러 테스트 케이스 실행
async function runMultipleTests() {
  const testCases = [
    { ticker: 'AAPL', from: '2014-01-01', to: '2016-12-31', description: 'Apple 2014-2016' },
    { ticker: 'AAPL', from: '2020-01-01', to: '2024-12-31', description: 'Apple 2020-2024' },
    { ticker: 'MSFT', from: '2020-01-01', to: '2024-12-31', description: 'Microsoft 2020-2024' },
    { ticker: 'GOOGL', from: '2020-01-01', to: '2024-12-31', description: 'Google 2020-2024' }
  ];
  
  console.log('🧪 다중 테스트 케이스 실행');
  console.log('─'.repeat(50));
  
  const results = [];
  
  for (const testCase of testCases) {
    console.log(`\n🔍 테스트: ${testCase.description}`);
    console.log(`   티커: ${testCase.ticker}, 기간: ${testCase.from} ~ ${testCase.to}`);
    
    try {
      const result = await testAnalyzeAPI(testCase.ticker, testCase.from, testCase.to);
      results.push({ ...testCase, ...result });
      console.log(`   ✅ 성공: ${result.segments}개 세그먼트, ${result.responseTime}ms`);
    } catch (error) {
      console.log(`   ❌ 실패: ${error.message}`);
      results.push({ ...testCase, success: false, error: error.message });
    }
    
    // 테스트 간 간격
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // 결과 요약
  console.log('\n📊 테스트 결과 요약');
  console.log('─'.repeat(50));
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`✅ 성공: ${successful.length}/${results.length}`);
  console.log(`❌ 실패: ${failed.length}/${results.length}`);
  
  if (successful.length > 0) {
    const avgResponseTime = successful.reduce((sum, r) => sum + r.responseTime, 0) / successful.length;
    const totalSegments = successful.reduce((sum, r) => sum + r.segments, 0);
    
    console.log(`⏱️  평균 응답 시간: ${avgResponseTime.toFixed(2)}ms`);
    console.log(`📈 총 분석 세그먼트: ${totalSegments}개`);
  }
  
  if (failed.length > 0) {
    console.log('\n❌ 실패한 테스트:');
    failed.forEach(f => {
      console.log(`   • ${f.description}: ${f.error}`);
    });
  }
}

// 메인 실행
async function main() {
  try {
    if (process.argv.includes('--multiple') || process.argv.includes('-m')) {
      await runMultipleTests();
    } else {
      await testAnalyzeAPI();
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
🧪 Analyze API 테스트 도구

사용법:
  node test-analyze-api-fixed.js [ticker] [from] [to] [port]

옵션:
  --multiple, -m     여러 테스트 케이스 실행
  --help, -h         도움말 표시

예시:
  node test-analyze-api-fixed.js AAPL 2014-01-01 2016-12-31
  node test-analyze-api-fixed.js --multiple
  node test-analyze-api-fixed.js MSFT 2020-01-01 2024-12-31 3002

기본값:
  티커: ${DEFAULT_TICKER}
  기간: ${DEFAULT_FROM} ~ ${DEFAULT_TO}
  포트: ${DEFAULT_PORT}
`);
  process.exit(0);
}

main();

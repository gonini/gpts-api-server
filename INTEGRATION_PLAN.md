# 🔄 Earnings Calendar 통합 계획

## ✅ 통합 완료 상황

### 해소된 중복 사항들
1. **SEC EDGAR 처리**: ✅ `sec-edgar.ts`에 `fetchEarningsCalendar()` 통합
2. **Alpha Vantage API**: ✅ 기존 `yahoo-finance.ts`의 `fetchEarnings()` 활용
3. **Finnhub API**: ✅ 기존 `finnhub.ts`의 `fetchFinnhubEarnings()` 활용
4. **데이터 스키마**: ✅ `schema.ts`에 `EarningsCalendarRow` 통합
5. **중복 파일**: ✅ `earnings-calendar.ts` 삭제 완료

### 🎯 통합 전략

#### ✅ Phase 1: 즉시 수정 완료
- [x] 환경 변수 중복 제거 (`ALPHA_VANTAGE_API_KEY` vs `ALPHAVANTAGE_API_KEY`)
- [x] 캐시 키 네임스페이스 정리
- [x] API 엔드포인트 충돌 방지

#### ✅ Phase 2: 기능 통합 완료
- [x] `sec-edgar.ts`에 earnings calendar 기능 추가
- [x] 기존 `fetchAllSECReports` 확장하여 8-K Item 2.02 필터링
- [x] Exhibit 99 파싱 로직 통합

#### ✅ Phase 3: 코드 최적화 완료
- [x] 공통 유틸리티 함수 추출
- [x] 타입 정의 통합
- [x] 에러 처리 표준화

## 🚀 권장 구현 순서

### 1단계: 기존 코드 활용
```typescript
// lib/external/sec-edgar.ts 확장
export async function fetchEarningsCalendar(
  ticker: string,
  from: string, 
  to: string
): Promise<EarningsCalendarResponse> {
  // 기존 fetchAllSECReports 로직 재사용
  // 8-K Item 2.02만 필터링
  // Exhibit 99 파싱 추가
}
```

### 2단계: API 통합
```typescript
// app/api/earnings-calendar/route.ts 수정
import { fetchEarningsCalendar } from '@/lib/external/sec-edgar';
// earnings-calendar.ts 대신 sec-edgar.ts 사용
```

### 3단계: 중복 코드 제거
- `lib/external/earnings-calendar.ts` 삭제
- `app/api/earnings-calendar/route.ts` 수정

## ⚠️ 주의사항

1. **기존 API 호환성**: 현재 `/api/sec-reports` 엔드포인트 유지
2. **캐시 무효화**: 통합 시 기존 캐시 데이터 정리 필요
3. **테스트**: 통합 후 모든 기능 테스트 필수

## 📈 달성된 효과

- **코드 중복 제거**: ✅ ~500줄 코드 감소 (earnings-calendar.ts 삭제)
- **유지보수성 향상**: ✅ 단일 데이터 소스 관리 (sec-edgar.ts 통합)
- **성능 개선**: ✅ 캐시 효율성 증대 (통합된 캐시 키)
- **일관성 확보**: ✅ 통일된 데이터 스키마 (schema.ts 통합)

## 🎯 최종 결과

### 통합된 아키텍처
```
lib/external/sec-edgar.ts
├── fetchAllSECReports()      # 기존 기능
├── fetchEarningsCalendar()   # 새로 통합된 기능
└── mergeEstimates()          # Finnhub + Alpha Vantage 통합

app/api/earnings-calendar/route.ts
└── fetchEarningsCalendar()   # sec-edgar.ts 활용
```

### 제거된 중복
- ❌ `lib/external/earnings-calendar.ts` (삭제됨)
- ❌ 중복된 SEC EDGAR 처리 로직
- ❌ 중복된 Alpha Vantage API 호출
- ❌ 중복된 Finnhub API 호출
- ❌ 중복된 타입 정의

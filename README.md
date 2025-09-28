# GPTs API Server

Next.js(Edge) + Vercel KV(Redis) + Neon(Postgres)를 사용한 개인용 GPTs API 서버입니다.

## 🚀 배포 상태

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/gonini/gpts-api-server)

### 🌍 환경별 배포

- **프로덕션 (Production)**: `main` 브랜치 → 자동 배포
- **개발 (Development)**: `develop` 브랜치 → 자동 배포

**현재 배포된 URL**: 
- 프로덕션: https://gpts-api-server-ezvyvx1zv-goninis-projects.vercel.app
- 개발: 설정 필요 (Vercel에서 develop 브랜치 연결 후)

## 🌿 브랜치 전략

### Git Flow 전략
- **`main`**: 프로덕션 환경 (안정적인 코드)
- **`develop`**: 개발 환경 (새로운 기능 개발 및 테스트)

### 배포 자동화
- `main` 브랜치에 푸시 → 프로덕션 자동 배포
- `develop` 브랜치에 푸시 → 개발 환경 자동 배포

## 🚀 기능

- **Edge Runtime**: 빠른 응답을 위한 Vercel Edge Runtime 사용
- **Redis 캐싱**: Vercel KV를 통한 대화 및 세션 캐싱
- **미국 상장사 실적/주가 반응 분석 MVP**: Yahoo Finance (주가), Finnhub API (실적) 연동
- **SEC EDGAR 통합**: 무료 Revenue 데이터 제공
- **OpenAI 통합**: GPT API를 통한 AI 채팅 기능
- **Rate Limiting**: API 사용량 제한
- **사용자 관리**: 사용자 및 대화 세션 관리
- **무제한 주가 데이터**: Yahoo Finance API (rate limit 없음)

## 🧪 테스트

### 로컬 테스트 실행

```bash
# 전체 테스트 (모든 티커)
node test-analyze.js

# 특정 티커 테스트
node test-analyze.js NBR

# 단위 테스트 (API 없이 로직만)
node test-unit.js
```

### 테스트 결과 예시

```
🚀 Analyze API 테스트 시작

🏥 Testing health check...
✅ Health check passed
   Redis: ✅

📈 Testing NBR
🏛️  Testing SEC EDGAR for NBR
✅ SEC EDGAR data: 8 records
   Sample revenue data:
     📅 2024-12-31: $2.8B
     📅 2024-09-30: $0.7B

📊 Testing NBR (2023-01-01 ~ 2024-12-31)
⏱️  Response time: 859ms
📈 Status: 200
⚠️  No breakpoints detected
   Notes: No significant earnings breakpoints detected
```

## 📋 API 엔드포인트

### 1. 채팅 API
```
POST /api/chat
```
GPT와의 채팅을 위한 메인 엔드포인트

**요청 본문:**
```json
{
  "userId": "user123",
  "message": "안녕하세요!",
  "conversationId": 1,
  "model": "gpt-3.5-turbo",
  "temperature": 0.7,
  "maxTokens": 1000
}
```

**응답:**
```json
{
  "success": true,
  "message": "Chat response generated successfully",
  "data": {
    "conversationId": 1,
    "messageId": 123,
    "response": "안녕하세요! 무엇을 도와드릴까요?",
    "usage": {
      "promptTokens": 10,
      "completionTokens": 15,
      "totalTokens": 25
    }
  }
}
```

### 2. 사용자 관리
```
POST /api/users - 사용자 생성
GET /api/users?userId=user123 - 사용자 조회
```

### 3. 대화 관리
```
POST /api/conversations - 새 대화 생성
GET /api/conversations?userId=user123 - 사용자 대화 목록
GET /api/conversations/[id]/messages - 특정 대화의 메시지 조회
```

### 4. 분석 API
```
POST /api/analyze - 미국 상장사 실적/주가 반응 분석
```

**요청 본문:**
```json
{
  "ticker": "NBR",
  "from": "2023-01-01",
  "to": "2024-12-31"
}
```

**응답:**
```json
{
  "success": true,
  "data": {
    "ticker": "NBR",
    "as_of": "2025-09-28",
    "segments": [
      {
        "label": "2024-12-31 EPS YoY 344% Rev YoY -12%",
        "earnings": {
          "date": "2024-12-31",
          "when": "unknown",
          "eps": -6.67,
          "eps_yoy": 3.447,
          "rev_yoy": -0.125
        },
        "period": {
          "start": "2024-12-30",
          "end": "2025-01-05"
        },
        "price_reaction": {
          "window": "[-1,+5]",
          "car": 0.0234,
          "ret_sum": 0.0456,
          "bench_sum": 0.0222
        },
        "source_urls": [
          "polygon://v2/aggs/ticker/NBR/range/1/day/2023-01-01/2024-12-31",
          "finnhub://stock/earnings?symbol=NBR"
        ]
      }
    ],
    "notes": [
      "price_TTL=60m",
      "fund_TTL=72h",
      "assume_AMC_if_unknown",
      "timestamps=ET; adjustedClose=true"
    ]
  }
}
```

### 5. SEC EDGAR 테스트
```
GET /api/test-sec?ticker=NBR&from=2023-01-01&to=2024-12-31 - SEC EDGAR Revenue 데이터 테스트
```

### 6. 헬스 체크
```
GET /api/health - 서비스 상태 확인
```

## 🛠️ 설치 및 설정

### 1. 의존성 설치
```bash
npm install
```

### 2. 환경 변수 설정
`env.example` 파일을 참고하여 `.env.local` 파일을 생성하고 다음 변수들을 설정하세요:

```bash
# Redis 설정 - Vercel에서 자동 생성됨
REDIS_URL=redis://username:password@host:port

# 외부 API 키 (필수)
FINNHUB_API_KEY=your_finnhub_api_key

# 대안 API 키들 (선택사항)
POLYGON_API_KEY=your_polygon_api_key
ALPHA_VANTAGE_API_KEY=your_alpha_vantage_api_key
IEX_CLOUD_API_KEY=your_iex_cloud_api_key

# OpenAI API 설정
OPENAI_API_KEY=your_openai_api_key

# API 보안 설정
API_SECRET_KEY=your_secret_key_for_api_authentication
```

**참고**: 
- Yahoo Finance API는 무료이고 rate limit이 없으므로 주가 데이터용 API 키가 필요하지 않습니다.
- Finnhub API는 실적 데이터용으로 무료 티어가 제공됩니다 (월 60회 호출 제한).

### 3. 데이터베이스 초기화
```bash
npm run dev
```
서버 시작 시 자동으로 데이터베이스 스키마가 초기화됩니다.

## 🚀 Vercel 배포

### 1. Vercel CLI 설치
```bash
npm i -g vercel
```

### 2. 프로젝트 배포
```bash
vercel
```

### 3. 환경 변수 설정
Vercel 대시보드에서 다음 환경 변수들을 설정하세요:
- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`
- `KV_REST_API_READ_ONLY_TOKEN`
- `DATABASE_URL`
- `OPENAI_API_KEY`
- `API_SECRET_KEY`

## 📊 데이터베이스 스키마

### Users 테이블
- `id`: 기본키
- `user_id`: 사용자 고유 ID
- `name`: 사용자 이름
- `email`: 이메일
- `created_at`, `updated_at`: 타임스탬프

### Conversations 테이블
- `id`: 기본키
- `user_id`: 사용자 ID (외래키)
- `session_id`: 세션 고유 ID
- `title`: 대화 제목
- `created_at`, `updated_at`: 타임스탬프

### Messages 테이블
- `id`: 기본키
- `conversation_id`: 대화 ID (외래키)
- `role`: 메시지 역할 (user/assistant/system)
- `content`: 메시지 내용
- `metadata`: 추가 메타데이터 (JSON)
- `created_at`: 생성 시간

### API Usage 테이블
- `id`: 기본키
- `user_id`: 사용자 ID (외래키)
- `endpoint`: API 엔드포인트
- `request_count`: 요청 횟수
- `last_request_at`: 마지막 요청 시간
- `created_at`: 생성 시간

## 🔧 개발

### 로컬 개발 서버 실행
```bash
npm run dev
```

### 빌드
```bash
npm run build
```

### 린팅
```bash
npm run lint
```

## 📝 사용 예시

### GPTs에서 API 호출하기

1. **사용자 생성**
```javascript
const response = await fetch('https://your-api.vercel.app/api/users', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    userId: 'user123',
    name: '홍길동',
    email: 'hong@example.com'
  })
});
```

2. **채팅 요청**
```javascript
const response = await fetch('https://your-api.vercel.app/api/chat', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    userId: 'user123',
    message: '안녕하세요! 오늘 날씨가 어떤가요?',
    model: 'gpt-3.5-turbo',
    temperature: 0.7
  })
});

const data = await response.json();
console.log(data.data.response); // AI 응답
```

## 🔒 보안 고려사항

- API 키 보안: 환경 변수를 통한 안전한 키 관리
- Rate Limiting: 사용자별 API 호출 제한
- 입력 검증: Zod를 통한 요청 데이터 검증
- 에러 처리: 적절한 에러 메시지 및 상태 코드 반환

## 📈 성능 최적화

- **Redis 캐싱**: 자주 조회되는 데이터 캐싱
- **Edge Runtime**: 전 세계 엣지 서버에서 빠른 응답
- **Connection Pooling**: 데이터베이스 연결 최적화
- **Rate Limiting**: 서비스 안정성 보장

## 🤝 기여하기

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

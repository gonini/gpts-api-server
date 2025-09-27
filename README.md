# GPTs API Server

Next.js(Edge) + Vercel KV(Redis) + Neon(Postgres)를 사용한 개인용 GPTs API 서버입니다.

## 🚀 배포 상태

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/goninis-projects/gpts-api-server)

**현재 배포된 URL**: https://gpts-api-server-ezvyvx1zv-goninis-projects.vercel.app

## 🚀 기능

- **Edge Runtime**: 빠른 응답을 위한 Vercel Edge Runtime 사용
- **Redis 캐싱**: Vercel KV를 통한 대화 및 세션 캐싱
- **PostgreSQL**: Neon Database를 통한 영구 데이터 저장
- **OpenAI 통합**: GPT API를 통한 AI 채팅 기능
- **Rate Limiting**: API 사용량 제한
- **사용자 관리**: 사용자 및 대화 세션 관리

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

### 4. 헬스 체크
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
# Vercel KV (Redis) 설정
KV_REST_API_URL=your_kv_rest_api_url
KV_REST_API_TOKEN=your_kv_rest_api_token
KV_REST_API_READ_ONLY_TOKEN=your_kv_read_only_token

# Neon Database (Postgres) 설정
DATABASE_URL=postgresql://username:password@hostname/database

# OpenAI API 설정
OPENAI_API_KEY=your_openai_api_key

# API 보안 설정
API_SECRET_KEY=your_secret_key_for_api_authentication
```

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

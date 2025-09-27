import { neon } from '@neondatabase/serverless';

// 환경 변수가 없을 때는 더미 연결을 생성
const databaseUrl = process.env.DATABASE_URL || 'postgresql://dummy:dummy@dummy/dummy';
export const sql = neon(databaseUrl);

// 데이터베이스 스키마 초기화
export async function initializeDatabase() {
  try {
    // 사용자 테이블
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255),
        email VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // 대화 세션 테이블
    await sql`
      CREATE TABLE IF NOT EXISTS conversations (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        session_id VARCHAR(255) UNIQUE NOT NULL,
        title VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(user_id)
      )
    `;

    // 메시지 테이블
    await sql`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER NOT NULL,
        role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id)
      )
    `;

    // API 사용량 추적 테이블
    await sql`
      CREATE TABLE IF NOT EXISTS api_usage (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        endpoint VARCHAR(255) NOT NULL,
        request_count INTEGER DEFAULT 1,
        last_request_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(user_id)
      )
    `;

    console.log('Database schema initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
}

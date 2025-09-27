import { kv } from '@vercel/kv';

// Redis 캐시 헬퍼 함수들
export class CacheService {
  // 사용자 세션 캐시
  static async setUserSession(userId: string, sessionData: any, ttl: number = 3600) {
    const key = `user:${userId}:session`;
    await kv.setex(key, ttl, JSON.stringify(sessionData));
  }

  static async getUserSession(userId: string) {
    const key = `user:${userId}:session`;
    const data = await kv.get(key);
    return data ? JSON.parse(data as string) : null;
  }

  // 대화 캐시
  static async setConversationCache(conversationId: string, messages: any[], ttl: number = 1800) {
    const key = `conversation:${conversationId}`;
    await kv.setex(key, ttl, JSON.stringify(messages));
  }

  static async getConversationCache(conversationId: string) {
    const key = `conversation:${conversationId}`;
    const data = await kv.get(key);
    return data ? JSON.parse(data as string) : null;
  }

  // API 요청 제한
  static async checkRateLimit(userId: string, limit: number = 100, window: number = 3600) {
    const key = `rate_limit:${userId}`;
    const current = await kv.get(key);
    
    if (current === null) {
      await kv.setex(key, window, 1);
      return { allowed: true, remaining: limit - 1 };
    }
    
    const count = parseInt(current as string);
    if (count >= limit) {
      return { allowed: false, remaining: 0 };
    }
    
    await kv.incr(key);
    return { allowed: true, remaining: limit - count - 1 };
  }

  // 캐시 삭제
  static async clearUserCache(userId: string) {
    const patterns = [`user:${userId}:*`, `conversation:*:${userId}*`];
    
    for (const pattern of patterns) {
      const keys = await kv.keys(pattern);
      if (keys.length > 0) {
        await kv.del(...keys);
      }
    }
  }

  // Redis 연결 테스트
  static async ping() {
    return await kv.ping();
  }
}

// Vercel KV 호환성을 위한 export
export { kv };
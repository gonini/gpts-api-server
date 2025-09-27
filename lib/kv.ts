// Redis URL을 사용한 간단한 캐시 구현
// Vercel에서 제공하는 REDIS_URL을 활용

// 메모리 캐시 (Redis 대신 사용)
class MemoryCache {
  private cache = new Map<string, { data: any; expires: number }>();

  set(key: string, value: any, ttl: number = 3600) {
    const expires = Date.now() + (ttl * 1000);
    this.cache.set(key, { data: value, expires });
  }

  get(key: string) {
    const item = this.cache.get(key);
    if (item && item.expires > Date.now()) {
      return item.data;
    }
    if (item) {
      this.cache.delete(key);
    }
    return null;
  }

  del(key: string) {
    return this.cache.delete(key);
  }

  keys(pattern: string) {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    return Array.from(this.cache.keys()).filter(key => regex.test(key));
  }

  incr(key: string) {
    const current = this.get(key);
    const newValue = (current ? parseInt(current) : 0) + 1;
    this.set(key, newValue.toString());
    return newValue;
  }

  ping() {
    return 'PONG';
  }
}

// 전역 메모리 캐시 인스턴스
const memoryCache = new MemoryCache();

// Redis 캐시 헬퍼 함수들
export class CacheService {
  // 사용자 세션 캐시
  static async setUserSession(userId: string, sessionData: any, ttl: number = 3600) {
    const key = `user:${userId}:session`;
    memoryCache.set(key, JSON.stringify(sessionData), ttl);
  }

  static async getUserSession(userId: string) {
    const key = `user:${userId}:session`;
    const data = memoryCache.get(key);
    return data ? JSON.parse(data) : null;
  }

  // 대화 캐시
  static async setConversationCache(conversationId: string, messages: any[], ttl: number = 1800) {
    const key = `conversation:${conversationId}`;
    memoryCache.set(key, JSON.stringify(messages), ttl);
  }

  static async getConversationCache(conversationId: string) {
    const key = `conversation:${conversationId}`;
    const data = memoryCache.get(key);
    return data ? JSON.parse(data) : null;
  }

  // API 요청 제한
  static async checkRateLimit(userId: string, limit: number = 100, window: number = 3600) {
    const key = `rate_limit:${userId}`;
    const current = memoryCache.get(key);
    
    if (current === null) {
      memoryCache.set(key, '1', window);
      return { allowed: true, remaining: limit - 1 };
    }
    
    const count = parseInt(current);
    if (count >= limit) {
      return { allowed: false, remaining: 0 };
    }
    
    memoryCache.incr(key);
    return { allowed: true, remaining: limit - count - 1 };
  }

  // 캐시 삭제
  static async clearUserCache(userId: string) {
    const patterns = [`user:${userId}:*`, `conversation:*:${userId}*`];
    
    for (const pattern of patterns) {
      const keys = memoryCache.keys(pattern);
      for (const key of keys) {
        memoryCache.del(key);
      }
    }
  }

  // Redis 연결 테스트
  static async ping() {
    return memoryCache.ping();
  }
}

// Vercel KV 호환성을 위한 export (더미 객체)
export const kv = {
  get: (key: string) => memoryCache.get(key),
  set: (key: string, value: string) => memoryCache.set(key, value),
  setex: (key: string, ttl: number, value: string) => memoryCache.set(key, value, ttl),
  del: (key: string) => memoryCache.del(key),
  keys: (pattern: string) => memoryCache.keys(pattern),
  incr: (key: string) => memoryCache.incr(key),
  ping: () => memoryCache.ping(),
};
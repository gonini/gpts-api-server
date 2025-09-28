import { CacheService } from '@/lib/kv';

export class RateLimiter {
  private static readonly WINDOW_SIZE = 60; // 60초
  private static readonly MAX_REQUESTS = 60; // 분당 60회

  static async checkRateLimit(ip: string): Promise<{ allowed: boolean; remaining: number }> {
    const key = `rate_limit:${ip}`;
    
    try {
      const current = await CacheService.getUserSession(key);
      
      if (!current) {
        // 첫 요청
        await CacheService.setUserSession(key, { count: 1, resetTime: Date.now() + this.WINDOW_SIZE * 1000 }, this.WINDOW_SIZE);
        return { allowed: true, remaining: this.MAX_REQUESTS - 1 };
      }
      
      const now = Date.now();
      if (now > current.resetTime) {
        // 윈도우 리셋
        await CacheService.setUserSession(key, { count: 1, resetTime: now + this.WINDOW_SIZE * 1000 }, this.WINDOW_SIZE);
        return { allowed: true, remaining: this.MAX_REQUESTS - 1 };
      }
      
      if (current.count >= this.MAX_REQUESTS) {
        return { allowed: false, remaining: 0 };
      }
      
      // 카운트 증가
      await CacheService.setUserSession(key, { 
        count: current.count + 1, 
        resetTime: current.resetTime 
      }, Math.ceil((current.resetTime - now) / 1000));
      
      return { allowed: true, remaining: this.MAX_REQUESTS - current.count - 1 };
    } catch (error) {
      console.error('Rate limit check failed:', error);
      // 실패시 허용
      return { allowed: true, remaining: this.MAX_REQUESTS };
    }
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { kv } from '@/lib/kv';

export const runtime = 'edge';

// 헬스 체크 엔드포인트
export async function GET(request: NextRequest) {
  try {
    const checks = {
      redis: false,
      timestamp: new Date().toISOString(),
    };

    // Redis 연결 확인
    try {
      await kv.ping();
      checks.redis = true;
    } catch (error) {
      console.error('Redis health check failed:', error);
    }

    const isHealthy = checks.redis;
    const status = isHealthy ? 200 : 503;

    return NextResponse.json({
      success: isHealthy,
      message: isHealthy ? 'All services are healthy' : 'Some services are unhealthy',
      data: checks,
    }, { status });

  } catch (error) {
    console.error('Health check error:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Health check failed',
      data: {
        redis: false,
        timestamp: new Date().toISOString(),
      },
    }, { status: 503 });
  }
}

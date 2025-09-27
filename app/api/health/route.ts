import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/database';
import { kv } from '@/lib/kv';

export const runtime = 'edge';

// 헬스 체크 엔드포인트
export async function GET(request: NextRequest) {
  try {
    const checks = {
      database: false,
      redis: false,
      timestamp: new Date().toISOString(),
    };

    // 데이터베이스 연결 확인
    try {
      await sql`SELECT 1`;
      checks.database = true;
    } catch (error) {
      console.error('Database health check failed:', error);
    }

    // Redis 연결 확인
    try {
      await kv.ping();
      checks.redis = true;
    } catch (error) {
      console.error('Redis health check failed:', error);
    }

    const isHealthy = checks.database && checks.redis;
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
        database: false,
        redis: false,
        timestamp: new Date().toISOString(),
      },
    }, { status: 503 });
  }
}

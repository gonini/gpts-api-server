import { NextRequest, NextResponse } from 'next/server';
import { CacheService } from '@/lib/kv';
import { CreateUserSchema } from '@/lib/validation';

export const runtime = 'edge';

// 사용자 생성
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = CreateUserSchema.parse(body);

    const { userId, name, email } = validatedData;

    // 사용자 존재 여부 확인 (Redis에서)
    const existingUser = await CacheService.getUserSession(userId);

    if (existingUser) {
      return NextResponse.json({
        success: false,
        error: 'User already exists',
      }, { status: 409 });
    }

    // 새 사용자 데이터 생성
    const newUser = {
      id: Date.now(), // 간단한 ID 생성
      userId,
      name: name || null,
      email: email || null,
      createdAt: new Date().toISOString(),
    };

    // 사용자 세션 캐시 설정
    await CacheService.setUserSession(userId, newUser);

    return NextResponse.json({
      success: true,
      message: 'User created successfully',
      data: newUser,
    });

  } catch (error) {
    console.error('Create User Error:', error);
    
    if (error instanceof Error) {
      return NextResponse.json({
        success: false,
        error: error.message,
      }, { status: 400 });
    }

    return NextResponse.json({
      success: false,
      error: 'Internal server error',
    }, { status: 500 });
  }
}

// 사용자 조회
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({
        success: false,
        error: 'userId parameter is required',
      }, { status: 400 });
    }

    // Redis에서 사용자 데이터 조회
    const userData = await CacheService.getUserSession(userId);
    
    if (!userData) {
      return NextResponse.json({
        success: false,
        error: 'User not found',
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: userData,
    });

  } catch (error) {
    console.error('Get User Error:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
    }, { status: 500 });
  }
}
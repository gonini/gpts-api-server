import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/database';
import { CacheService } from '@/lib/kv';
import { CreateUserSchema } from '@/lib/validation';

export const runtime = 'edge';

// 사용자 생성
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = CreateUserSchema.parse(body);

    const { userId, name, email } = validatedData;

    // 사용자 존재 여부 확인
    const existingUser = await sql`
      SELECT id FROM users WHERE user_id = ${userId}
    `;

    if (existingUser.length > 0) {
      return NextResponse.json({
        success: false,
        error: 'User already exists',
      }, { status: 409 });
    }

    // 새 사용자 생성
    const newUser = await sql`
      INSERT INTO users (user_id, name, email)
      VALUES (${userId}, ${name || null}, ${email || null})
      RETURNING id, user_id, name, email, created_at
    `;

    // 사용자 세션 캐시 설정
    await CacheService.setUserSession(userId, {
      id: newUser[0].id,
      userId: newUser[0].user_id,
      name: newUser[0].name,
      email: newUser[0].email,
    });

    return NextResponse.json({
      success: true,
      message: 'User created successfully',
      data: newUser[0],
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

    // 캐시에서 먼저 확인
    let userData = await CacheService.getUserSession(userId);
    
    if (!userData) {
      const user = await sql`
        SELECT id, user_id, name, email, created_at, updated_at
        FROM users
        WHERE user_id = ${userId}
      `;

      if (user.length === 0) {
        return NextResponse.json({
          success: false,
          error: 'User not found',
        }, { status: 404 });
      }

      userData = user[0];
      await CacheService.setUserSession(userId, userData);
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

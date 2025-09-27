import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/database';
import { CreateConversationSchema } from '@/lib/validation';

export const runtime = 'edge';

// 대화 생성
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = CreateConversationSchema.parse(body);

    const { userId, title } = validatedData;

    // 사용자 존재 여부 확인
    const user = await sql`
      SELECT id FROM users WHERE user_id = ${userId}
    `;

    if (user.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'User not found',
      }, { status: 404 });
    }

    // 새 대화 생성
    const newConversation = await sql`
      INSERT INTO conversations (user_id, session_id, title)
      VALUES (${userId}, ${crypto.randomUUID()}, ${title || 'New Conversation'})
      RETURNING id, user_id, session_id, title, created_at
    `;

    return NextResponse.json({
      success: true,
      message: 'Conversation created successfully',
      data: newConversation[0],
    });

  } catch (error) {
    console.error('Create Conversation Error:', error);
    
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

// 사용자의 대화 목록 조회
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    if (!userId) {
      return NextResponse.json({
        success: false,
        error: 'userId parameter is required',
      }, { status: 400 });
    }

    // 사용자 존재 여부 확인
    const user = await sql`
      SELECT id FROM users WHERE user_id = ${userId}
    `;

    if (user.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'User not found',
      }, { status: 404 });
    }

    // 대화 목록 조회
    const conversations = await sql`
      SELECT 
        c.id,
        c.user_id,
        c.session_id,
        c.title,
        c.created_at,
        c.updated_at,
        COUNT(m.id) as message_count
      FROM conversations c
      LEFT JOIN messages m ON c.id = m.conversation_id
      WHERE c.user_id = ${userId}
      GROUP BY c.id, c.user_id, c.session_id, c.title, c.created_at, c.updated_at
      ORDER BY c.updated_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    return NextResponse.json({
      success: true,
      data: conversations,
    });

  } catch (error) {
    console.error('Get Conversations Error:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
    }, { status: 500 });
  }
}

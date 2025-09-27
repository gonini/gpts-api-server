import { NextRequest, NextResponse } from 'next/server';
import { CacheService } from '@/lib/kv';
import { CreateConversationSchema } from '@/lib/validation';

export const runtime = 'edge';

// 대화 생성
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = CreateConversationSchema.parse(body);

    const { userId, title } = validatedData;

    // 사용자 존재 여부 확인 (Redis에서)
    const user = await CacheService.getUserSession(userId);

    if (!user) {
      return NextResponse.json({
        success: false,
        error: 'User not found',
      }, { status: 404 });
    }

    // 새 대화 생성
    const conversationId = Date.now();
    const newConversation = {
      id: conversationId,
      userId,
      sessionId: crypto.randomUUID(),
      title: title || 'New Conversation',
      createdAt: new Date().toISOString(),
    };

    // 대화를 Redis에 저장
    await CacheService.setConversationCache(conversationId.toString(), []);

    return NextResponse.json({
      success: true,
      message: 'Conversation created successfully',
      data: newConversation,
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

    // 사용자 존재 여부 확인 (Redis에서)
    const user = await CacheService.getUserSession(userId);

    if (!user) {
      return NextResponse.json({
        success: false,
        error: 'User not found',
      }, { status: 404 });
    }

    // Redis에서 대화 목록 조회 (간단한 구현)
    // 실제로는 Redis에서 대화 목록을 관리하는 로직이 필요합니다
    const conversations: any[] = [];

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
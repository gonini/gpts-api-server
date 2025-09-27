import { NextRequest, NextResponse } from 'next/server';
import { CacheService } from '@/lib/kv';

export const runtime = 'edge';

// 특정 대화의 메시지 조회
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const conversationId = params.id;
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    if (!conversationId) {
      return NextResponse.json({
        success: false,
        error: 'Invalid conversation ID',
      }, { status: 400 });
    }

    // Redis에서 메시지 조회
    const messages = await CacheService.getConversationCache(conversationId);
    
    if (!messages) {
      return NextResponse.json({
        success: false,
        error: 'Conversation not found',
      }, { status: 404 });
    }

    // 페이지네이션 적용
    const paginatedMessages = messages.slice(offset, offset + limit);

    return NextResponse.json({
      success: true,
      data: {
        conversation: {
          id: conversationId,
          title: 'Conversation',
        },
        messages: paginatedMessages,
      },
    });

  } catch (error) {
    console.error('Get Messages Error:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
    }, { status: 500 });
  }
}
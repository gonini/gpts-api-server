import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/database';
import { CacheService } from '@/lib/kv';

export const runtime = 'edge';

// 특정 대화의 메시지 조회
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const conversationId = parseInt(params.id);
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    if (isNaN(conversationId)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid conversation ID',
      }, { status: 400 });
    }

    // 대화 존재 여부 확인
    const conversation = await sql`
      SELECT id, user_id, title FROM conversations WHERE id = ${conversationId}
    `;

    if (conversation.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Conversation not found',
      }, { status: 404 });
    }

    // 캐시에서 메시지 확인
    let messages = await CacheService.getConversationCache(conversationId.toString());
    
    if (!messages) {
      // DB에서 메시지 조회
      messages = await sql`
        SELECT 
          id,
          role,
          content,
          metadata,
          created_at
        FROM messages
        WHERE conversation_id = ${conversationId}
        ORDER BY created_at ASC
        LIMIT ${limit} OFFSET ${offset}
      `;

      // 캐시에 저장
      await CacheService.setConversationCache(conversationId.toString(), messages);
    }

    return NextResponse.json({
      success: true,
      data: {
        conversation: conversation[0],
        messages: messages,
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

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/database';
import { CacheService } from '@/lib/kv';
import { GPTService } from '@/lib/openai';
import { ChatRequestSchema, ChatResponse } from '@/lib/validation';

export const runtime = 'edge';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = ChatRequestSchema.parse(body);

    const { userId, message, conversationId, model, temperature, maxTokens } = validatedData;

    // Rate limiting 체크
    const rateLimit = await CacheService.checkRateLimit(userId, 100, 3600);
    if (!rateLimit.allowed) {
      return NextResponse.json({
        success: false,
        error: 'Rate limit exceeded. Please try again later.',
      }, { status: 429 });
    }

    let currentConversationId = conversationId;

    // 새 대화 시작 또는 기존 대화 확인
    if (!currentConversationId) {
      const newConversation = await sql`
        INSERT INTO conversations (user_id, session_id, title)
        VALUES (${userId}, ${crypto.randomUUID()}, ${message.substring(0, 50)})
        RETURNING id
      `;
      currentConversationId = newConversation[0].id;
    }

    // 기존 메시지들 가져오기 (캐시에서 먼저 확인)
    let messages = await CacheService.getConversationCache(currentConversationId!.toString());
    
    if (!messages) {
      const dbMessages = await sql`
        SELECT role, content, metadata
        FROM messages
        WHERE conversation_id = ${currentConversationId!}
        ORDER BY created_at ASC
      `;
      messages = dbMessages;
      await CacheService.setConversationCache(currentConversationId!.toString(), messages);
    }

    // 사용자 메시지 추가
    const userMessage = { role: 'user', content: message };
    messages.push(userMessage);

    // 사용자 메시지를 DB에 저장
    const userMessageResult = await sql`
      INSERT INTO messages (conversation_id, role, content)
      VALUES (${currentConversationId!}, 'user', ${message})
      RETURNING id
    `;

    // OpenAI API 호출
    const gptResponse = await GPTService.createChatCompletion(messages, {
      model: model || 'gpt-3.5-turbo',
      temperature: temperature || 0.7,
      max_tokens: maxTokens || 1000,
    });

    const assistantMessage = (gptResponse as any).choices[0].message.content;
    const usage = (gptResponse as any).usage;

    // 어시스턴트 메시지를 DB에 저장
    const assistantMessageResult = await sql`
      INSERT INTO messages (conversation_id, role, content, metadata)
      VALUES (${currentConversationId!}, 'assistant', ${assistantMessage}, ${JSON.stringify({ usage })})
      RETURNING id
    `;

    // 캐시 업데이트
    messages.push({ role: 'assistant', content: assistantMessage });
    await CacheService.setConversationCache(currentConversationId!.toString(), messages);

    // API 사용량 추적
    await sql`
      INSERT INTO api_usage (user_id, endpoint, request_count)
      VALUES (${userId}, 'chat', 1)
      ON CONFLICT (user_id, endpoint)
      DO UPDATE SET
        request_count = api_usage.request_count + 1,
        last_request_at = CURRENT_TIMESTAMP
    `;

    const response: ChatResponse = {
      success: true,
      message: 'Chat response generated successfully',
      data: {
        conversationId: currentConversationId!,
        messageId: assistantMessageResult[0].id,
        response: assistantMessage,
        usage: usage ? {
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
        } : undefined,
      },
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Chat API Error:', error);
    
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

import { NextRequest, NextResponse } from 'next/server';
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
      currentConversationId = Date.now(); // 간단한 ID 생성
    }

    // 기존 메시지들 가져오기 (캐시에서 먼저 확인)
    let messages = await CacheService.getConversationCache(currentConversationId.toString());
    
    if (!messages) {
      messages = [];
    }

    // 사용자 메시지 추가
    const userMessage = { role: 'user', content: message };
    messages.push(userMessage);

    // OpenAI API 호출
    const gptResponse = await GPTService.createChatCompletion(messages, {
      model: model || 'gpt-3.5-turbo',
      temperature: temperature || 0.7,
      max_tokens: maxTokens || 1000,
    });

    const assistantMessage = (gptResponse as any).choices[0].message.content;
    const usage = (gptResponse as any).usage;

    // 어시스턴트 메시지를 캐시에 추가
    messages.push({ role: 'assistant', content: assistantMessage });

    // 캐시 업데이트
    await CacheService.setConversationCache(currentConversationId.toString(), messages);

    // API 사용량 추적 (Redis에 저장)
    await CacheService.setUserSession(userId, {
      lastRequest: new Date().toISOString(),
      requestCount: (await CacheService.getUserSession(userId))?.requestCount + 1 || 1
    });

    const response: ChatResponse = {
      success: true,
      message: 'Chat response generated successfully',
      data: {
        conversationId: currentConversationId,
        messageId: Date.now(), // 간단한 ID 생성
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
    console.error('Chat API error:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to process chat request',
    }, { status: 500 });
  }
}
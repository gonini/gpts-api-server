import { z } from 'zod';

// API 요청 스키마들
export const CreateUserSchema = z.object({
  userId: z.string().min(1).max(255),
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().optional(),
});

export const CreateConversationSchema = z.object({
  userId: z.string().min(1).max(255),
  title: z.string().max(500).optional(),
});

export const SendMessageSchema = z.object({
  conversationId: z.number().int().positive(),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1),
  metadata: z.record(z.any()).optional(),
});

export const ChatRequestSchema = z.object({
  userId: z.string().min(1).max(255),
  message: z.string().min(1),
  conversationId: z.number().int().positive().optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(4000).optional(),
});

// API 응답 스키마들
export const ApiResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  data: z.any().optional(),
  error: z.string().optional(),
});

export const ChatResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  data: z.object({
    conversationId: z.number(),
    messageId: z.number(),
    response: z.string(),
    usage: z.object({
      promptTokens: z.number(),
      completionTokens: z.number(),
      totalTokens: z.number(),
    }).optional(),
  }).optional(),
  error: z.string().optional(),
});

// 타입 추출
export type CreateUserRequest = z.infer<typeof CreateUserSchema>;
export type CreateConversationRequest = z.infer<typeof CreateConversationSchema>;
export type SendMessageRequest = z.infer<typeof SendMessageSchema>;
export type ChatRequest = z.infer<typeof ChatRequestSchema>;
export type ApiResponse = z.infer<typeof ApiResponseSchema>;
export type ChatResponse = z.infer<typeof ChatResponseSchema>;

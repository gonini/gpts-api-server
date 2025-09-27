import OpenAI from 'openai';

// 환경 변수가 없을 때는 더미 API 키 사용
const apiKey = process.env.OPENAI_API_KEY || 'dummy-key';

export const openai = new OpenAI({
  apiKey,
});

// GPT API 호출 헬퍼 함수들
export class GPTService {
  static async createChatCompletion(messages: any[], options: {
    model?: string;
    temperature?: number;
    max_tokens?: number;
    stream?: boolean;
  } = {}) {
    const {
      model = 'gpt-3.5-turbo',
      temperature = 0.7,
      max_tokens = 1000,
      stream = false
    } = options;

    try {
      const response = await openai.chat.completions.create({
        model,
        messages,
        temperature,
        max_tokens,
        stream
      });

      return response;
    } catch (error) {
      console.error('OpenAI API Error:', error);
      throw new Error('Failed to generate response from OpenAI');
    }
  }

  static async createEmbedding(text: string, model: string = 'text-embedding-ada-002') {
    try {
      const response = await openai.embeddings.create({
        model,
        input: text
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error('OpenAI Embedding Error:', error);
      throw new Error('Failed to create embedding');
    }
  }

  static async moderateContent(text: string) {
    try {
      const response = await openai.moderations.create({
        input: text
      });

      return response.results[0];
    } catch (error) {
      console.error('OpenAI Moderation Error:', error);
      throw new Error('Failed to moderate content');
    }
  }
}

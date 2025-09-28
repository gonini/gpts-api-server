import { z } from 'zod';

// 외부 API 응답 스키마
export const PolygonPriceSchema = z.object({
  ticker: z.string(),
  resultsCount: z.number(),
  results: z.array(z.object({
    t: z.number(), // timestamp in ms
    c: z.number(), // close price
  })),
  adjusted: z.boolean(),
});

export const FinnhubEarningsSchema = z.object({
  earningsCalendar: z.array(z.object({
    symbol: z.string(),
    date: z.string(),
    epsActual: z.number().nullable(),
    revenueActual: z.number().nullable(),
    time: z.string().nullable(),
  })),
});

// 내부 표준화된 타입
export type PriceData = {
  date: string; // YYYY-MM-DD
  adjClose: number;
};

export type EarningsRow = {
  date: string; // YYYY-MM-DD
  when: 'bmo' | 'amc' | 'dmh' | 'unknown';
  eps: number | null;
  revenue: number | null;
  fiscalQ?: string;
};

export type Breakpoint = {
  announceDate: string;
  when: 'bmo' | 'amc' | 'dmh' | 'unknown';
  epsYoY?: number;
  revYoY?: number;
  eps?: number | null;
  revenue?: number | null;
};

export type CARResult = {
  car: number;
  ret_sum: number;
  bench_sum: number;
};

export type AnalysisSegment = {
  label: string;
  earnings: {
    date: string;
    when: 'bmo' | 'amc' | 'dmh' | 'unknown';
    eps: number | null;
    eps_yoy: number | null;
    rev_yoy: number | null;
  };
  period: {
    start: string;
    end: string;
  };
  price_reaction: {
    window: string;
    car: number;
    ret_sum: number;
    bench_sum: number;
  };
  source_urls: string[];
};

export type AnalysisResponse = {
  ticker: string;
  as_of: string;
  segments: AnalysisSegment[];
  notes: string[];
};

// 요청 스키마
export const AnalysisRequestSchema = z.object({
  ticker: z.string().min(1).max(10),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type AnalysisRequest = z.infer<typeof AnalysisRequestSchema>;

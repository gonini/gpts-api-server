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
    time: z.string().optional(),
    hour: z.string().optional(),
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

export type EarningsCalendarRow = {
  date: string;                    // event date (ISO yyyy-mm-dd)
  epsActual: number | null;
  epsEstimate: number | null;
  hour: 'amc' | 'bmo' | 'dmt' | null;
  quarter: 1 | 2 | 3 | 4 | null;
  revenueActual: number | null;
  revenueEstimate: number | null;
  symbol: string;
  year: number | null;
};

export type EarningsCalendarResponse = {
  earningsCalendar: EarningsCalendarRow[];
};

export type Breakpoint = {
  announceDate: string;
  when: 'bmo' | 'amc' | 'dmh' | 'unknown';
  epsYoY?: number;
  revYoY?: number;
  eps?: number | null;
  revenue?: number | null;
  flags?: {
    eps_yoy_nm?: true;
    rev_yoy_nm?: true;
  };
};

export type CARResult = {
  car: number;
  ret_sum: number;
  bench_sum: number;
};

export type AnalysisSegment = {
  label: string;
  label_with_window?: string;
  day0?: string;
  earnings: {
    date: string;
    when: 'bmo' | 'amc' | 'dmh' | 'unknown';
    eps: number | null;
    eps_basis?: 'GAAP_diluted';
    split_adjusted?: boolean;
    eps_yoy: number | null;
    rev_yoy: number | null;
    flags?: {
      eps_yoy_nm?: true;
      rev_yoy_nm?: true;
      eps_yoy_extreme?: true;
    };
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
    window_days?: number;
    car_tstat?: number;
    market_model_used?: boolean;
    alpha_beta?: { alpha: number; beta: number; n: number };
    flags?: {
      partial?: true;
      short_window?: true;
    };
  };
  source_urls: string[];
  data_quality?: {
    event_date_source: '8-K_ex99' | 'filed_at' | 'period_of_report';
    event_date_corrected: boolean;
  };
  overlap_flag?: boolean;
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

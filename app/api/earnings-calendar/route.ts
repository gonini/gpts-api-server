// app/api/earnings-calendar/route.ts
import { NextResponse } from 'next/server';
import { fetchEarningsCalendar } from '@/lib/external/sec-edgar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const ticker = String(searchParams.get('ticker') || '').trim();
    const from = String(searchParams.get('from') || '1900-01-01');
    const to   = String(searchParams.get('to')   || new Date().toISOString().slice(0,10));

    if (!ticker) return NextResponse.json({ success:false, error:'ticker is required' }, { status:400 });

    const data = await fetchEarningsCalendar(ticker, from, to);
    // Finnhub-compatible envelope
    return NextResponse.json({ success:true, data }, { status:200 });
  } catch (e: any) {
    return NextResponse.json({ success:false, error: e?.message || 'internal error' }, { status:500 });
  }
}

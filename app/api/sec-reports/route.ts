import { NextRequest, NextResponse } from 'next/server';
import { fetchAllSECReports } from '@/lib/external/sec-edgar';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get('ticker');
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    // 필수 파라미터 검증
    if (!ticker) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'ticker parameter is required' 
        },
        { status: 400 }
      );
    }

    if (!from) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'from parameter is required' 
        },
        { status: 400 }
      );
    }

    if (!to) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'to parameter is required' 
        },
        { status: 400 }
      );
    }

    // 날짜 형식 검증
    const fromDate = new Date(from);
    const toDate = new Date(to);
    
    if (isNaN(fromDate.getTime())) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid from date format. Use YYYY-MM-DD' 
        },
        { status: 400 }
      );
    }

    if (isNaN(toDate.getTime())) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid to date format. Use YYYY-MM-DD' 
        },
        { status: 400 }
      );
    }

    if (fromDate > toDate) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'from date must be before to date' 
        },
        { status: 400 }
      );
    }

    console.log(`[SEC Reports API] Fetching reports for ${ticker} from ${from} to ${to}`);

    // SEC EDGAR 보고서 조회
    const reports = await fetchAllSECReports(ticker.toUpperCase(), from, to);

    console.log(`[SEC Reports API] Found ${reports.length} reports for ${ticker}`);

    return NextResponse.json({
      success: true,
      data: {
        ticker: ticker.toUpperCase(),
        from,
        to,
        total_reports: reports.length,
        reports: reports,
        metadata: {
          timestamp: new Date().toISOString(),
          source: 'SEC EDGAR',
          api_version: '1.0.0'
        }
      }
    });

  } catch (error) {
    console.error('[SEC Reports API] Error:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Internal server error',
        data: null
      },
      { status: 500 }
    );
  }
}

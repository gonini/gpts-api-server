import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  try {
    const apiKey = process.env.POLYGON_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'POLYGON_API_KEY not configured' }, { status: 500 });
    }

    const url = `https://api.polygon.io/v2/aggs/ticker/AAPL/range/1/day/2024-01-01/2024-01-31?adjusted=true&sort=asc&limit=50000&apiKey=${apiKey}`;
    
    console.log('Testing Polygon API with URL:', url);
    
    const response = await fetch(url);
    console.log('Response status:', response.status);
    
    if (!response.ok) {
      return NextResponse.json({ 
        error: `HTTP ${response.status}`,
        status: response.status 
      }, { status: response.status });
    }

    const data = await response.json();
    console.log('Response data:', JSON.stringify(data, null, 2));
    
    return NextResponse.json({
      success: true,
      data: {
        ticker: data.ticker,
        resultsCount: data.resultsCount,
        resultsLength: data.results?.length || 0,
        firstResult: data.results?.[0] || null,
      }
    });

  } catch (error) {
    console.error('Test error:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}

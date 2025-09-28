import { EarningsRow, Breakpoint } from '@/lib/core/schema';

export function detectBreakpoints(rows: EarningsRow[]): Breakpoint[] {
  const breakpoints: Breakpoint[] = [];
  
  console.log('=== Breakpoint Detection Debug ===');
  console.log('Input earnings rows:', JSON.stringify(rows, null, 2));
  
  // 미래 날짜 필터링 (과거 데이터만 처리)
  const today = new Date();
  const pastRows = rows.filter(row => {
    const rowDate = new Date(row.date);
    const isPast = rowDate <= today;
    if (!isPast) {
      console.log(`Filtering out future data: ${row.date} (current: ${today.toISOString().split('T')[0]})`);
    }
    return isPast;
  });
  
  console.log(`Filtered past rows: ${pastRows.length} out of ${rows.length}`);
  
  // 분기별로 정렬 (최신순)
  const sortedRows = [...pastRows].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  console.log('Sorted rows:', JSON.stringify(sortedRows, null, 2));
  
  for (let i = 0; i < sortedRows.length; i++) {
    const current = sortedRows[i];
    console.log(`\nProcessing row ${i}:`, JSON.stringify(current, null, 2));
    
    // 이전 분기 데이터 찾기 (YoY 계산용)
    let previous: EarningsRow | null = null;
    let previousIndex = -1;
    let comparisonType = '';
    
    // 1. 먼저 정확한 1년 전 데이터 찾기 (같은 분기)
    const currentYear = new Date(current.date).getFullYear();
    const currentMonth = new Date(current.date).getMonth();
    
    for (let j = i + 1; j < sortedRows.length; j++) {
      const candidate = sortedRows[j];
      const candidateYear = new Date(candidate.date).getFullYear();
      const candidateMonth = new Date(candidate.date).getMonth();
      
      // 같은 월의 1년 전 데이터 찾기
      if (candidateYear === currentYear - 1 && candidateMonth === currentMonth) {
        previous = candidate;
        previousIndex = j;
        comparisonType = 'YoY (same quarter)';
        break;
      }
    }
    
    // 2. 1년 전 데이터가 없으면 4분기 전 데이터 찾기
    if (!previous && i + 4 < sortedRows.length) {
      previous = sortedRows[i + 4];
      previousIndex = i + 4;
      comparisonType = 'QoQ (4 quarters ago)';
    }
    
    // 3. 4분기 전 데이터도 없으면 이전 분기 데이터 사용
    if (!previous && i + 1 < sortedRows.length) {
      previous = sortedRows[i + 1];
      previousIndex = i + 1;
      comparisonType = 'QoQ (previous quarter)';
    }
    
    if (!previous) {
      console.log(`Skipping row ${i}: No previous data found for comparison`);
      continue;
    }
    console.log(`Previous data (${comparisonType}, row ${previousIndex}):`, JSON.stringify(previous, null, 2));
    
    // EPS YoY 계산
    let epsYoY: number | undefined;
    if (current.eps !== null && previous.eps !== null && previous.eps !== 0) {
      epsYoY = (current.eps / previous.eps) - 1;
      console.log(`EPS YoY calculation: ${current.eps} / ${previous.eps} - 1 = ${epsYoY} (${(epsYoY * 100).toFixed(2)}%)`);
    } else {
      console.log(`EPS YoY calculation skipped: current.eps=${current.eps}, previous.eps=${previous.eps}`);
    }
    
    // Revenue YoY 계산
    let revYoY: number | undefined;
    if (current.revenue !== null && previous.revenue !== null && previous.revenue !== 0) {
      revYoY = (current.revenue / previous.revenue) - 1;
      console.log(`Revenue YoY calculation: ${current.revenue} / ${previous.revenue} - 1 = ${revYoY} (${(revYoY * 100).toFixed(2)}%)`);
    } else {
      console.log(`Revenue YoY calculation skipped: current.revenue=${current.revenue}, previous.revenue=${previous.revenue}`);
    }
    
    // 변곡 조건 확인 (현실적인 임계값)
    const isEpsBreakpoint = epsYoY !== undefined && Math.abs(epsYoY) >= 0.05; // 5% 이상
    const isRevBreakpoint = revYoY !== undefined && Math.abs(revYoY) >= 0.05; // 5% 이상
    
    console.log(`Breakpoint check: EPS=${isEpsBreakpoint} (${epsYoY}), Revenue=${isRevBreakpoint} (${revYoY})`);
    
    if (isEpsBreakpoint || isRevBreakpoint) {
      const breakpoint = {
        announceDate: current.date,
        when: current.when,
        epsYoY,
        revYoY,
        eps: current.eps,
        revenue: current.revenue,
      };
      console.log('*** BREAKPOINT DETECTED ***', JSON.stringify(breakpoint, null, 2));
      breakpoints.push(breakpoint);
    }
  }
  
  console.log(`\n=== Final breakpoints: ${breakpoints.length} ===`);
  console.log(JSON.stringify(breakpoints, null, 2));
  
  return breakpoints;
}

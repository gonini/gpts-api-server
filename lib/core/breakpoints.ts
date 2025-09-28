import { EarningsRow, Breakpoint } from '@/lib/core/schema';

export function detectBreakpoints(rows: EarningsRow[]): Breakpoint[] {
  const breakpoints: Breakpoint[] = [];
  
  // 분기별로 정렬 (최신순)
  const sortedRows = [...rows].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  
  for (let i = 0; i < sortedRows.length; i++) {
    const current = sortedRows[i];
    
    // 4분기 전 데이터가 있는지 확인 (YoY 계산용)
    if (i + 4 >= sortedRows.length) continue;
    
    const previous = sortedRows[i + 4];
    
    // EPS YoY 계산
    let epsYoY: number | undefined;
    if (current.eps !== null && previous.eps !== null && previous.eps !== 0) {
      epsYoY = (current.eps / previous.eps) - 1;
    }
    
    // Revenue YoY 계산
    let revYoY: number | undefined;
    if (current.revenue !== null && previous.revenue !== null && previous.revenue !== 0) {
      revYoY = (current.revenue / previous.revenue) - 1;
    }
    
    // 변곡 조건 확인
    const isEpsBreakpoint = epsYoY !== undefined && Math.abs(epsYoY) >= 0.20;
    const isRevBreakpoint = revYoY !== undefined && Math.abs(revYoY) >= 0.15;
    
    if (isEpsBreakpoint || isRevBreakpoint) {
      breakpoints.push({
        announceDate: current.date,
        when: current.when,
        epsYoY,
        revYoY,
        eps: current.eps,
        revenue: current.revenue,
      });
    }
  }
  
  return breakpoints;
}

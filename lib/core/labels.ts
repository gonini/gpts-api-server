// lib/core/labels.ts

export function formatPercent(p: number | null | undefined): string {
  if (typeof p !== 'number' || !isFinite(p)) return '—';
  const sign = p >= 0 ? '+' : '';
  return `${sign}${(p * 100).toFixed(0)}%`;
}

export function buildLabelWithWindow(
  dateISO: string,
  epsYoY: number | null | undefined,
  revYoY: number | null | undefined,
  windowLabel: string,
  car: number | null | undefined
): string {
  const parts: string[] = [dateISO];
  if (typeof epsYoY === 'number') parts.push(`EPS YoY ${formatPercent(epsYoY)}`);
  else if (epsYoY === null) parts.push(`EPS YoY —`);
  if (typeof revYoY === 'number') parts.push(`Rev YoY ${formatPercent(revYoY)}`);
  // append CAR if available
  if (typeof car === 'number') {
    const sign = car >= 0 ? '+' : '';
    parts.push(`CAR${windowLabel} ${sign}${(car * 100).toFixed(1)}%`);
  }
  return parts.join(' • ');
}

export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const as = new Date(aStart).getTime();
  const ae = new Date(aEnd).getTime();
  const bs = new Date(bStart).getTime();
  const be = new Date(bEnd).getTime();
  if ([as, ae, bs, be].some(isNaN)) return false;
  return Math.max(as, bs) <= Math.min(ae, be);
}


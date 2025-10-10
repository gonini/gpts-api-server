// Lightweight, offline symbol alias + event snapshot. Extend over time.

const OFFLINE_ALIASES: Record<string, string[]> = {
  // Dual-class examples
  'GOOGL': ['GOOG'],
  'GOOG': ['GOOGL'],
  'BRK.B': ['BRK-B', 'BRK.B'],
  'BRK-B': ['BRK.B', 'BRK-B'],
  'BRK.A': ['BRK-A', 'BRK.A'],
  'BRK-A': ['BRK.A', 'BRK-A'],
  'BF.B': ['BF-B', 'BF.B'],
  'BF-B': ['BF.B', 'BF-B'],
  'HEI.A': ['HEI-A', 'HEI.A'],
  'HEI-A': ['HEI.A', 'HEI-A'],
  'RDS.A': ['RDS-A', 'SHEL'],
  'RDS-A': ['RDS.A', 'SHEL'],
  'RDS.B': ['RDS-B', 'SHEL'],
  'RDS-B': ['RDS.B', 'SHEL'],
  // Rebrands
  'META': ['FB'],
  'FB': ['META'],
  'SHEL': ['RDS.A', 'RDS.B'],
  'FOXA': ['FOX'],
  'FOX': ['FOXA'],
};

// Known cutover events (date in YYYY-MM-DD). Before cutover, prefer preferred_before.
const OFFLINE_EVENTS: Record<string, { cutover?: string; preferred_before?: string }> = {
  'GOOGL': { cutover: '2014-04-03', preferred_before: 'GOOG' },
};

export function getOfflineAliases(symbol: string): string[] {
  const up = symbol.toUpperCase();
  const out = new Set<string>([up]);
  const push = (s: string) => out.add(s.toUpperCase());
  const direct = OFFLINE_ALIASES[up] || [];
  for (const a of direct) push(a);
  // symmetric
  for (const [k, v] of Object.entries(OFFLINE_ALIASES)) {
    if (v.map(x => x.toUpperCase()).includes(up)) push(k);
  }
  return Array.from(out);
}

// Generate simple punctuation variants for provider retry
export function providerNormalizeCandidates(symbol: string, provider: 'alphavantage' | 'yahoo' | 'finnhub'): string[] {
  const up = symbol.toUpperCase();
  const variants = new Set<string>([up]);
  const dot = up.replace(/-/g, '.');
  const hyph = up.replace(/\./g, '-');
  // class suffix detection (A/B/C) with or without separators
  const m = up.match(/^([A-Z0-9]+?)([\.-])([ABC])$/);
  if (m) {
    const base = m[1], cls = m[3];
    variants.add(`${base}${cls}`); // no separator
  } else {
    const m2 = up.match(/^([A-Z0-9]+)([ABC])$/);
    if (m2) {
      const base = m2[1], cls = m2[2];
      variants.add(`${base}.${cls}`);
      variants.add(`${base}-${cls}`);
    }
  }
  // Alpha Vantage commonly uses dot for classes
  if (provider === 'alphavantage') {
    variants.add(dot);
  }
  // Yahoo commonly uses hyphen
  if (provider === 'yahoo') {
    variants.add(hyph);
  }
  // Finnhub can accept both in many cases; keep both
  if (provider === 'finnhub') {
    variants.add(dot);
    variants.add(hyph);
  }
  return Array.from(variants);
}

export function orderAliasesByCutover(ticker: string, aliases: string[], fromISO: string, toISO: string): string[] {
  const up = ticker.toUpperCase();
  const ev = OFFLINE_EVENTS[up];
  if (!ev?.cutover || !ev?.preferred_before) return aliases;
  try {
    const to = new Date(toISO).getTime();
    const cut = new Date(ev.cutover).getTime();
    if (!isNaN(to) && !isNaN(cut) && to < cut) {
      // move preferred_before to front if present
      const preferred = ev.preferred_before.toUpperCase();
      const rest = aliases.filter(a => a.toUpperCase() !== preferred);
      if (aliases.map(a => a.toUpperCase()).includes(preferred)) {
        return [preferred, ...rest];
      }
    }
  } catch {}
  return aliases;
}



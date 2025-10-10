// lib/core/tradingCalendar.ts
// Minimal ET trading calendar helpers (weekend snap). Holidays optional.

export type SnapRule = 'same' | 'next' | 'prev';

export function snapToTradingDayET(dateET: Date, rule: SnapRule): Date {
  // Treat input as ET date (no tz conversion here). Snap weekends + minimal NYSE holidays.
  let d = new Date(Date.UTC(dateET.getFullYear(), dateET.getMonth(), dateET.getDate()));
  let day = d.getUTCDay(); // 0 Sun .. 6 Sat

  if (rule === 'same') {
    if (day === 0) return addDaysUTC(d, 1); // Sun -> Mon
    if (day === 6) return addDaysUTC(d, 2); // Sat -> Mon
    d = applyHolidaySnap(d, 'same');
    return d;
  }

  if (rule === 'next') {
    if (day === 5) return addDaysUTC(d, 3); // Fri next -> Mon
    if (day === 6) return addDaysUTC(d, 2); // Sat -> Mon
    if (day === 0) return addDaysUTC(d, 1); // Sun -> Mon
    d = addDaysUTC(d, 1);
    return applyHolidaySnap(d, 'next');
  }

  // prev
  if (day === 1) return addDaysUTC(d, -3); // Mon prev -> Fri
  if (day === 0) return addDaysUTC(d, -2); // Sun -> Fri
  if (day === 6) return addDaysUTC(d, -1); // Sat -> Fri
  d = addDaysUTC(d, -1);
  return applyHolidaySnap(d, 'prev');
}

function addDaysUTC(d: Date, days: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + days);
  return r;
}

// Minimal NYSE holiday set (observed) for snap: New Year (Jan 1), Independence Day (Jul 4), Christmas (Dec 25)
function isMinimalHolidayET(d: Date): boolean {
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  // observe on nearest weekday when on weekend
  const weekday = d.getUTCDay();
  // New Year
  if ((m === 1 && day === 1) || (m === 12 && day === 31 && weekday === 5)) return true; // Jan 1 or Dec 31 (Fri observed)
  // Independence Day
  if ((m === 7 && day === 4) || (m === 7 && day === 5 && weekday === 1) || (m === 7 && day === 3 && weekday === 5)) return true;
  // Christmas
  if ((m === 12 && day === 25) || (m === 12 && day === 26 && weekday === 1) || (m === 12 && day === 24 && weekday === 5)) return true;
  return false;
}

function applyHolidaySnap(d: Date, rule: SnapRule): Date {
  if (!isMinimalHolidayET(d)) return d;
  if (rule === 'prev') {
    let r = addDaysUTC(d, -1);
    while (isMinimalHolidayET(r) || r.getUTCDay() === 0 || r.getUTCDay() === 6) {
      r = addDaysUTC(r, -1);
    }
    return r;
  }
  // same/next -> forward
  let r = addDaysUTC(d, 1);
  while (isMinimalHolidayET(r) || r.getUTCDay() === 0 || r.getUTCDay() === 6) {
    r = addDaysUTC(r, 1);
  }
  return r;
}



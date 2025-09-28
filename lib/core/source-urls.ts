export function buildSourceUrls(
  ticker: string,
  benchTicker: string,
  from: string,
  to: string,
  priceProviderLabel: string
): string[] {
  return [
    `finnhub://calendar/earnings?symbol=${ticker}&from=${from}&to=${to}`,
    `prices://${ticker}?provider=${priceProviderLabel}`,
    `prices://${benchTicker}?provider=${priceProviderLabel}`,
  ];
}

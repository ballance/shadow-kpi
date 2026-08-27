export type DailyClose = { closeCents: number } | { notFound: true };

export interface PriceProvider {
  getDailyClose(symbol: string, date: string): Promise<DailyClose>;
  isTradingDay(date: string): Promise<boolean>;
}

let override: PriceProvider | null = null;

/** Test seam: inject a fake provider. */
export function __setPriceProviderForTests(p: PriceProvider | null) {
  override = p;
}

export function getPriceProvider(): PriceProvider {
  if (override) return override;
  const { PolygonProvider } = require('./polygon') as typeof import('./polygon');
  return new PolygonProvider();
}

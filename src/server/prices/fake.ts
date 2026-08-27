import type { PriceProvider, DailyClose } from './provider';

export class FakePriceProvider implements PriceProvider {
  private closes = new Map<string, number>();
  private tradingDays = new Set<string>();

  setClose(symbol: string, date: string, closeCents: number) {
    this.closes.set(`${symbol.toUpperCase()}:${date}`, closeCents);
    this.tradingDays.add(date);
  }

  setTradingDay(date: string, isTrading = true) {
    if (isTrading) this.tradingDays.add(date); else this.tradingDays.delete(date);
  }

  async getDailyClose(symbol: string, date: string): Promise<DailyClose> {
    const c = this.closes.get(`${symbol.toUpperCase()}:${date}`);
    return c === undefined ? { notFound: true } : { closeCents: c };
  }

  async isTradingDay(date: string): Promise<boolean> {
    return this.tradingDays.has(date);
  }
}

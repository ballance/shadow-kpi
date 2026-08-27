import type { PriceProvider, DailyClose } from './provider';

const BASE = 'https://api.polygon.io';

export class PolygonProvider implements PriceProvider {
  constructor(private apiKey = process.env.POLYGON_API_KEY ?? '') {
    if (!this.apiKey) throw new Error('POLYGON_API_KEY is not set');
  }

  async getDailyClose(symbol: string, date: string): Promise<DailyClose> {
    const url = `${BASE}/v1/open-close/${encodeURIComponent(symbol.toUpperCase())}/${date}?adjusted=true&apiKey=${this.apiKey}`;
    const res = await fetch(url);
    if (res.status === 404) return { notFound: true };
    if (!res.ok) throw new Error(`polygon open-close ${res.status}`);
    const body = (await res.json()) as { status?: string; close?: number };
    if (body.status === 'NOT_FOUND' || typeof body.close !== 'number') return { notFound: true };
    return { closeCents: Math.round(body.close * 100) };
  }

  async isTradingDay(date: string): Promise<boolean> {
    const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
    if (dow === 0 || dow === 6) return false;
    const res = await fetch(`${BASE}/v1/marketstatus/upcoming?apiKey=${this.apiKey}`);
    if (!res.ok) return true;
    const holidays = (await res.json()) as Array<{ date: string; exchange: string; status: string }>;
    const closed = holidays.some((h) => h.date === date && /closed/i.test(h.status));
    return !closed;
  }
}

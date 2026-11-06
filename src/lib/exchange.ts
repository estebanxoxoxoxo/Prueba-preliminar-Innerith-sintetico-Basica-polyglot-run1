/**
 * ExchangeRateService — equivale al @service perNode de la referencia:
 * tabla de cotizaciones en memoria con init (warmup) compartido por todo
 * el proceso. Acá es un singleton de módulo con init lazy.
 */

import { db } from "./db";

/** Cotizaciones expresadas como unidades de USD por 1 unidad de la moneda. */
const DEFAULT_USD_RATES: Record<string, number> = {
  USD: 1,
  EUR: 1.08,
  ARS: 0.001,
};

export class ExchangeRateService {
  private usdRates = new Map<string, number>();
  private ready: Promise<void> | null = null;

  /** Warmup: usa la tabla cacheada en kv ("fx:usd-rates") o los defaults. */
  async init(): Promise<void> {
    const cached = db.kv.get("fx:usd-rates") as Record<string, number> | undefined;
    const rates = cached ?? DEFAULT_USD_RATES;
    this.usdRates.clear();
    for (const [currency, rate] of Object.entries(rates)) {
      this.usdRates.set(currency, rate);
    }
  }

  private ensureInit(): Promise<void> {
    if (!this.ready) this.ready = this.init();
    return this.ready;
  }

  /** amount × usd(from) / usd(to), redondeado a 2 decimales. */
  async convert(amount: number, from: string, to: string): Promise<number> {
    await this.ensureInit();
    if (!Number.isFinite(amount) || amount < 0) throw new Error("amount: número no negativo");

    const fromRate = this.usdRates.get(from);
    const toRate = this.usdRates.get(to);
    if (fromRate === undefined) throw new Error(`Moneda no soportada: ${from}`);
    if (toRate === undefined) throw new Error(`Moneda no soportada: ${to}`);

    return Math.round(((amount * fromRate) / toRate) * 100) / 100;
  }
}

let instance: ExchangeRateService | null = null;

export function getExchangeService(): ExchangeRateService {
  if (!instance) instance = new ExchangeRateService();
  return instance;
}

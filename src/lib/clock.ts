/**
 * Reloj inyectable (equivale a ctx.time del framework de referencia).
 * En tests se congela con setNow/advanceMs; en runtime usa Date.now().
 */

let frozen: number | null = null;

export const clock = {
  now(): number {
    return frozen ?? Date.now();
  },
  setNow(iso: string): void {
    const ms = Date.parse(iso);
    if (Number.isNaN(ms)) throw new Error(`Fecha inválida: ${iso}`);
    frozen = ms;
  },
  advanceMs(ms: number): void {
    // Solo tiene sentido con el reloj congelado; si no lo está, se congela en "ahora".
    frozen = (frozen ?? Date.now()) + ms;
  },
  reset(): void {
    frozen = null;
  },
};

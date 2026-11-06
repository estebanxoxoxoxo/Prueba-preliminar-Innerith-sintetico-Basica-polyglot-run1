/**
 * Setup compartido de los tests de aceptación (port Next.js).
 *
 * En el framework de referencia esto armaba un ctx mock con access patterns
 * y árbol de mods; en el port el estado vive en módulos (db, clock) y alcanza
 * con resetearlos al inicio de cada caso.
 */

import { clock } from "@/lib/clock";
import { db } from "@/lib/db";
import type { Booking } from "@/lib/models";
import { createListing, searchListings } from "@/lib/listings";
import { requestBooking, confirmBooking } from "@/lib/bookings";

export const NOW = "2026-01-01T00:00:00Z";
export const HOST = "host_ana";
export const GUEST = "guest_bruno";

/** Reemplaza a makeApp: limpia el store (incluido kv) y fija el reloj. */
export function resetApp(nowIso: string = NOW): void {
  db.reset();
  clock.setNow(nowIso);
}

/**
 * Normaliza a Promise una llamada que puede ser sync o async, para poder usar
 * `.rejects` / `.resolves` sin depender de la firma exacta de la implementación.
 */
export function attempt<T>(fn: () => T | Promise<T>): Promise<T> {
  return Promise.resolve().then(fn);
}

export const DEFAULT_LISTING = {
  title: "Depto luminoso en Palermo",
  city: "Buenos Aires",
  country: "AR",
  nightlyRate: 100,
  cleaningFee: 20,
  currency: "USD",
  maxGuests: 4,
};

/** Crea un listing y devuelve su id (vía la API pública de la app). */
export async function seedListing(
  overrides: Partial<typeof DEFAULT_LISTING> = {},
  host: string = HOST,
): Promise<string> {
  const input = { ...DEFAULT_LISTING, ...overrides };
  await createListing(host, input);
  const results = await searchListings(input.city, { limit: 100 });
  const created = results.find((r) => r.title === input.title.trim());
  if (!created) throw new Error("seedListing: el listing no apareció en la búsqueda");
  return created.id;
}

/** Crea y confirma una reserva; devuelve su id. */
export async function seedConfirmedBooking(
  listingId: string,
  checkInIso: string,
  checkOutIso: string,
  guests = 2,
  guest: string = GUEST,
): Promise<string> {
  await requestBooking(guest, listingId, checkInIso, checkOutIso, guests);
  const booking = lastBookingRow();
  await confirmBooking(booking.id);
  return booking.id;
}

/** Última fila cruda de Booking en el store (atajo de test). */
export function lastBookingRow(): Booking {
  return db.bookings[db.bookings.length - 1];
}

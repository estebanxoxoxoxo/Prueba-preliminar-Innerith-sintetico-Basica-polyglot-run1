/**
 * Bookings — cotización, reserva con anti-solapamiento, confirmación y
 * cancelación con política de reembolso.
 *
 * Invariantes:
 *  I1. checkOut > checkIn y la estadía es de 1 a 30 noches.
 *  I2. No pueden coexistir dos reservas pending/confirmed solapadas para el
 *      mismo listing (semi-abierto: [checkIn, checkOut)).
 *  I3. Los montos siempre se recalculan server-side desde el listing.
 *  I4. Transiciones válidas: pending→confirmed, pending→expired,
 *      pending|confirmed→cancelled. Ninguna otra.
 */

import { clock } from "./clock";
import { db } from "./db";
import { emit } from "./events";
import type { Booking, BookingStatus, Listing } from "./models";

/** Fee de servicio de la plataforma sobre el subtotal. */
export const SERVICE_FEE_RATE = 0.12;
/** Una reserva pending expira a las 24 h si no se confirma. */
export const PENDING_TTL_MS = 24 * 3600 * 1000;
/** Cancelación con reembolso total hasta 7 días antes del check-in. */
export const FREE_CANCEL_WINDOW_MS = 7 * 24 * 3600 * 1000;

const MS_PER_DAY = 86_400_000;
const MAX_NIGHTS = 30;

/* --------------------------- Lógica pura (I1, I3) ---------------------- */

/** Noches entre dos instantes (ms UTC); trunca como la división bigint de la referencia. */
export function nightsBetween(checkInMs: number, checkOutMs: number): number {
  return Math.trunc((checkOutMs - checkInMs) / MS_PER_DAY);
}

export interface Quote {
  nights: number;
  nightlyRate: number;
  subtotal: number;
  cleaningFee: number;
  serviceFee: number;
  total: number;
  currency: string;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Cálculo de precios. Puro: mismo input → mismo output. */
export function computeQuote(
  nightlyRate: number,
  cleaningFee: number,
  currency: string,
  nights: number,
): Quote {
  const subtotal = round2(nightlyRate * nights);
  const serviceFee = round2(subtotal * SERVICE_FEE_RATE);
  const total = round2(subtotal + cleaningFee + serviceFee);
  return { nights, nightlyRate, subtotal, cleaningFee, serviceFee, total, currency };
}

/** Valida el rango de fechas (I1). Devuelve mensaje de error o null. */
export function validateStayRange(
  checkInMs: number,
  checkOutMs: number,
  nowMs: number,
): string | null {
  if (checkOutMs <= checkInMs) return "checkOut debe ser posterior a checkIn";
  if (checkInMs < nowMs) return "checkIn no puede estar en el pasado";
  const nights = nightsBetween(checkInMs, checkOutMs);
  if (nights < 1) return "la estadía mínima es 1 noche";
  if (nights > MAX_NIGHTS) return `la estadía máxima es ${MAX_NIGHTS} noches`;
  return null;
}

function toMs(iso: string): number {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new Error(`Fecha inválida: ${iso}`);
  return ms;
}

/* --------------------------- Helpers de datos -------------------------- */

/**
 * I2 — solapamiento semi-abierto: [a1,a2) y [b1,b2) se solapan ⇔
 * a1 < b2 AND a2 > b1. Solo bloquean las reservas vivas (pending/confirmed).
 */
function hasOverlap(listingId: string, checkInMs: number, checkOutMs: number): boolean {
  return db.bookings.some(
    (b) =>
      b.listingId === listingId &&
      (b.status === "pending" || b.status === "confirmed") &&
      b.checkIn < checkOutMs &&
      b.checkOut > checkInMs,
  );
}

function loadBookableListing(listingId: string, guests: number): Listing {
  const listing = db.listings.find((l) => l.id === listingId);
  if (!listing) throw new Error("Listing no encontrado");
  if (!listing.active) throw new Error("El listing no está activo");
  const capacity = listing.maxGuests;
  if (guests < 1 || guests > capacity)
    throw new Error(`guests: entre 1 y ${capacity} para este listing`);
  return listing;
}

function findBooking(bookingId: string): Booking {
  const booking = db.bookings.find((b) => b.id === bookingId);
  if (!booking) throw new Error("Reserva no encontrada");
  return booking;
}

/* ------------------------------ Operaciones ---------------------------- */

/** Cotiza una estadía sin reservar. */
export async function quoteStay(
  listingId: string,
  checkInIso: string,
  checkOutIso: string,
  guests: number,
): Promise<Quote> {
  const checkIn = toMs(checkInIso);
  const checkOut = toMs(checkOutIso);

  const rangeError = validateStayRange(checkIn, checkOut, clock.now());
  if (rangeError) throw new Error(rangeError);

  const listing = loadBookableListing(listingId, guests);
  return computeQuote(
    listing.nightlyRate,
    listing.cleaningFee,
    listing.currency,
    nightsBetween(checkIn, checkOut),
  );
}

/**
 * Crea una reserva pending (expira en 24 h si no se confirma).
 * Recalcula montos server-side (I3) y verifica solapamiento (I2).
 */
export async function requestBooking(
  guestId: string,
  listingId: string,
  checkInIso: string,
  checkOutIso: string,
  guests: number,
): Promise<Quote> {
  const checkIn = toMs(checkInIso);
  const checkOut = toMs(checkOutIso);
  const now = clock.now();

  const rangeError = validateStayRange(checkIn, checkOut, now);
  if (rangeError) throw new Error(rangeError);

  const listing = loadBookableListing(listingId, guests);

  if (hasOverlap(listingId, checkIn, checkOut))
    throw new Error("Las fechas se superponen con otra reserva");

  const quote = computeQuote(
    listing.nightlyRate,
    listing.cleaningFee,
    listing.currency,
    nightsBetween(checkIn, checkOut),
  );

  // En una DB real, chequeo + insert deberían ir en una transacción (o con
  // una exclusion constraint) para que I2 resista concurrencia.
  db.bookings.push({
    id: db.genId("bkg"),
    listingId,
    guestId,
    checkIn,
    checkOut,
    guests,
    nights: quote.nights,
    subtotal: quote.subtotal,
    cleaningFee: quote.cleaningFee,
    serviceFee: quote.serviceFee,
    total: quote.total,
    currency: quote.currency,
    status: "pending" satisfies BookingStatus,
    expiresAt: now + PENDING_TTL_MS,
    createdAt: now,
    updatedAt: now,
  });

  return quote;
}

/**
 * Confirma una reserva pending no expirada (I4) y emite "bookings.confirmed".
 * En la referencia la emisión la hace el runtime; acá es explícita.
 */
export async function confirmBooking(bookingId: string): Promise<void> {
  const booking = findBooking(bookingId);

  if (booking.status !== "pending")
    throw new Error(`Solo se confirma una reserva pending (actual: ${booking.status})`);

  const now = clock.now();
  if (booking.expiresAt !== undefined && booking.expiresAt < now)
    throw new Error("La reserva expiró; volvé a solicitarla");

  booking.status = "confirmed";
  booking.updatedAt = now;

  const listing = db.listings.find((l) => l.id === booking.listingId);
  await emit("bookings.confirmed", {
    bookingId: booking.id,
    listingId: booking.listingId,
    guestId: booking.guestId,
    hostId: listing?.hostId ?? "",
    total: booking.total,
    currency: booking.currency,
    city: listing?.city ?? "",
  });
}

/**
 * Cancela una reserva del guest (I4): 100% de reembolso si faltan más de
 * 7 días para el check-in, 50% si no (política fija).
 */
export async function cancelBooking(
  guestId: string,
  bookingId: string,
): Promise<{ refundPct: number; amount: number }> {
  const booking = findBooking(bookingId);
  if (booking.guestId !== guestId) throw new Error("Solo el guest puede cancelar su reserva");

  if (booking.status !== "pending" && booking.status !== "confirmed")
    throw new Error(`No se puede cancelar una reserva ${booking.status}`);

  const now = clock.now();
  if (booking.checkIn <= now) throw new Error("La estadía ya comenzó: no se puede cancelar");

  const refundPct = booking.checkIn - now > FREE_CANCEL_WINDOW_MS ? 100 : 50;

  booking.status = "cancelled";
  booking.updatedAt = now;

  await emit("bookings.cancelled", {
    bookingId: booking.id,
    listingId: booking.listingId,
    guestId: booking.guestId,
    refundPct,
  });

  return { refundPct, amount: round2((booking.total * refundPct) / 100) };
}

/** Reservas de un guest, check-in más reciente primero. */
export async function myBookings(guestId: string): Promise<Booking[]> {
  return db.bookings
    .filter((b) => b.guestId === guestId)
    .sort((a, b) => b.checkIn - a.checkIn)
    .slice(0, 100)
    .map((b) => ({ ...b }));
}

/**
 * I4 — pending→expired. En la referencia es un @cron cada 15 minutos; acá lo
 * dispara /api/cron/expire. Las expiradas dejan de bloquear el solapamiento.
 */
export async function expirePendingBookings(): Promise<void> {
  const now = clock.now();
  for (const b of db.bookings) {
    if (b.status === "pending" && b.expiresAt !== undefined && b.expiresAt < now) {
      b.status = "expired";
      b.updatedAt = now;
    }
  }
}

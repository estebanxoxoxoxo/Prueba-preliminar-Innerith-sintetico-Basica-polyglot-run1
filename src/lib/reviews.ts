/**
 * Reviews — una review por reserva completada, con recálculo incremental
 * del rating del listing.
 *
 * Invariantes:
 *  R1. rating entero en 1..5.
 *  R2. Solo el guest de una reserva confirmed y ya finalizada
 *      (checkOut < now) puede reseñar.
 *  R3. A lo sumo una review por booking.
 *  R4. ratingAvg = promedio de todas las reviews, incremental:
 *      avg' = (avg·n + rating) / (n+1).
 */

import { clock } from "./clock";
import { db } from "./db";
import type { Review } from "./models";

/** Recálculo incremental del promedio (R4). Puro. */
export function nextAverage(avg: number, count: number, newRating: number): number {
  return Math.round(((avg * count + newRating) / (count + 1)) * 100) / 100;
}

export async function addReview(
  guestId: string,
  bookingId: string,
  rating: number,
  comment: string,
): Promise<void> {
  // R1
  if (!Number.isInteger(rating) || rating < 1 || rating > 5)
    throw new Error("rating: entero entre 1 y 5");
  if (comment.trim().length === 0) throw new Error("comment: requerido");

  // R2
  const booking = db.bookings.find((b) => b.id === bookingId);
  if (!booking) throw new Error("Reserva no encontrada");
  if (booking.guestId !== guestId) throw new Error("Solo el guest de la reserva puede reseñar");
  if (booking.status !== "confirmed") throw new Error("Solo se reseñan reservas confirmadas");
  const now = clock.now();
  if (booking.checkOut >= now) throw new Error("La estadía todavía no terminó");

  // R3 (en una DB real, además, unique index sobre bookingId)
  if (db.reviews.some((r) => r.bookingId === bookingId))
    throw new Error("Esta reserva ya tiene una review");

  const listing = db.listings.find((l) => l.id === booking.listingId);
  if (!listing) throw new Error("Listing de la reserva no encontrado");

  db.reviews.push({
    id: db.genId("rev"),
    listingId: booking.listingId,
    bookingId,
    guestId,
    rating,
    comment: comment.trim(),
    createdAt: now,
    updatedAt: now,
  });

  // R4 — el framework de referencia usa concurrencia optimista
  // (condition ratingCount == n); en Next con una DB real haría falta una
  // transacción (o un UPDATE condicional) para no perder reviews concurrentes.
  listing.ratingAvg = nextAverage(listing.ratingAvg, listing.ratingCount, rating);
  listing.ratingCount += 1;
  listing.updatedAt = now;
}

/** Reviews de un listing, más recientes primero. */
export async function listingReviews(listingId: string): Promise<Review[]> {
  return db.reviews
    .filter((r) => r.listingId === listingId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 50)
    .map((r) => ({ ...r }));
}

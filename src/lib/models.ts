/**
 * StayHub — modelos. Port de los modelos de referencia a TS nativo:
 * tiempos en epoch ms (number), montos en number con 2 decimales.
 */

export type BookingStatus = "pending" | "confirmed" | "cancelled" | "expired";

export interface Listing {
  id: string;
  hostId: string;
  title: string;
  city: string;
  country: string;
  /** Tarifa por noche, en `currency`. */
  nightlyRate: number;
  /** Fee fijo de limpieza por estadía. */
  cleaningFee: number;
  currency: string;
  maxGuests: number;
  /** Promedio de rating (0 cuando no hay reviews). */
  ratingAvg: number;
  ratingCount: number;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Booking {
  id: string;
  listingId: string;
  guestId: string;
  /** Noche de entrada (inclusive), epoch ms UTC. */
  checkIn: number;
  /** Día de salida (exclusive), epoch ms UTC. */
  checkOut: number;
  guests: number;
  nights: number;
  subtotal: number;
  cleaningFee: number;
  serviceFee: number;
  total: number;
  currency: string;
  status: BookingStatus;
  /** Una reserva pending expira si no se confirma antes de este instante. */
  expiresAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface Review {
  id: string;
  listingId: string;
  bookingId: string;
  guestId: string;
  /** Entero 1..5. */
  rating: number;
  comment: string;
  createdAt: number;
  updatedAt: number;
}

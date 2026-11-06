/**
 * Notifications — reacción a eventos de dominio. Los handlers se registran
 * al importar este módulo (una vez por grafo de módulos).
 *
 * Los predicados equivalen a los filtros EDF declarativos del framework de
 * referencia (p.ej. "total >= 1000 AND currency IN ('USD','EUR')"), acá
 * escritos como código y evaluados antes de invocar el handler.
 */

import { db } from "./db";
import { on } from "./events";

export interface BookingConfirmedEvent {
  bookingId: string;
  listingId: string;
  guestId: string;
  hostId: string;
  total: number;
  currency: string;
  city: string;
}

export interface BookingCancelledEvent {
  bookingId: string;
  listingId: string;
  guestId: string;
  refundPct: number;
}

/** Reservas de alto valor en monedas fuertes: alerta a soporte. */
on<BookingConfirmedEvent>(
  "bookings.confirmed",
  (evt) => {
    db.kv.set(`alerts:high-value:${evt.bookingId}`, {
      listingId: evt.listingId,
      total: evt.total,
      currency: evt.currency,
    });
  },
  (p) => p.total >= 1000 && ["USD", "EUR"].includes(p.currency),
);

/** Toda confirmación dispara la notificación al host. */
on<BookingConfirmedEvent>("bookings.confirmed", (evt) => {
  db.kv.set(`notify:host:${evt.hostId}:${evt.bookingId}`, {
    kind: "booking-confirmed",
    bookingId: evt.bookingId,
    city: evt.city,
  });
});

/** Cancelaciones con reembolso parcial: se auditan para disputas. */
on<BookingCancelledEvent>(
  "bookings.cancelled",
  (evt) => {
    db.kv.set(`audit:partial-refund:${evt.bookingId}`, {
      listingId: evt.listingId,
      guestId: evt.guestId,
      refundPct: evt.refundPct,
    });
  },
  (p) => p.refundPct < 100,
);

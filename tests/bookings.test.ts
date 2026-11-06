/**
 * F3 — validación de rango de estadía.
 * F4 — cálculo de precio (fee 12%).
 * F5 — montos recalculados server-side.
 * F6 — anti-solapamiento (rango semi-abierto).
 * F7 — expiración de pending a las 24 h (cron).
 * F8 — transiciones de estado válidas.
 * F9 — política de cancelación (100% / 50% / imposible tras comenzar).
 */

import { describe, it, expect } from "vitest";
import { resetApp, seedListing, lastBookingRow, attempt, GUEST } from "./setup";
import { clock } from "@/lib/clock";
import {
  quoteStay,
  requestBooking,
  confirmBooking,
  cancelBooking,
  expirePendingBookings,
  computeQuote,
  nightsBetween,
} from "@/lib/bookings";

const IN = "2026-02-01T00:00:00Z";
const OUT = "2026-02-04T00:00:00Z"; // 3 noches

describe("F3 — rango de estadía válido", () => {
  it("rechaza checkOut anterior o igual al checkIn", async () => {
    resetApp();
    const id = await seedListing();
    await expect(attempt(() => quoteStay(id, OUT, IN, 2))).rejects.toThrow("posterior");
    await expect(attempt(() => quoteStay(id, IN, IN, 2))).rejects.toThrow("posterior");
  });

  it("rechaza checkIn en el pasado", async () => {
    resetApp("2026-03-01T00:00:00Z");
    const id = await seedListing();
    await expect(attempt(() => quoteStay(id, IN, OUT, 2))).rejects.toThrow("pasado");
  });

  it("rechaza estadías de más de 30 noches", async () => {
    resetApp();
    const id = await seedListing();
    await expect(
      attempt(() => quoteStay(id, "2026-02-01T00:00:00Z", "2026-03-10T00:00:00Z", 2)),
    ).rejects.toThrow("30 noches");
  });

  it("rechaza más huéspedes que la capacidad del listing", async () => {
    resetApp();
    const id = await seedListing(); // maxGuests 4
    await expect(attempt(() => quoteStay(id, IN, OUT, 5))).rejects.toThrow("entre 1 y 4");
  });
});

describe("F4 — precio: rate×noches + limpieza + 12%", () => {
  it("3 noches × $100 + $20 limpieza + 12% service fee = $356", async () => {
    resetApp();
    const id = await seedListing();
    const quote = await quoteStay(id, IN, OUT, 2);

    expect(quote.nights).toBe(3);
    expect(quote.subtotal).toBe(300);
    expect(quote.cleaningFee).toBe(20);
    expect(quote.serviceFee).toBe(36);
    expect(quote.total).toBe(356);
    expect(quote.currency).toBe("USD");
  });

  it("computeQuote es pura y redondea a centavos", () => {
    const q = computeQuote(99.99, 15.5, "EUR", 2);
    expect(q.subtotal).toBe(199.98);
    expect(q.serviceFee).toBe(24.0);
    expect(q.total).toBe(239.48);
    expect(nightsBetween(0, 86_400_000)).toBe(1); // ms (la referencia usa ns bigint)
  });
});

describe("F5 — montos server-side", () => {
  it("la reserva persiste los montos recalculados, no los del cliente", async () => {
    resetApp();
    const id = await seedListing();
    await requestBooking(GUEST, id, IN, OUT, 2);

    const row = lastBookingRow();
    expect(row.subtotal).toBe(300);
    expect(row.serviceFee).toBe(36);
    expect(row.total).toBe(356);
    expect(row.nights).toBe(3);
    expect(row.status).toBe("pending");
    expect(row.expiresAt).toBeDefined();
  });
});

describe("F6 — anti-solapamiento", () => {
  it("rechaza una reserva que se superpone con otra viva", async () => {
    resetApp();
    const id = await seedListing();
    await requestBooking(GUEST, id, IN, OUT, 2);

    await expect(
      attempt(() =>
        requestBooking("otra_guest", id, "2026-02-03T00:00:00Z", "2026-02-06T00:00:00Z", 2),
      ),
    ).rejects.toThrow("superponen");
  });

  it("permite reservas adyacentes (checkOut == siguiente checkIn)", async () => {
    resetApp();
    const id = await seedListing();
    await requestBooking(GUEST, id, IN, OUT, 2);

    await expect(
      attempt(() => requestBooking("otra_guest", id, OUT, "2026-02-06T00:00:00Z", 2)),
    ).resolves.toBeDefined();
  });

  it("una reserva cancelada libera las fechas", async () => {
    resetApp();
    const id = await seedListing();
    await requestBooking(GUEST, id, IN, OUT, 2);
    await cancelBooking(GUEST, lastBookingRow().id);

    await expect(
      attempt(() => requestBooking("otra_guest", id, IN, OUT, 2)),
    ).resolves.toBeDefined();
  });
});

describe("F7 — expiración de pending a las 24 h", () => {
  it("el cron marca expired y libera las fechas; la expirada no se puede confirmar", async () => {
    resetApp();
    const id = await seedListing();
    await requestBooking(GUEST, id, IN, OUT, 2);
    const bookingId = lastBookingRow().id;

    // Antes de las 24 h el cron no toca nada.
    clock.advanceMs(23 * 3600 * 1000);
    await expirePendingBookings();
    expect(lastBookingRow().status).toBe("pending");

    // Pasadas las 24 h, expira.
    clock.advanceMs(2 * 3600 * 1000);
    await expirePendingBookings();
    expect(lastBookingRow().status).toBe("expired");

    // Las fechas quedaron libres y la expirada ya no se confirma.
    await expect(
      attempt(() => requestBooking("otra_guest", id, IN, OUT, 2)),
    ).resolves.toBeDefined();
    await expect(attempt(() => confirmBooking(bookingId))).rejects.toThrow("pending");
  });

  it("una pending vencida (aún sin barrer) tampoco se confirma", async () => {
    resetApp();
    const id = await seedListing();
    await requestBooking(GUEST, id, IN, OUT, 2);

    clock.advanceMs(25 * 3600 * 1000);
    await expect(attempt(() => confirmBooking(lastBookingRow().id))).rejects.toThrow("expiró");
  });
});

describe("F8 — transiciones de estado", () => {
  it("pending → confirmed, y confirmed no se reconfirma", async () => {
    resetApp();
    const id = await seedListing();
    await requestBooking(GUEST, id, IN, OUT, 2);
    const bookingId = lastBookingRow().id;

    await confirmBooking(bookingId);
    expect(lastBookingRow().status).toBe("confirmed");

    await expect(attempt(() => confirmBooking(bookingId))).rejects.toThrow("pending");
  });

  it("una cancelada no se puede volver a cancelar", async () => {
    resetApp();
    const id = await seedListing();
    await requestBooking(GUEST, id, IN, OUT, 2);
    const bookingId = lastBookingRow().id;

    await cancelBooking(GUEST, bookingId);
    await expect(attempt(() => cancelBooking(GUEST, bookingId))).rejects.toThrow("cancelled");
  });

  it("solo el guest de la reserva puede cancelarla", async () => {
    resetApp();
    const id = await seedListing();
    await requestBooking(GUEST, id, IN, OUT, 2);
    await expect(
      attempt(() => cancelBooking("impostor", lastBookingRow().id)),
    ).rejects.toThrow("guest");
  });
});

describe("F9 — política de cancelación", () => {
  it("a más de 7 días del check-in: reembolso 100%", async () => {
    resetApp("2026-01-01T00:00:00Z"); // 31 días antes
    const id = await seedListing();
    await requestBooking(GUEST, id, IN, OUT, 2);

    const result = await cancelBooking(GUEST, lastBookingRow().id);
    expect(result.refundPct).toBe(100);
    expect(result.amount).toBe(356);
  });

  it("a 7 días o menos: reembolso 50%", async () => {
    resetApp("2026-01-29T00:00:00Z"); // 3 días antes
    const id = await seedListing();
    await requestBooking(GUEST, id, IN, OUT, 2);

    const result = await cancelBooking(GUEST, lastBookingRow().id);
    expect(result.refundPct).toBe(50);
    expect(result.amount).toBe(178);
  });

  it("con la estadía comenzada no se cancela", async () => {
    resetApp();
    const id = await seedListing();
    await requestBooking(GUEST, id, IN, OUT, 2);
    const bookingId = lastBookingRow().id;

    clock.setNow("2026-02-02T00:00:00Z"); // mitad de la estadía
    await expect(attempt(() => cancelBooking(GUEST, bookingId))).rejects.toThrow("comenzó");
  });
});

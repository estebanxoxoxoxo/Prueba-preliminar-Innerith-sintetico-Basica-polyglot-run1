/**
 * F10 — solo el guest, con estadía confirmada y terminada, una sola vez.
 * F11 — rating del listing = promedio exacto, mantenido incrementalmente.
 */

import { describe, it, expect } from "vitest";
import { resetApp, seedListing, seedConfirmedBooking, attempt, GUEST } from "./setup";
import { clock } from "@/lib/clock";
import { addReview, listingReviews } from "@/lib/reviews";
import { getListing } from "@/lib/listings";

const IN = "2026-02-01T00:00:00Z";
const OUT = "2026-02-04T00:00:00Z";
const AFTER_STAY = "2026-02-05T00:00:00Z";

describe("F10 — condiciones para reseñar", () => {
  it("rechaza rating fuera de 1..5 y comentario vacío", async () => {
    resetApp();
    const listingId = await seedListing();
    const bookingId = await seedConfirmedBooking(listingId, IN, OUT);
    clock.setNow(AFTER_STAY);

    await expect(attempt(() => addReview(GUEST, bookingId, 0, "x"))).rejects.toThrow("rating");
    await expect(attempt(() => addReview(GUEST, bookingId, 6, "x"))).rejects.toThrow("rating");
    await expect(attempt(() => addReview(GUEST, bookingId, 2.5, "x"))).rejects.toThrow("rating");
    await expect(attempt(() => addReview(GUEST, bookingId, 4, "   "))).rejects.toThrow("comment");
  });

  it("solo puede reseñar el guest de la reserva", async () => {
    resetApp();
    const listingId = await seedListing();
    const bookingId = await seedConfirmedBooking(listingId, IN, OUT);
    clock.setNow(AFTER_STAY);

    await expect(
      attempt(() => addReview("impostor", bookingId, 5, "Genial")),
    ).rejects.toThrow("guest");
  });

  it("no se puede reseñar antes de que termine la estadía", async () => {
    resetApp();
    const listingId = await seedListing();
    const bookingId = await seedConfirmedBooking(listingId, IN, OUT);
    clock.setNow("2026-02-02T00:00:00Z"); // en medio de la estadía

    await expect(
      attempt(() => addReview(GUEST, bookingId, 5, "Genial")),
    ).rejects.toThrow("no terminó");
  });

  it("una reserva se reseña una sola vez", async () => {
    resetApp();
    const listingId = await seedListing();
    const bookingId = await seedConfirmedBooking(listingId, IN, OUT);
    clock.setNow(AFTER_STAY);

    await addReview(GUEST, bookingId, 5, "Excelente ubicación");
    await expect(
      attempt(() => addReview(GUEST, bookingId, 3, "Cambié de idea")),
    ).rejects.toThrow("ya tiene una review");

    const reviews = await listingReviews(listingId);
    expect(reviews).toHaveLength(1);
    expect(reviews[0].comment).toBe("Excelente ubicación");
  });
});

describe("F11 — rating promedio incremental", () => {
  it("dos reviews (5 y 3) dejan ratingAvg 4.00 y ratingCount 2", async () => {
    resetApp();
    const listingId = await seedListing();

    const b1 = await seedConfirmedBooking(listingId, IN, OUT, 2, "guest_uno");
    const b2 = await seedConfirmedBooking(
      listingId,
      "2026-03-01T00:00:00Z",
      "2026-03-03T00:00:00Z",
      2,
      "guest_dos",
    );

    clock.setNow("2026-03-10T00:00:00Z"); // ambas estadías terminadas

    await addReview("guest_uno", b1, 5, "Impecable");
    let listing = await getListing(listingId);
    expect(listing.ratingAvg).toBe(5);
    expect(listing.ratingCount).toBe(1);

    await addReview("guest_dos", b2, 3, "Correcto, algo ruidoso");
    listing = await getListing(listingId);
    expect(listing.ratingAvg).toBe(4);
    expect(listing.ratingCount).toBe(2);
  });
});

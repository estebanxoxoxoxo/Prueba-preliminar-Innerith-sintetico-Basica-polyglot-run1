/**
 * F12 — eventos con filtros (alto valor, auditoría de reembolso parcial).
 * F13 — ExchangeRateService (estado caliente tras init).
 * F14 — home con destacados ordenados por rating, mis viajes.
 * F15 — la UI recibe datos tipados por props.
 */

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { resetApp, seedListing, seedConfirmedBooking, attempt, GUEST } from "./setup";
import { db } from "@/lib/db";
import { emit } from "@/lib/events";

// Importar el módulo registra los handlers de eventos.
import "@/lib/notifications";
import { ExchangeRateService } from "@/lib/exchange";
import { getListing, getFeaturedListings } from "@/lib/listings";
import { myBookings } from "@/lib/bookings";
import * as ListingCardModule from "@/app/components/ListingCard";
import * as SectionTitleModule from "@/app/components/SectionTitle";

// Tolera export default o named export de los componentes.
const ListingCard: any = (ListingCardModule as any).ListingCard ?? (ListingCardModule as any).default;
const SectionTitle: any = (SectionTitleModule as any).SectionTitle ?? (SectionTitleModule as any).default;

const IN = "2026-02-01T00:00:00Z";
const OUT = "2026-02-04T00:00:00Z";

describe("F12 — eventos de dominio con EDF", () => {
  const basePayload = {
    bookingId: "b_1",
    listingId: "l_1",
    guestId: "g_1",
    hostId: "h_1",
    city: "Buenos Aires",
  };

  it("una confirmación de 1500 USD dispara la alerta de alto valor", async () => {
    resetApp();
    await emit("bookings.confirmed", { ...basePayload, total: 1500, currency: "USD" });

    expect(db.kv.get("alerts:high-value:b_1")).toMatchObject({
      total: 1500,
      currency: "USD",
    });
    // El handler sin filtro también corre (notificación al host).
    expect(db.kv.get("notify:host:h_1:b_1")).toMatchObject({
      kind: "booking-confirmed",
    });
  });

  it("500 USD no pasa el filtro de alto valor, pero sí notifica al host", async () => {
    resetApp();
    await emit("bookings.confirmed", { ...basePayload, total: 500, currency: "USD" });

    expect(db.kv.get("alerts:high-value:b_1")).toBeUndefined();
    expect(db.kv.get("notify:host:h_1:b_1")).toBeTruthy();
  });

  it("1500 en moneda fuera de (USD, EUR) no dispara la alerta", async () => {
    resetApp();
    await emit("bookings.confirmed", { ...basePayload, total: 1500, currency: "ARS" });
    expect(db.kv.get("alerts:high-value:b_1")).toBeUndefined();
  });

  it("solo las cancelaciones con reembolso parcial se auditan", async () => {
    resetApp();
    const cancelled = { bookingId: "b_2", listingId: "l_1", guestId: "g_1" };

    await emit("bookings.cancelled", { ...cancelled, refundPct: 50 });
    expect(db.kv.get("audit:partial-refund:b_2")).toMatchObject({ refundPct: 50 });

    await emit("bookings.cancelled", { bookingId: "b_3", listingId: "l_1", guestId: "g_1", refundPct: 100 });
    expect(db.kv.get("audit:partial-refund:b_3")).toBeUndefined();
  });
});

describe("F13 — ExchangeRateService", () => {
  it("convierte vía USD con redondeo a centavos", async () => {
    resetApp();
    const svc = new ExchangeRateService();
    await svc.init();

    expect(await svc.convert(100, "EUR", "USD")).toBe(108);
    expect(await svc.convert(100, "USD", "EUR")).toBe(92.59);
    expect(await svc.convert(100, "USD", "USD")).toBe(100);
  });

  it("rechaza monedas no soportadas y montos inválidos", async () => {
    resetApp();
    const svc = new ExchangeRateService();
    await svc.init();

    await expect(attempt(() => svc.convert(100, "GBP", "USD"))).rejects.toThrow("GBP");
    await expect(attempt(() => svc.convert(-5, "USD", "EUR"))).rejects.toThrow("amount");
  });
});

describe("F14 — actions de UI", () => {
  it("openHome muestra el título y los destacados ordenados por rating", async () => {
    resetApp();
    const peor = await seedListing({ title: "Depto correcto" });
    const mejor = await seedListing({ title: "Depto excelente" });

    // Ratings distintos, seteados mutando directamente el store.
    db.listings.find((l) => l.id === peor)!.ratingAvg = 3.5;
    db.listings.find((l) => l.id === mejor)!.ratingAvg = 4.9;

    const featured = await getFeaturedListings("Buenos Aires", 10);
    expect(featured).toHaveLength(2);
    expect(featured.map((l) => l.title)).toEqual(["Depto excelente", "Depto correcto"]); // mayor rating primero

    const title = renderToStaticMarkup(<SectionTitle title="Destacados en Buenos Aires" />);
    expect(title).toContain("Destacados en Buenos Aires");
    expect(renderToStaticMarkup(<ListingCard listing={featured[0]} />)).toContain("Depto excelente");
    expect(renderToStaticMarkup(<ListingCard listing={featured[1]} />)).toContain("Depto correcto");
  });

  it("openMyTrips lista solo las reservas del usuario de la sesión", async () => {
    resetApp();
    const listingId = await seedListing();
    await seedConfirmedBooking(listingId, IN, OUT, 2, GUEST);
    await seedConfirmedBooking(listingId, "2026-03-01T00:00:00Z", "2026-03-04T00:00:00Z", 2, "otra_persona");

    const trips = await myBookings(GUEST);
    expect(trips).toHaveLength(1); // solo la reserva propia
    expect(trips[0].total).toBe(356);
    expect(trips[0].status).toBe("confirmed");
  });
});

describe("F15 — la UI transporta providers", () => {
  it("las props que llegan al View son tipos de plataforma (valor + valueOf)", async () => {
    // En el framework de referencia esto son Providers con metadata; en Next son
    // primitivos sin reactividad. El equivalente es verificar el tipado plano.
    resetApp();
    const id = await seedListing();
    const listing = await getListing(id);

    expect(typeof listing.title).toBe("string");
    expect(listing.title).toBe("Depto luminoso en Palermo");
    expect(typeof listing.nightlyRate).toBe("number");
    expect(typeof listing.maxGuests).toBe("number");
  });
});

/**
 * F1 — publicación con validación.
 * F2 — búsqueda: solo activos de la ciudad, con filtros.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { resetApp, seedListing, attempt, HOST } from "./setup";
import { createListing, searchListings, deactivateListing, getListing } from "@/lib/listings";

beforeEach(() => resetApp());

describe("F1 — alta de listing con validación", () => {
  it("rechaza título corto", async () => {
    await expect(
      attempt(() =>
        createListing(HOST, {
          title: "Dpto",
          city: "Buenos Aires",
          country: "AR",
          nightlyRate: 100,
          cleaningFee: 20,
          currency: "USD",
          maxGuests: 4,
        }),
      ),
    ).rejects.toThrow("title");
  });

  it("rechaza moneda no soportada", async () => {
    await expect(
      attempt(() =>
        createListing(HOST, {
          title: "Casa con jardín",
          city: "Buenos Aires",
          country: "AR",
          nightlyRate: 100,
          cleaningFee: 20,
          currency: "GBP",
          maxGuests: 4,
        }),
      ),
    ).rejects.toThrow("currency");
  });

  it("rechaza capacidad inválida (0 y 17)", async () => {
    for (const maxGuests of [0, 17]) {
      await expect(
        attempt(() =>
          createListing(HOST, {
            title: "Casa con jardín",
            city: "Buenos Aires",
            country: "AR",
            nightlyRate: 100,
            cleaningFee: 20,
            currency: "USD",
            maxGuests,
          }),
        ),
      ).rejects.toThrow("maxGuests");
    }
  });

  it("un listing válido queda publicado y legible", async () => {
    const id = await seedListing();
    const listing = await getListing(id);
    expect(listing.title).toBe("Depto luminoso en Palermo");
    expect(listing.active).toBe(true);
    expect(listing.ratingCount).toBe(0);
  });
});

describe("F2 — búsqueda por ciudad con filtros", () => {
  it("devuelve solo listings de la ciudad buscada", async () => {
    await seedListing({ title: "Depto en Palermo Soho" });
    await seedListing({ title: "Loft en Montevideo Centro", city: "Montevideo" });

    const ba = await searchListings("Buenos Aires");
    expect(ba).toHaveLength(1);
    expect(ba[0].title).toBe("Depto en Palermo Soho");
  });

  it("filtra por precio máximo y capacidad mínima", async () => {
    await seedListing({ title: "Económico para dos", nightlyRate: 50, maxGuests: 2 });
    await seedListing({ title: "Premium para seis", nightlyRate: 300, maxGuests: 6 });

    const cheap = await searchListings("Buenos Aires", { maxNightly: 100 });
    expect(cheap.map((l) => l.title)).toEqual(["Económico para dos"]);

    const big = await searchListings("Buenos Aires", { minGuests: 4 });
    expect(big.map((l) => l.title)).toEqual(["Premium para seis"]);
  });

  it("un listing desactivado deja de aparecer; solo el host puede desactivar", async () => {
    const id = await seedListing();

    await expect(attempt(() => deactivateListing("otro_host", id))).rejects.toThrow("host");

    await deactivateListing(HOST, id);
    const results = await searchListings("Buenos Aires");
    expect(results).toHaveLength(0);
  });
});

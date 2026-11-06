/**
 * Listings — alta y búsqueda de alojamientos.
 */

import { clock } from "./clock";
import { db } from "./db";
import type { Listing } from "./models";

export interface CreateListingInput {
  title: string;
  city: string;
  country: string;
  nightlyRate: number;
  cleaningFee: number;
  currency: string;
  maxGuests: number;
}

export interface ListingSummary {
  id: string;
  title: string;
  city: string;
  nightlyRate: number;
  currency: string;
  ratingAvg: number;
  ratingCount: number;
}

const SUPPORTED_CURRENCIES = ["USD", "EUR", "ARS"];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function validateListingInput(input: CreateListingInput): string | null {
  if (input.title.trim().length < 5) return "title: mínimo 5 caracteres";
  if (input.city.trim().length === 0) return "city: requerido";
  if (input.nightlyRate <= 0) return "nightlyRate: debe ser > 0";
  if (input.cleaningFee < 0) return "cleaningFee: no puede ser negativo";
  if (!SUPPORTED_CURRENCIES.includes(input.currency))
    return `currency: debe ser una de ${SUPPORTED_CURRENCIES.join(", ")}`;
  if (!Number.isInteger(input.maxGuests) || input.maxGuests < 1 || input.maxGuests > 16)
    return "maxGuests: entero entre 1 y 16";
  return null;
}

/** Alta de un listing. El host queda tomado del parámetro (auth fuera de scope). */
export async function createListing(hostId: string, input: CreateListingInput): Promise<void> {
  const error = validateListingInput(input);
  if (error) throw new Error(`Listing inválido — ${error}`);

  const now = clock.now();
  db.listings.push({
    id: db.genId("lst"),
    hostId,
    title: input.title.trim(),
    city: input.city.trim(),
    country: input.country.trim(),
    nightlyRate: round2(input.nightlyRate),
    cleaningFee: round2(input.cleaningFee),
    currency: input.currency,
    maxGuests: input.maxGuests,
    ratingAvg: 0,
    ratingCount: 0,
    active: true,
    createdAt: now,
    updatedAt: now,
  });
}

/** Lectura directa por id. */
export async function getListing(id: string): Promise<Listing> {
  const listing = db.listings.find((l) => l.id === id);
  if (!listing) throw new Error("Listing no encontrado");
  return { ...listing };
}

/**
 * Búsqueda por ciudad con filtros opcionales. Como en la referencia, el
 * limit se aplica sobre el access pattern (ciudad+activo) ANTES de filtrar
 * por precio y capacidad.
 */
export async function searchListings(
  city: string,
  opts?: { maxNightly?: number; minGuests?: number; limit?: number },
): Promise<ListingSummary[]> {
  const target = city.trim();
  const page = db.listings
    .filter((l) => l.active && l.city === target)
    .slice(0, opts?.limit ?? 50);

  return page
    .filter((l) => {
      if (opts?.maxNightly !== undefined && l.nightlyRate > opts.maxNightly) return false;
      if (opts?.minGuests !== undefined && l.maxGuests < opts.minGuests) return false;
      return true;
    })
    .map((l) => ({
      id: l.id,
      title: l.title,
      city: l.city,
      nightlyRate: l.nightlyRate,
      currency: l.currency,
      ratingAvg: l.ratingAvg,
      ratingCount: l.ratingCount,
    }));
}

/** Desactiva un listing (soft delete): deja de aparecer en búsquedas. */
export async function deactivateListing(hostId: string, id: string): Promise<void> {
  const listing = db.listings.find((l) => l.id === id);
  if (!listing) throw new Error("Listing no encontrado");
  if (listing.hostId !== hostId) throw new Error("Solo el host puede desactivar su listing");
  listing.active = false;
  listing.updatedAt = clock.now();
}

/** Listings activos de una ciudad, mejor rating primero. */
export async function getFeaturedListings(city: string, limit: number): Promise<Listing[]> {
  const target = city.trim();
  return db.listings
    .filter((l) => l.active && l.city === target)
    .sort((a, b) => b.ratingAvg - a.ratingAvg)
    .slice(0, limit)
    .map((l) => ({ ...l }));
}

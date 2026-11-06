/**
 * Store en memoria. Equivale a las capas documents/tables/memory del
 * framework de referencia; en producción sería Prisma/Postgres (y kv, Redis).
 */

import type { Booking, Listing, Review } from "./models";

class Db {
  listings: Listing[] = [];
  bookings: Booking[] = [];
  reviews: Review[] = [];
  kv: Map<string, unknown> = new Map();
  private seq = 0;

  genId(prefix: string): string {
    this.seq += 1;
    return `${prefix}_${this.seq.toString().padStart(6, "0")}`;
  }

  reset(): void {
    this.listings = [];
    this.bookings = [];
    this.reviews = [];
    this.kv = new Map();
    this.seq = 0;
  }
}

export type { Db };

export const db: Db = new Db();
